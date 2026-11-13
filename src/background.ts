import { classifyUrl, YT_LINK_PATTERNS } from './lib/url';
import { fetchVideo } from './lib/innertube';
import { addVideo, getPlaylists } from './lib/store';

const HEADER_RULES: chrome.declarativeNetRequest.Rule[] = [
  {
    // InnerTube rejects chrome-extension:// Origin with 403
    id: 1,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'set', value: 'https://www.youtube.com' }] },
    condition: { urlFilter: '|https://www.youtube.com/youtubei/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest'] },
  },
  {
    // Embedded player needs a Referer, else Error 153
    id: 2,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: `https://tubelist.${chrome.runtime.id}/` }] },
    condition: { requestDomains: ['www.youtube.com'], initiatorDomains: [chrome.runtime.id], resourceTypes: ['sub_frame'] },
  },
];

async function installRules(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1, 2], addRules: HEADER_RULES });
}

const create = (props: chrome.contextMenus.CreateProperties) =>
  chrome.contextMenus.create(props, () => void chrome.runtime.lastError);

async function rebuildMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  const playlists = await getPlaylists();

  create({ id: 'link', title: 'Add to TubeList', contexts: ['link'], targetUrlPatterns: YT_LINK_PATTERNS });
  create({ id: 'page', title: 'Add this page to TubeList', contexts: ['page', 'video'], documentUrlPatterns: ['*://*.youtube.com/*'] });

  for (const prefix of ['link', 'page']) {
    create({ id: `${prefix}:new`, parentId: prefix, title: 'Save as new playlist…' });
    create({ id: `${prefix}:sep`, parentId: prefix, type: 'separator' });
    for (const p of playlists) {
      create({ id: `${prefix}:pl:${p.id}`, parentId: prefix, title: p.name.length > 40 ? p.name.slice(0, 40) + '…' : p.name });
    }
  }
}

function flash(text: string, title: string): void {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: text === '!' ? '#d32f2f' : '#2e7d32' });
  chrome.action.setTitle({ title });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'TubeList' });
  }, 2500);
}

function openDialog(url: string): void {
  chrome.windows.create({ url: chrome.runtime.getURL('dialog.html?url=' + encodeURIComponent(url)), type: 'popup', width: 440, height: 320 });
}

chrome.runtime.onInstalled.addListener(() => {
  void installRules();
  void rebuildMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void installRules();
  void rebuildMenus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.playlists) void rebuildMenus();
});

chrome.contextMenus.onClicked.addListener(info => {
  void handleClick(info);
});

async function handleClick(info: chrome.contextMenus.OnClickData): Promise<void> {
  const url = info.linkUrl ?? info.pageUrl ?? '';
  const link = classifyUrl(url);
  if (link.type === 'invalid') return flash('!', 'Not a YouTube video/playlist link');

  const menuId = String(info.menuItemId);
  if (menuId.endsWith(':new')) return openDialog(url);
  if (!menuId.includes(':pl:')) return;
  const targetId = menuId.slice(menuId.indexOf(':pl:') + 4);

  const videoId = link.videoId;
  if (videoId) {
    try {
      const v = await fetchVideo(videoId);
      if (!v) return flash('!', 'Video unavailable');
      const name = (await getPlaylists()).find(p => p.id === targetId)?.name ?? '';
      const result = await addVideo(targetId, { ...v, addedAt: Date.now() });
      flash(result === 'added' ? '✓' : '=', `${result === 'added' ? 'Added to' : 'Already in'} ${name}`);
    } catch (err) {
      flash('!', err instanceof Error ? err.message : String(err));
    }
  } else {
    openDialog(url);
  }
}