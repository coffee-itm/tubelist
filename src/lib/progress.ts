import { h } from './dom';

export interface Progress { t: number; d: number; done: boolean } // seconds watched, duration, watched ✓
export const PROGRESS_KEY = 'progress';

export async function getProgress(): Promise<Record<string, Progress>> {
  const res = await chrome.storage.local.get(PROGRESS_KEY);
  return (res[PROGRESS_KEY] as Record<string, Progress> | undefined) ?? {};
}

/** Serialized: every save rewrites the whole map, so two overlapping saves would lose one of them. */
let queue: Promise<unknown> = Promise.resolve();

async function commit(id: string, t: number, d: number, ended: boolean): Promise<Progress> {
  const all = await getProgress();
  const done = (all[id]?.done ?? false) || ended || d - t <= 2; // sticky: rewatching keeps ✓
  const p = { t: Math.min(t, d), d, done };
  all[id] = p;
  await chrome.storage.local.set({ [PROGRESS_KEY]: all });
  return p;
}

export function setProgress(id: string, t: number, d: number, ended: boolean): Promise<Progress | null> {
  if (!(d > 0) || !(t >= 0)) return Promise.resolve(null);
  const job = queue.then(() => commit(id, t, d, ended));
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

export const percent = (p: Progress | undefined): number => {
  if (!p || !(p.d > 0)) return 0; // a row written before the duration was known must not render as 100%
  return p.done ? 100 : Math.min(100, Math.round((p.t / p.d) * 100));
};

// Appended inside a thumbnail container that is `relative overflow-hidden`.
// Empty array when nothing is watched, so DOM `append()` never receives a null.
export function progressOverlay(p: Progress | undefined): HTMLElement[] {
  const pct = percent(p);
  if (pct === 0) return [];
  const fill = h('div', 'h-full bg-red-600');
  fill.style.width = `${pct}%`;
  const bar = h('div', 'absolute inset-x-0 bottom-0 h-1 bg-zinc-400/60', fill);
  bar.dataset.progress = '';
  if (!p?.done) return [bar];
  const badge = h('span', 'absolute left-1 top-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white', '✓ Watched');
  badge.dataset.progress = '';
  return [bar, badge];
}
