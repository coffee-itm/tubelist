import type { LinkInfo, Video } from './types';
import { fetchPlaylistIds, fetchQueueIds, fetchVideo, fetchVideos } from './innertube';
import { addToSaved, addVideo, findBySourceId, savePlaylist, SAVED_SOURCE_ID } from './store';

export type SaveTarget =
  | { kind: 'saved' }
  | { kind: 'playlist'; playlistId: string; name: string }
  | { kind: 'new'; name: string };

const status = (r: 'added' | 'duplicate', name: string) => `${r === 'added' ? 'Added to' : 'Already in'} ${name}`;

/**
 * Saves a classified YouTube link. A video link goes into `target`; a playlist/queue link becomes
 * (or refreshes) its own playlist, named by `target` when it is `new`. Returns a user-facing message.
 */
export async function saveLink(
  link: LinkInfo,
  target: SaveTarget,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  if (link.type === 'invalid') throw new Error('Not a YouTube video/playlist link');

  if (link.type === 'video') {
    const meta = await fetchVideo(link.videoId);
    if (!meta) throw new Error('Video unavailable');
    const video: Video = { ...meta, addedAt: Date.now() };
    if (target.kind === 'new') {
      await savePlaylist({ name: target.name, kind: 'custom', sourceId: null, videos: [video] });
      return `Added to ${target.name}: ${meta.title}`;
    }
    if (target.kind === 'saved') {
      const r = await addToSaved(video);
      return `${status(r, (await findBySourceId(SAVED_SOURCE_ID))?.name ?? 'Saved')}: ${meta.title}`;
    }
    return `${status(await addVideo(target.playlistId, video), target.name)}: ${meta.title}`;
  }

  const isQueue = link.type === 'queue';
  const { title, ids } = isQueue ? { title: null, ids: await fetchQueueIds(link) } : await fetchPlaylistIds(link.listId);
  if (ids.length === 0) throw new Error('No videos found in this link');
  const { videos, failed } = await fetchVideos(ids, onProgress);
  if (videos.length === 0) throw new Error('None of the videos are available');
  const sourceId = link.listId;
  const existing = sourceId ? await findBySourceId(sourceId) : undefined;
  const name =
    (target.kind === 'new' ? target.name : null) ??
    existing?.name ??
    (isQueue ? 'Queue ' + new Date().toLocaleString() : title ?? 'YouTube playlist');
  await savePlaylist({ name, kind: isQueue ? 'queue' : 'youtube', sourceId, videos });
  const skipped = failed ? ` (${failed} unavailable)` : '';
  return `Saved ${videos.length} video${videos.length === 1 ? '' : 's'} to ${name}${skipped}`;
}
