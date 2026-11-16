import { COUNTDOWN_MS, NO_COUNTDOWN, nextSkip, type Segment } from '../src/lib/skip';

const seg = (over: Partial<Segment> = {}): Segment => ({ c: 'sponsor', a: 'skip', s: 10, e: 20, u: 'u1', ...over });
const on = { categories: { sponsor: true, intro: true }, countdown: true };

it('skips a non-sponsor segment immediately', () => {
  expect(nextSkip(12, [seg({ c: 'intro' })], on, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'seek', to: 20 });
});

it('counts a sponsor down, then skips when the countdown expires', () => {
  const first = nextSkip(12, [seg()], on, new Set(), NO_COUNTDOWN, 1_000);
  expect(first).toEqual({ action: 'wait', left: 3, countdown: { id: 'u1', at: 1_000 + COUNTDOWN_MS, end: 20 } });
  if (first.action !== 'wait') throw new Error('expected a countdown step');
  const cd = first.countdown;
  expect(nextSkip(12.5, [seg()], on, new Set(), cd, 2_000)).toEqual({ action: 'wait', left: 2, countdown: cd });
  expect(nextSkip(13, [seg()], on, new Set(), cd, 1_000 + COUNTDOWN_MS)).toEqual({ action: 'seek', to: 20 });
});

it('skips a sponsor at once when the countdown is off', () => {
  expect(nextSkip(12, [seg()], { ...on, countdown: false }, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'seek', to: 20 });
});

it('leaves a disabled category or a segment the user seeked into alone', () => {
  expect(nextSkip(12, [seg()], { categories: { sponsor: false } }, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'hide' });
  expect(nextSkip(12, [seg()], on, new Set(['u1']), NO_COUNTDOWN, 0)).toEqual({ action: 'hide' });
});

it('does nothing outside a segment, or in its last 50 ms', () => {
  expect(nextSkip(9.9, [seg()], on, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'hide' });
  expect(nextSkip(19.97, [seg()], on, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'hide' });
  expect(nextSkip(20, [seg()], on, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'hide' });
});

it('takes the first active segment, in list order', () => {
  const segs = [seg({ c: 'intro', s: 0, e: 5, u: 'a' }), seg({ c: 'outro', s: 12, e: 14, u: 'b' })];
  expect(nextSkip(12.5, segs, on, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'seek', to: 14 });
});

it('skips a zero-length marker segment never (POI has start == end)', () => {
  expect(nextSkip(12, [seg({ c: 'poi_highlight', a: 'poi', s: 12, e: 12 })], on, new Set(), NO_COUNTDOWN, 0)).toEqual({ action: 'hide' });
});
