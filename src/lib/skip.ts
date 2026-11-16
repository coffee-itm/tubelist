export interface Segment {
  c: string; // category
  a: string; // actionType
  s: number; // start, seconds
  e: number; // end, seconds
  u: string; // UUID
}

export interface Prefs {
  categories?: Record<string, boolean>;
  countdown?: boolean;
}

/** The segment being counted down, if any. */
export interface Countdown {
  id: string | null;
  at: number; // deadline, Date.now() based
  end: number; // segment end the countdown will seek to
}

export type SkipStep =
  | { action: 'hide' } // nothing active: hide the countdown
  | { action: 'wait'; left: number; countdown: Countdown } // show `left` seconds and keep counting
  | { action: 'seek'; to: number }; // skip to `to`

export const COUNTDOWN_MS = 3000;
export const NO_COUNTDOWN: Countdown = { id: null, at: 0, end: 0 };
const EDGE = 0.05; // 20 plays/second-ish: treat the last 50 ms as already skipped

/**
 * The one decision the frame's loop makes per tick: skip the first active segment, or count a sponsor
 * down first. Pure, so the countdown/ignore rules are testable without a video element.
 */
export function nextSkip(
  t: number,
  segs: Segment[],
  prefs: Prefs,
  ignored: ReadonlySet<string>,
  countdown: Countdown,
  now: number,
): SkipStep {
  for (const g of segs) {
    if (prefs.categories?.[g.c] === false || ignored.has(g.u)) continue;
    if (t < g.s || t >= g.e - EDGE) continue;
    if (g.c === 'sponsor' && prefs.countdown !== false) {
      const cd = countdown.id === g.u ? countdown : { id: g.u, at: now + COUNTDOWN_MS, end: g.e };
      const left = Math.ceil((cd.at - now) / 1000);
      if (left > 0) return { action: 'wait', left, countdown: cd };
    }
    return { action: 'seek', to: g.e };
  }
  return { action: 'hide' };
}
