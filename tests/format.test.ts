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

// Each publishDate paired with the publishedTimeText YouTube itself renders for it, at this `now`.
it.each([
  ['2026-07-15T03:11:56-07:00', '3 months ago'], // 8BNI6SjmHOA: 121.9 days old, but the 15th has not come round
  ['2026-07-08T07:32:30-07:00', '4 months ago'],
  ['2026-10-14T03:31:06-07:00', '4 weeks ago'], // 30.9 days, still short of the 14th
  ['2026-10-12T00:00:39-07:00', '1 month ago'],
  ['2026-10-31T22:30:14-07:00', '13 days ago'], // days, not "1 week"
  ['2026-10-30T10:56:31-07:00', '2 weeks ago'],
  ['2025-11-15T08:00:06-08:00', '11 months ago'], // one day short of a year
  ['2025-10-18T08:00:06-07:00', '1 year ago'],
])('formatPublished(%s)', (iso, expected) => {
  expect(formatPublished(iso, Date.parse('2026-11-14T08:20:00Z'))).toBe(expected);
});

it('truncates sub-month units', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  const ago = (days: number) => new Date(now - days * 86400000).toISOString();
  expect(formatPublished(ago(20), now)).toBe('2 weeks ago'); // 20/7 rounded said 3
  expect(formatPublished(ago(1), now)).toBe('1 day ago'); // numeric:'auto' said "yesterday"
});

it('returns empty for missing or invalid dates', () => {
  expect(formatPublished(null)).toBe('');
  expect(formatPublished('garbage')).toBe('');
});