import { classifyUrl, YT_LINK_PATTERNS } from './lib/url';
import { fetchPlaylistIds, fetchQueueIds, fetchVideo, fetchVideos } from './lib/innertube';
import { addToSaved, findBySourceId, savePlaylist } from './lib/store';

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

async function buildMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  create({ id: 'link', title: 'Add to TubeList', contexts: ['link'], targetUrlPatterns: YT_LINK_PATTERNS });
  create({ id: 'page', title: 'Add this page to TubeList', contexts: ['page', 'video'], documentUrlPatterns: ['*://*.youtube.com/*'] });
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

chrome.runtime.onInstalled.addListener(() => {
  void installRules();
  void buildMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void installRules();
  void buildMenus();
});

chrome.contextMenus.onClicked.addListener(info => {
  void handleClick(info);
});

async function handleClick(info: chrome.contextMenus.OnClickData): Promise<void> {
  const url = info.linkUrl ?? info.pageUrl ?? '';
  const link = classifyUrl(url);
  if (link.type === 'invalid') return flash('!', 'Not a YouTube video/playlist link');
  try {
    const videoId = link.type === 'queue' ? null : link.videoId;
    if (videoId) {
      const v = await fetchVideo(videoId);
      if (!v) return flash('!', 'Video unavailable');
      const result = await addToSaved({ ...v, addedAt: Date.now() });
      return flash(result === 'added' ? '✓' : '=', `${result === 'added' ? 'Saved' : 'Already in Saved'}: ${v.title}`);
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
    const name = existing?.name ?? (isQueue ? 'Queue ' + new Date().toLocaleString() : (title ?? 'YouTube playlist'));
    await savePlaylist({ name, kind: isQueue ? 'queue' : 'youtube', sourceId, videos });
    flash('✓', `Saved ${videos.length} videos to ${name}`);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    flash('!', text.includes('HTTP 400') ? 'Playlist not found or private' : text);
  }
}
