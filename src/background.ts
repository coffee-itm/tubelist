import { classifyUrl, YT_LINK_PATTERNS } from './lib/url';
import { cleanName, ensureSkipPrefs, getPlaylists, installStoreServer, SAVED_SOURCE_ID } from './lib/store';
import { saveLink, type SaveTarget } from './lib/save';

// Playlist writes are applied here and nowhere else, so two contexts cannot overwrite each other's save.
installStoreServer();

// The extension's own host: `chrome-extension://<id>` in Chrome, `moz-extension://<uuid>` in Firefox,
// where `runtime.id` (the gecko id) is not the host. `runtime.id` in initiatorDomains silently matches
// nothing in Firefox, so the rules look dead there.
const SELF_DOMAIN = new URL(chrome.runtime.getURL('')).hostname;

const HEADER_RULES: chrome.declarativeNetRequest.Rule[] = [
  {
    // InnerTube rejects an extension Origin with 403 (both chrome-extension:// and moz-extension://)
    id: 1,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'set', value: 'https://www.youtube.com' }] },
    condition: { urlFilter: '|https://www.youtube.com/youtubei/', initiatorDomains: [SELF_DOMAIN], resourceTypes: ['xmlhttprequest'] },
  },
  {
    // Watch page refuses framing. The extension opens the first frame; YouTube then reloads that
    // same frame itself (`&themeRefresh=1&theme=dark`), so www.youtube.com must be an allowed
    // initiator too — without it the reload is ERR_BLOCKED_BY_RESPONSE ("refused to connect").
    id: 3,
    priority: 1,
    action: { type: 'modifyHeaders', responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }, { header: 'content-security-policy', operation: 'remove' }] },
    condition: { requestDomains: ['www.youtube.com'], initiatorDomains: [SELF_DOMAIN, 'www.youtube.com'], resourceTypes: ['sub_frame'] },
  },
];

async function installRules(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1, 2, 3], addRules: HEADER_RULES });
}

// The framed watch page's CSP applies to content-script fetches ("Unsafe attempt to load URL … Domains,
// protocols and ports must match"), so the SponsorBlock lookup runs here, where no page policy exists.
// The response shape stays raw: the frame does its own filtering and mapping.
const SB_API = 'https://sponsor.ajay.app/api/skipSegments/';
// POI segments have start == end (a marker, not a range) and this frame only ever skips ranges.
const SB_ACTIONS = JSON.stringify(['skip']);

type SegmentsRequest = { type: 'sb:segments'; prefix: string; categories: string[] };

chrome.runtime.onMessage.addListener((msg: SegmentsRequest, _sender, respond: (r: unknown) => void) => {
  if (msg?.type !== 'sb:segments') return;
  const query = `?categories=${encodeURIComponent(JSON.stringify(msg.categories))}&actionTypes=${encodeURIComponent(SB_ACTIONS)}`;
  fetch(SB_API + msg.prefix + query)
    .then(r => (r.ok ? r.json() : []))
    .then(data => respond(Array.isArray(data) ? data : []))
    .catch(() => respond([]));
  return true; // respond asynchronously
});

const create = (props: chrome.contextMenus.CreateProperties) =>
  chrome.contextMenus.create(props, () => void chrome.runtime.lastError);

const label = (name: string) => (name.length > 40 ? name.slice(0, 40) + '...' : name);

async function rebuildMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  const playlists = await getPlaylists();
  const saved = playlists.find(p => p.sourceId === SAVED_SOURCE_ID);
  const base = { contexts: ['link'] as ['link'], targetUrlPatterns: YT_LINK_PATTERNS };
  create({ ...base, id: 'add', title: 'Add to TubeList' });
  create({ ...base, id: 'pl:saved', parentId: 'add', title: label(saved?.name ?? 'Saved') });
  for (const p of playlists) {
    if (p.kind === 'custom' && p.sourceId === null) create({ ...base, id: `pl:${p.id}`, parentId: 'add', title: label(p.name) });
  }
  create({ ...base, id: 'sep', parentId: 'add', type: 'separator' });
  create({ ...base, id: 'new', parentId: 'add', title: 'New playlist...' });
}

// Serialized: removeAll and create race when storage changes fire close together.
let menuJob: Promise<void> = Promise.resolve();
const buildMenus = (): Promise<void> => (menuJob = menuJob.then(rebuildMenus, rebuildMenus));

function flash(text: string, title: string): void {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: text === '!' ? '#d32f2f' : '#2e7d32' });
  chrome.action.setTitle({ title });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'TubeList' });
  }, 2500);
}

/** A failed rule install or prefs write must not take the context menus down with it. */
async function boot(): Promise<void> {
  await Promise.all([installRules(), ensureSkipPrefs()].map(p => p.catch((err: unknown) => console.warn('TubeList setup failed', err))));
  // A worker suspended before its `flash` timer fired leaves a badge behind; start from clean.
  await chrome.action.setBadgeText({ text: '' });
  await buildMenus();
}

chrome.runtime.onInstalled.addListener(() => void boot());

chrome.runtime.onStartup.addListener(() => void boot());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.playlists) void buildMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleClick(info, tab?.id);
});

async function askName(tabId: number | undefined): Promise<string | null | undefined> {
  if (tabId === undefined || tabId < 0) return undefined;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => prompt('New TubeList playlist name') });
    return (res?.result as string | null | undefined) ?? null;
  } catch {
    return undefined; // chrome://, Web Store, file:// without file access
  }
}

async function handleClick(info: chrome.contextMenus.OnClickData, tabId: number | undefined): Promise<void> {
  const link = classifyUrl(info.linkUrl ?? '');
  if (link.type === 'invalid') return flash('!', 'Not a YouTube video/playlist link');

  const menuId = String(info.menuItemId);
  let target: SaveTarget;
  if (menuId === 'new') {
    const raw = await askName(tabId);
    if (raw === undefined) return flash('!', 'Cannot ask for a name on this page; create the playlist in the TubeList popup');
    if (raw === null) return; // cancelled
    const name = cleanName(raw, '');
    if (!name) return flash('!', 'A playlist needs a name');
    target = { kind: 'new', name };
  } else if (menuId === 'pl:saved') {
    target = { kind: 'saved' };
  } else {
    const playlistId = menuId.slice(3); // 'pl:<uuid>'
    const name = (await getPlaylists()).find(p => p.id === playlistId)?.name;
    if (!name) return flash('!', 'Playlist no longer exists');
    target = { kind: 'playlist', playlistId, name };
  }

  if (link.type !== 'video') {
    chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
    chrome.action.setBadgeText({ text: '...' });
  }
  try {
    const message = await saveLink(link, target, (done, total) =>
      chrome.action.setBadgeText({ text: `${Math.floor((done / total) * 100)}%` }),
    );
    flash('✓', message);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    flash('!', text.includes('HTTP 400') ? 'Playlist not found or private' : text);
  }
}