export function formatDuration(sec: number | null): string {
  if (sec === null) return '';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const secondOfDay = (d: Date): number => d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();

/** Whole months by the calendar, the way YouTube counts them: a video posted 2026-07-15 is
 *  still "3 months ago" on 2026-11-14, while a fixed 30.4-day month calls that 4. */
function wholeMonths(from: Date, to: Date): number {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  const days = to.getUTCDate() - from.getUTCDate();
  if (days < 0 || (days === 0 && secondOfDay(to) < secondOfDay(from))) m--;
  return m;
}

export function formatPublished(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const elapsed = now - t;
  // Always "1 month ago" rather than "last month": YouTube's own wording.
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  const months = wholeMonths(new Date(t), new Date(now));
  if (months >= 12) return rtf.format(-Math.floor(months / 12), 'year');
  if (months >= 1) return rtf.format(-months, 'month');
  // YouTube has no "1 week ago": days run to 13, then it jumps to 2 weeks.
  if (elapsed >= 2 * WEEK) return rtf.format(-Math.floor(elapsed / WEEK), 'week');
  if (elapsed >= DAY) return rtf.format(-Math.floor(elapsed / DAY), 'day');
  if (elapsed >= HOUR) return rtf.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed >= MINUTE) return rtf.format(-Math.floor(elapsed / MINUTE), 'minute');
  return 'just now';
}