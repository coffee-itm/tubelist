import type { LinkInfo } from './types';

export const PLAYER_PAGE = 'player.html';
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const YT_LINK_PATTERNS = ['*://*.youtube.com/*', '*://youtube.com/*', '*://youtu.be/*'];
export const playerUrl = (id: string, playlistId?: string) =>
  chrome.runtime.getURL(`${PLAYER_PAGE}?${new URLSearchParams(playlistId ? { v: id, pl: playlistId } : { v: id })}`);
export const watchUrl = (id: string, start = 0) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(id)}${start > 0 ? `&t=${Math.floor(start)}s` : ''}`;
// The embed player takes its resume point as `start`, not `t`, and records no watch history.
export const embedUrl = (id: string, start = 0) =>
  `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1${start > 0 ? `&start=${Math.floor(start)}` : ''}`;
// watch_videos queues hold at most 50 videos, so longer playlists are truncated.
export const queueUrl = (ids: string[]): string =>
  'https://www.youtube.com/watch_videos?video_ids=' + ids.slice(0, 50).map(encodeURIComponent).join(',');
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
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) return { type: 'invalid' };
  if (host !== 'youtu.be' && host !== 'youtube.com' && !host.endsWith('.youtube.com')) return { type: 'invalid' };

  const segs = u.pathname.split('/').filter(Boolean);
  let v: string | null = null;
  if (host === 'youtu.be') v = segs[0] ?? null;
  else if (SEGMENT_PATHS.includes(segs[0])) v = segs[1] ?? null;
  else if (u.pathname === '/watch') v = u.searchParams.get('v');
  if (v === null || !VIDEO_ID_RE.test(v)) v = null;

  if (u.pathname === '/watch_videos') {
    const videoIds = [...new Set((u.searchParams.get('video_ids') ?? '').split(',').map(s => s.trim()).filter(s => VIDEO_ID_RE.test(s)))];
    return videoIds.length ? { type: 'queue', listId: null, videoIds, videoId: null } : { type: 'invalid' };
  }

  const listParam = u.searchParams.get('list');
  const list = listParam && LIST_RE.test(listParam) ? listParam : null;

  if (list?.startsWith('TL')) return { type: 'queue', listId: list, videoIds: [], videoId: v };
  // Watch Later and Liked are account lists: InnerTube cannot read them without the account's cookies.
  // With a `v` the user is pointing at that video, so add the video rather than an unreadable list.
  if (list === 'WL' || list === 'LL') return v ? { type: 'video', videoId: v } : { type: 'playlist', listId: list, videoId: null };
  if (list && !list.startsWith('RD')) return { type: 'playlist', listId: list, videoId: v };
  if (v) return { type: 'video', videoId: v };
  return { type: 'invalid' };
}
