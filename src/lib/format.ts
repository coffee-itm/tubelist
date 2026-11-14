export function formatDuration(sec: number | null): string {
  if (sec === null) return '';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400000],
  ['month', (365 / 12) * 86400000], // YouTube's month, not 30 days: the 30-day one labels a 121-day-old video "4 months ago" while YouTube says 3
  ['week', 7 * 86400000],
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
];

export function formatPublished(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = t - now;
  // Truncated, never rounded, and always "1 month ago" rather than "last month": YouTube's own wording.
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  for (const [unit, ms] of UNITS) {
    const n = Math.trunc(diff / ms);
    if (n) return rtf.format(n, unit);
  }
  return 'just now';
}