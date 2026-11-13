import type { Playlist, PlaylistKind, Video } from './types';

const KEY = 'playlists';

// ponytail: read-modify-write without a lock; a popup edit during the same millisecond as a save could be lost. Upgrade: route all writes through the service worker if it ever matters.

async function read(): Promise<Playlist[]> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as Playlist[] | undefined) ?? [];
}

async function write(playlists: Playlist[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: playlists });
}

export async function getPlaylists(): Promise<Playlist[]> {
  return (await read()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function savePlaylist(p: { name: string; kind: PlaylistKind; sourceId: string | null; videos: Video[] }): Promise<Playlist> {
  const playlists = await read();
  const existing = p.sourceId === null ? undefined : playlists.find(x => x.sourceId === p.sourceId);
  let saved: Playlist;
  if (existing) {
    existing.name = p.name;
    existing.videos = p.videos;
    saved = existing;
  } else {
    saved = { ...p, id: crypto.randomUUID(), createdAt: Date.now() };
    playlists.push(saved);
  }
  await write(playlists);
  return saved;
}

export async function findBySourceId(sourceId: string): Promise<Playlist | undefined> {
  return (await read()).find(p => p.sourceId === sourceId);
}

function requirePlaylist(playlists: Playlist[], playlistId: string): Playlist {
  const p = playlists.find(x => x.id === playlistId);
  if (!p) throw new Error('Playlist not found');
  return p;
}

export async function addVideo(playlistId: string, v: Video): Promise<'added' | 'duplicate'> {
  const playlists = await read();
  const p = requirePlaylist(playlists, playlistId);
  if (p.videos.some(x => x.id === v.id)) return 'duplicate';
  p.videos.push(v);
  await write(playlists);
  return 'added';
}

export async function removeVideo(playlistId: string, videoId: string): Promise<void> {
  const playlists = await read();
  const p = requirePlaylist(playlists, playlistId);
  p.videos = p.videos.filter(x => x.id !== videoId);
  await write(playlists);
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  const playlists = await read();
  requirePlaylist(playlists, playlistId).name = name;
  await write(playlists);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const playlists = await read();
  await write(playlists.filter(x => x.id !== playlistId));
}

export function cleanName(raw: string, fallback: string): string {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 100);
  return name || fallback;
}