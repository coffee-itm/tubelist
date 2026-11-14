import { classifyUrl, YT_LINK_PATTERNS } from './lib/url';
import { fetchPlaylistIds, fetchQueueIds, fetchVideo, fetchVideos } from './lib/innertube';
import { addToSaved, addVideo, cleanName, findBySourceId, getPlaylists, savePlaylist, SAVED_SOURCE_ID } from './lib/store';

const HEADER_RULES: chrome.declarativeNetRequest.Rule[] = [
  {
    // InnerTube rejects chrome-extension:// Origin with 403
    id: 1,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'set', value: 'https://www.youtube.com' }] },
    condition: { urlFilter: '|https://www.youtube.com/youtubei/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest'] },
  },
  {
    // Watch page refuses framing. The extension opens the first frame; YouTube then reloads that
    // same frame itself (`&themeRefresh=1&theme=dark`), so www.youtube.com must be an allowed
    // initiator too — without it the reload is ERR_BLOCKED_BY_RESPONSE ("refused to connect").
    id: 3,
    priority: 1,
    action: { type: 'modifyHeaders', responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }, { header: 'content-security-policy', operation: 'remove' }] },
    condition: { requestDomains: ['www.youtube.com'], initiatorDomains: [chrome.runtime.id, 'www.youtube.com'], resourceTypes: ['sub_frame'] },
  },
];

async function installRules(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1, 2, 3], addRules: HEADER_RULES });
}

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

chrome.runtime.onInstalled.addListener(() => {
  void installRules();
  void buildMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void installRules();
  void buildMenus();
});

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
  let newName: string | null = null;
  if (menuId === 'new') {
    const raw = await askName(tabId);
    if (raw === undefined) return flash('!', 'Cannot ask for a name on this page; create the playlist in the TubeList popup');
    if (raw === null) return; // cancelled
    newName = cleanName(raw, '');
    if (!newName) return;
  }
  try {
    const videoId = link.type === 'queue' ? null : link.videoId;
    if (videoId) {
      const v = await fetchVideo(videoId);
      if (!v) return flash('!', 'Video unavailable');
      const video = { ...v, addedAt: Date.now() };
      if (newName !== null) {
        await savePlaylist({ name: newName, kind: 'custom', sourceId: null, videos: [video] });
        return flash('✓', `Added to ${newName}: ${v.title}`);
      }
      if (menuId === 'pl:saved') {
        const r = await addToSaved(video);
        const name = (await findBySourceId(SAVED_SOURCE_ID))?.name ?? 'Saved';
        return flash(r === 'added' ? '✓' : '=', `${r === 'added' ? 'Added to' : 'Already in'} ${name}: ${v.title}`);
      }
      const targetId = menuId.slice(3); // 'pl:<uuid>'
      const name = (await getPlaylists()).find(p => p.id === targetId)?.name;
      if (!name) return flash('!', 'Playlist no longer exists');
      const r = await addVideo(targetId, video);
      return flash(r === 'added' ? '✓' : '=', `${r === 'added' ? 'Added to' : 'Already in'} ${name}: ${v.title}`);
    }
    if (link.type === 'video') return; // unreachable: video links always carry an id; narrows link to playlist | queue
    chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
    chrome.action.setBadgeText({ text: '...' });
    const isQueue = link.type === 'queue';
    const { title, ids } = isQueue ? { title: null, ids: await fetchQueueIds(link) } : await fetchPlaylistIds(link.listId);
    if (ids.length === 0) return flash('!', 'No videos found in this link');
    const videos = await fetchVideos(ids, (done, total) => chrome.action.setBadgeText({ text: `${Math.floor((done / total) * 100)}%` }));
    if (videos.length === 0) return flash('!', 'None of the videos are available');
    const sourceId = link.listId;
    const existing = sourceId ? await findBySourceId(sourceId) : undefined;
    const name = newName ?? existing?.name ?? (isQueue ? 'Queue ' + new Date().toLocaleString() : (title ?? 'YouTube playlist'));
    await savePlaylist({ name, kind: isQueue ? 'queue' : 'youtube', sourceId, videos });
    flash('✓', `Saved ${videos.length} videos to ${name}`);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    flash('!', text.includes('HTTP 400') ? 'Playlist not found or private' : text);
  }
}