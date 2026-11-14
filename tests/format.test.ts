import { formatDuration, formatPublished } from '../src/lib/format';

it.each([
  [null, ''],
  [59, '0:59'],
  [213, '3:33'],
  [3725, '1:02:05'],
])('formatDuration(%s)', (sec, expected) => {
  expect(formatDuration(sec)).toBe(expected);
});

it('formats relative publish dates', () => {
  expect(formatPublished('2009-10-25T00:00:00Z', Date.parse('2026-11-13T00:00:00Z'))).toBe('17 years ago');
});

// Real case: youtube.com/watch?v=8BNI6SjmHOA, publishDate 2026-07-15T03:11:56-07:00, YouTube labels it "3mo ago".
it('truncates and uses YouTube month length', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  const ago = (days: number) => new Date(now - days * 86400000).toISOString();
  expect(formatPublished(ago(121), now)).toBe('3 months ago'); // 30-day months rounded said 4
  expect(formatPublished(ago(121.7), now)).toBe('4 months ago');
  expect(formatPublished(ago(20), now)).toBe('2 weeks ago'); // 20/7 rounded said 3
  expect(formatPublished(ago(1), now)).toBe('1 day ago'); // numeric:'auto' said "yesterday"
});

it('returns empty for missing or invalid dates', () => {
  expect(formatPublished(null)).toBe('');
  expect(formatPublished('garbage')).toBe('');
});