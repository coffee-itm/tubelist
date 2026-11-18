import { backup, clearAll, parseBackup, restore } from '../src/lib/backup';
import { addToSaved, getPlaylists, getSkipPrefs, setSkipPrefs } from '../src/lib/store';
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

it('round-trips every stored key through a backup', async () => {
  await addToSaved(vid('aaaaaaaaaaa'));
  await setSkipPrefs({ categories: { intro: false }, countdown: false });
  await setProgress('aaaaaaaaaaa', 30, 60, false);

  const text = await backup();
  expect(JSON.parse(text)).toHaveProperty('format', 'tubelist');
  await clearAll();
  expect(await getPlaylists()).toHaveLength(0);

  const restored = await restore(text);
  expect(restored.flatMap(p => p.videos.map(v => v.id))).toEqual(['aaaaaaaaaaa']);
  expect((await getSkipPrefs()).categories.intro).toBe(false);
  expect((await getProgress()).aaaaaaaaaaa).toMatchObject({ t: 30, d: 60 });
});

it('exports a readable file from an empty profile', async () => {
  const text = await backup();
  expect(parseBackup(text).playlists).toEqual([]);
  await expect(restore(text)).resolves.toEqual([]);
});

it('rejects a file that is not a TubeList backup', () => {
  expect(() => parseBackup('not json')).toThrow('not JSON');
  expect(() => parseBackup('[]')).toThrow('Not a TubeList backup');
  expect(() => parseBackup('{"a":1}')).toThrow('Not a TubeList backup');
  expect(() => parseBackup('{"format":"tubelist","playlists":{}}')).toThrow('Not a TubeList backup');
  // A playlist the popup could not render: no id, no name, videos that are not a list.
  expect(() => parseBackup('{"format":"tubelist","playlists":[{"id":"a","name":"A"}]}')).toThrow('Not a TubeList backup');
  expect(() => parseBackup('{"format":"tubelist","playlists":[{"id":1,"name":"A","videos":[]}]}')).toThrow('Not a TubeList backup');
  // A row the popup or player would crash on: no kind to colour the badge, a null video.
  expect(() => parseBackup('{"format":"tubelist","playlists":[{"id":"a","name":"A","kind":"wat","sourceId":null,"createdAt":1,"videos":[]}]}')).toThrow('Not a TubeList backup');
  expect(() => parseBackup('{"format":"tubelist","playlists":[{"id":"a","name":"A","kind":"custom","sourceId":null,"createdAt":1,"videos":[null]}]}')).toThrow('Not a TubeList backup');
});

it('leaves keys the file does not carry alone', async () => {
  await setSkipPrefs({ categories: { intro: false }, countdown: false });
  await restore('{"format":"tubelist","playlists":[]}');
  expect(await getPlaylists()).toHaveLength(0);
  expect((await getSkipPrefs()).categories.intro).toBe(false);
});
