import { h } from './dom';

export interface Progress { t: number; d: number; done: boolean } // seconds watched, duration, watched ✓
const KEY = 'progress';

export async function getProgress(): Promise<Record<string, Progress>> {
  const res = await chrome.storage.local.get(KEY);
  return (res[KEY] as Record<string, Progress> | undefined) ?? {};
}

// ponytail: read-modify-write like store.ts; one player tab writing at a time is the expected case.
export async function setProgress(id: string, t: number, d: number, ended: boolean): Promise<Progress | null> {
  if (!(d > 0) || !(t >= 0)) return null;
  const all = await getProgress();
  const done = (all[id]?.done ?? false) || ended || d - t <= 2; // sticky: rewatching keeps ✓
  const p = { t: Math.min(t, d), d, done };
  all[id] = p;
  await chrome.storage.local.set({ [KEY]: all });
  return p;
}

export const percent = (p: Progress | undefined): number =>
  !p ? 0 : p.done ? 100 : Math.min(100, Math.round((p.t / p.d) * 100));

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