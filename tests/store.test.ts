import { getPlaylists, savePlaylist, findBySourceId, addVideo, removeVideo, renamePlaylist, deletePlaylist, cleanName } from '../src/lib/store';
import type { Video } from '../src/lib/types';

const vid = (id: string): Video => ({
  id,
  title: 'Video ' + id,
  channel: 'Channel',
  durationSec: 60,
  publishedAt: null,
  thumbnail: 'thumb',
  addedAt: 1,
});

it('creates a playlist', async () => {
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa')] });
  expect(p.id).toBeTruthy();
  expect(await getPlaylists()).toHaveLength(1);
});

it('updates a playlist with the same sourceId in place', async () => {
  const first = await savePlaylist({ name: 'A', kind: 'youtube', sourceId: 'PL1', videos: [vid('aaaaaaaaaaa')] });
  const second = await savePlaylist({ name: 'B', kind: 'youtube', sourceId: 'PL1', videos: [vid('bbbbbbbbbbb')] });
  const all = await getPlaylists();
  expect(all).toHaveLength(1);
  expect(second.id).toBe(first.id);
  expect(second.createdAt).toBe(first.createdAt);
  expect(all[0].name).toBe('B');
  expect(all[0].videos.map(v => v.id)).toEqual(['bbbbbbbbbbb']);
});

it('creates new playlists when sourceId is null', async () => {
  await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [] });
  await savePlaylist({ name: 'B', kind: 'custom', sourceId: null, videos: [] });
  expect(await getPlaylists()).toHaveLength(2);
});

it('finds by source id', async () => {
  const p = await savePlaylist({ name: 'A', kind: 'youtube', sourceId: 'PL1', videos: [] });
  expect((await findBySourceId('PL1'))?.id).toBe(p.id);
  expect(await findBySourceId('PL2')).toBeUndefined();
});

it('adds once and reports duplicates', async () => {
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [] });
  expect(await addVideo(p.id, vid('aaaaaaaaaaa'))).toBe('added');
  expect(await addVideo(p.id, vid('aaaaaaaaaaa'))).toBe('duplicate');
  expect((await getPlaylists())[0].videos).toHaveLength(1);
});

it('removes videos, renames and deletes playlists', async () => {
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa'), vid('bbbbbbbbbbb')] });
  await removeVideo(p.id, 'aaaaaaaaaaa');
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual(['bbbbbbbbbbb']);
  await renamePlaylist(p.id, 'Renamed');
  expect((await getPlaylists())[0].name).toBe('Renamed');
  await deletePlaylist(p.id);
  expect(await getPlaylists()).toHaveLength(0);
});

it('throws on an unknown playlist id', async () => {
  await expect(addVideo('nope', vid('aaaaaaaaaaa'))).rejects.toThrow('Playlist not found');
  await expect(removeVideo('nope', 'aaaaaaaaaaa')).rejects.toThrow('Playlist not found');
  await expect(renamePlaylist('nope', 'x')).rejects.toThrow('Playlist not found');
});

it('sorts newest first', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  await savePlaylist({ name: 'old', kind: 'custom', sourceId: null, videos: [] });
  vi.setSystemTime(2000);
  await savePlaylist({ name: 'new', kind: 'custom', sourceId: null, videos: [] });
  vi.useRealTimers();
  expect((await getPlaylists()).map(p => p.name)).toEqual(['new', 'old']);
});

it('cleans names', () => {
  expect(cleanName('   ', 'X')).toBe('X');
  expect(cleanName('x'.repeat(150), 'X')).toHaveLength(100);
  expect(cleanName('  a   b  ', 'X')).toBe('a b');
});