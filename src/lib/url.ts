import type { LinkInfo } from './types';

export const PLAYER_PAGE = 'player.html';
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const YT_LINK_PATTERNS = ['*://*.youtube.com/*', '*://youtube.com/*', '*://youtu.be/*'];
export const playerUrl = (id: string, playlistId?: string) =>
  chrome.runtime.getURL(`${PLAYER_PAGE}?${new URLSearchParams(playlistId ? { v: id, pl: playlistId } : { v: id })}`);
export function openDialog(url: string): void {
  chrome.windows.create({ url: chrome.runtime.getURL('dialog.html?url=' + encodeURIComponent(url)), type: 'popup', width: 440, height: 320 });
}
export const embedUrl = (id: string) =>
  `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const LIST_RE = /^[A-Za-z0-9_-]{2,}$/;
const SEGMENT_PATHS = ['shorts', 'live', 'embed'];

export function classifyUrl(raw: string): LinkInfo {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { type: 'invalid' };
  }

  const host = u.hostname;
  if (host !== 'youtu.be' && host !== 'youtube.com' && !host.endsWith('.youtube.com')) return { type: 'invalid' };

  const segs = u.pathname.split('/').filter(Boolean);
  let v: string | null = null;
  if (host === 'youtu.be') v = segs[0] ?? null;
  else if (SEGMENT_PATHS.includes(segs[0])) v = segs[1] ?? null;
  else v = u.searchParams.get('v');
  if (v === null || !VIDEO_ID_RE.test(v)) v = null;

  if (u.pathname === '/watch_videos') {
    const videoIds = [...new Set((u.searchParams.get('video_ids') ?? '').split(',').map(s => s.trim()).filter(s => VIDEO_ID_RE.test(s)))];
    return videoIds.length ? { type: 'queue', listId: null, videoIds, videoId: null } : { type: 'invalid' };
  }

  const listParam = u.searchParams.get('list');
  const list = listParam && LIST_RE.test(listParam) ? listParam : null;

  if (list?.startsWith('TL')) return { type: 'queue', listId: list, videoIds: [], videoId: v };
  if (list && !list.startsWith('RD')) return { type: 'playlist', listId: list, videoId: v };
  if (v) return { type: 'video', videoId: v };
  return { type: 'invalid' };
}