import { getProgress, percent, setProgress } from '../src/lib/progress';

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
  expect(await getProgress()).toEqual({});
});