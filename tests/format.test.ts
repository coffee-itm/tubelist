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

it('returns empty for missing or invalid dates', () => {
  expect(formatPublished(null)).toBe('');
  expect(formatPublished('garbage')).toBe('');
});