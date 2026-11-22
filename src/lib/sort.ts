import type { ListSort, Playlist, SortMode, Video } from './types';

export const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'manual', label: 'Manual order' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'longest', label: 'Longest first' },
  { id: 'letter', label: 'By letter (title)' },
];

export const PLAYLIST_SORT_OPTIONS: { id: ListSort; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'letter', label: 'By letter (name)' },
];

/** Last activity: when the playlist was made, or the last edit (a video added/removed, a rename). */
export const lastActive = (p: Playlist): number => p.updatedAt ?? p.createdAt;

/** The playlists in display order. Ties keep the incoming order (stable sort). */
export function sortPlaylists(playlists: Playlist[], mode: ListSort): Playlist[] {
  const sorted = [...playlists];
  if (mode === 'letter') sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  else if (mode === 'oldest') sorted.sort((a, b) => lastActive(a) - lastActive(b));
  else sorted.sort((a, b) => lastActive(b) - lastActive(a));
  return sorted;
}

/**
 * The videos in display order. `manual` (or no choice) returns the stored array untouched; every other
 * mode returns a sorted copy, so the manual order is never lost. Ties keep the stored order (stable sort).
 */
export function sortVideos(videos: Video[], mode: SortMode | undefined): Video[] {
  if (!mode || mode === 'manual') return videos;
  const sorted = [...videos];
  if (mode === 'newest') sorted.sort((a, b) => b.addedAt - a.addedAt);
  else if (mode === 'oldest') sorted.sort((a, b) => a.addedAt - b.addedAt);
  else if (mode === 'longest') sorted.sort((a, b) => (b.durationSec ?? -1) - (a.durationSec ?? -1));
  else sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return sorted;
}
