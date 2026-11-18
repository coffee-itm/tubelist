import { getPlaylists, savePlaylist, findBySourceId, addToSaved, SAVED_SOURCE_ID, addVideo, moveVideo, removeVideo, renamePlaylist, deletePlaylist, cleanName, getSkipPrefs, setSkipPrefs, ensureSkipPrefs, DEFAULT_SKIP_PREFS, getPlayerPrefs, setPlayerPrefs, DEFAULT_PLAYER_PREFS } from '../src/lib/store';
import { getProgress, setProgress } from '../src/lib/progress';
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
  const second = await savePlaylist({ name: 'B', kind: 'queue', sourceId: 'PL1', videos: [vid('bbbbbbbbbbb')] });
  const all = await getPlaylists();
  expect(all).toHaveLength(1);
  expect(second.id).toBe(first.id);
  expect(second.createdAt).toBe(first.createdAt);
  expect(all[0].name).toBe('B');
  expect(all[0].kind).toBe('queue'); // the re-save carries every field, not just the videos
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

it('reorders videos by index and ignores out-of-range moves', async () => {
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa'), vid('bbbbbbbbbbb'), vid('ccccccccccc')] });
  await moveVideo(p.id, 0, 2);
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual(['bbbbbbbbbbb', 'ccccccccccc', 'aaaaaaaaaaa']);
  await moveVideo(p.id, 2, 0);
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
  await moveVideo(p.id, 0, 9);
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
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

it('adds to an auto-created Saved playlist, once per video, surviving rename', async () => {
  expect(await addToSaved(vid('aaaaaaaaaaa'))).toBe('added');
  const [p] = await getPlaylists();
  expect(p).toMatchObject({ name: 'Saved', kind: 'custom', sourceId: SAVED_SOURCE_ID });
  await renamePlaylist(p.id, 'Inbox');
  expect(await addToSaved(vid('aaaaaaaaaaa'))).toBe('duplicate');
  expect(await addToSaved(vid('bbbbbbbbbbb'))).toBe('added');
  const all = await getPlaylists();
  expect(all).toHaveLength(1);
  expect(all[0].videos.map(v => v.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
});

it('cleans names', () => {
  expect(cleanName('   ', 'X')).toBe('X');
  expect(cleanName('x'.repeat(150), 'X')).toHaveLength(100);
  expect(cleanName('  a   b  ', 'X')).toBe('a b');
});
it('defaults SponsorBlock prefs and round-trips them', async () => {
  expect(await getSkipPrefs()).toEqual(DEFAULT_SKIP_PREFS);
  const custom = { categories: { ...DEFAULT_SKIP_PREFS.categories, intro: false }, countdown: false };
  await setSkipPrefs(custom);
  expect(await getSkipPrefs()).toEqual(custom);
});

it('writes SponsorBlock defaults once and never overwrites a choice', async () => {
  await ensureSkipPrefs();
  expect((await chrome.storage.local.get('skipPrefs')).skipPrefs).toEqual(DEFAULT_SKIP_PREFS);
  const custom = { ...DEFAULT_SKIP_PREFS, countdown: false };
  await setSkipPrefs(custom);
  await ensureSkipPrefs();
  expect((await chrome.storage.local.get('skipPrefs')).skipPrefs).toEqual(custom);
});

it('drops stored categories that no longer exist and keeps the rest', async () => {
  await chrome.storage.local.set({
    skipPrefs: { categories: { sponsor: false, poi_highlight: true, ghost: true }, countdown: false },
  });
  expect(await getSkipPrefs()).toEqual({ categories: { ...DEFAULT_SKIP_PREFS.categories, sponsor: false }, countdown: false });
});

it('prunes progress for a video no playlist holds any more', async () => {
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa'), vid('bbbbbbbbbbb')] });
  await setProgress('aaaaaaaaaaa', 10, 100, false);
  await removeVideo(p.id, 'aaaaaaaaaaa');
  expect(await getProgress()).toEqual({});
  await setProgress('bbbbbbbbbbb', 10, 100, false);
  await deletePlaylist(p.id);
  expect(await getProgress()).toEqual({});
});

it('keeps progress a second playlist still needs', async () => {
  const a = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa')] });
  const b = await savePlaylist({ name: 'B', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa')] });
  await setProgress('aaaaaaaaaaa', 10, 100, false);
  await removeVideo(a.id, 'aaaaaaaaaaa');
  expect((await getProgress()).aaaaaaaaaaa).toMatchObject({ t: 10 });
  await deletePlaylist(b.id);
  expect(await getProgress()).toEqual({});
});

it('drops progress for videos a refreshed playlist no longer contains', async () => {
  await savePlaylist({ name: 'A', kind: 'youtube', sourceId: 'PL1', videos: [vid('aaaaaaaaaaa')] });
  await setProgress('aaaaaaaaaaa', 10, 100, false);
  await savePlaylist({ name: 'A', kind: 'youtube', sourceId: 'PL1', videos: [vid('bbbbbbbbbbb')] });
  expect(await getProgress()).toEqual({});
});

it('deleting a playlist that is already gone is not an error', async () => {
  await deletePlaylist('nope');
  expect(await getPlaylists()).toEqual([]);
});

it('defaults player prefs, ignoring junk values, and round-trips a choice', async () => {
  expect(await getPlayerPrefs()).toEqual(DEFAULT_PLAYER_PREFS);
  await chrome.storage.local.set({ playerPrefs: { description: 'yes', sync: true } });
  expect(await getPlayerPrefs()).toEqual({ description: true, sync: true });
  await setPlayerPrefs({ description: false, sync: true });
  expect(await getPlayerPrefs()).toEqual({ description: false, sync: true });
});
