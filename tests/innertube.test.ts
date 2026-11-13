import { readFileSync } from 'node:fs';
import { parsePlayer, parseBrowse, parseNext, mapPool, fetchPlaylistIds } from '../src/lib/innertube';
import { VIDEO_ID_RE } from '../src/lib/url';

const fixture = (name: string): unknown => JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));

const page1 = fixture('browse-page1');
const last = fixture('browse-last');

it('parses a playable video', () => {
  const v = parsePlayer(fixture('player-ok'));
  expect(v?.id).toBe('dQw4w9WgXcQ');
  expect(v?.title).toContain('Never Gonna Give You Up');
  expect(v?.channel).toBe('Rick Astley');
  expect(v?.durationSec).toBe(213);
  expect(v?.publishedAt?.startsWith('2009-10-2')).toBe(true);
});

it('returns null for an unavailable video', () => {
  expect(parsePlayer(fixture('player-unavailable'))).toBeNull();
});

it('parses playlist pages', () => {
  const first = parseBrowse(page1);
  expect(first.title).toBe('Popular Music Videos');
  expect(first.ids.length).toBeGreaterThan(0);
  expect(first.ids.every(id => VIDEO_ID_RE.test(id))).toBe(true);
  expect(first.continuation).not.toBeNull();
  expect(parseBrowse(last).continuation).toBeNull();
});

it('parses a queue', () => {
  expect(parseNext(fixture('next-queue')).ids).toEqual(['dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk']);
});

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

it('runs the pool with bounded concurrency, in order, with progress', async () => {
  vi.useFakeTimers();
  let inFlight = 0;
  let max = 0;
  const progress: [number, number][] = [];
  const pending = mapPool([30, 10, 20], 2, async ms => {
    inFlight++;
    max = Math.max(max, inFlight);
    await sleep(ms);
    inFlight--;
    return ms;
  }, (d, t) => progress.push([d, t]));
  await vi.advanceTimersByTimeAsync(100);
  const results = await pending;
  vi.useRealTimers();

  expect(results.map(r => (r.status === 'fulfilled' ? r.value : -1))).toEqual([30, 10, 20]);
  expect(max).toBeLessThanOrEqual(2);
  expect(progress).toHaveLength(3);
  expect(progress.at(-1)).toEqual([3, 3]);
});

it('keeps rejected items isolated', async () => {
  const results = await mapPool([1, 2, 3], 2, async n => {
    if (n === 2) throw new Error('boom');
    return n;
  });
  expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
  expect(results[1].status).toBe('rejected');
  expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
});

it('pages through a playlist with the continuation token', async () => {
  const token = parseBrowse(page1).continuation;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page1 })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => last });
  vi.stubGlobal('fetch', fetchMock);

  const res = await fetchPlaylistIds('PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI');

  expect(res.title).toBe('Popular Music Videos');
  const expected = new Set([...parseBrowse(page1).ids, ...parseBrowse(last).ids]);
  expect(res.ids.length).toBe(expected.size);
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.continuation).toBe(token);
  vi.unstubAllGlobals();
});