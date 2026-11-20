import { getProgress, percent, setProgress } from '../src/lib/progress';
import { savePlaylist, removeVideo } from '../src/lib/store';

const ID = 'aaaaaaaaaaa';

it('records watched seconds', async () => {
  expect(await setProgress(ID, 30, 100, false)).toEqual({ t: 30, d: 100, done: false });
  expect(percent((await getProgress())[ID])).toBe(30);
});

it('marks done when under 2 s remain, and keeps it sticky', async () => {
  expect(await setProgress(ID, 99, 100, false)).toEqual({ t: 99, d: 100, done: true });
  const p = await setProgress(ID, 5, 100, false);
  expect(p).toEqual({ t: 5, d: 100, done: true });
  expect(percent(p!)).toBe(100);
});

it('ignores a save with no duration', async () => {
  expect(await setProgress(ID, 10, 0, false)).toBeNull();
  expect(await setProgress(ID, Infinity, 60, false)).toBeNull();
  expect(await getProgress()).toEqual({});
});

it('clamps a position past the end', async () => {
  expect(await setProgress(ID, 500, 100, false)).toEqual({ t: 100, d: 100, done: true });
});

it('reports an unknown row rather than a finished one when the duration is missing', () => {
  expect(percent({ t: 5, d: 0, done: false })).toBe(0);
  expect(percent(undefined)).toBe(0);
});

it('does not lose a progress update overlapping playlist pruning', async () => {
  const video = (id: string) => ({ id, title: id, channel: '', durationSec: 100, publishedAt: null, thumbnail: '', addedAt: 1 });
  const playlist = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [video(ID), video('bbbbbbbbbbb')] });
  await setProgress(ID, 5, 100, false);
  const original = chrome.storage.local.get;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const readStarted = new Promise<void>(resolve => { entered = resolve; });
  let held = false;
  vi.spyOn(chrome.storage.local, 'get').mockImplementation(async key => {
    const result = await original(key);
    if (key === 'progress' && !held) { held = true; entered(); await wait; }
    return result;
  });
  try {
    const updating = setProgress('bbbbbbbbbbb', 10, 100, false);
    await readStarted;
    const removing = removeVideo(playlist.id, ID);
    release();
    await Promise.all([removing, updating]);
    expect(await getProgress()).toEqual({ bbbbbbbbbbb: { t: 10, d: 100, done: false } });
  } finally {
    release();
    vi.restoreAllMocks();
  }
});
