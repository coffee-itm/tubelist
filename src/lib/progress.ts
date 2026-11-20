import { h } from './dom';

export interface Progress { t: number; d: number; done: boolean } // seconds watched, duration, watched ✓
export const PROGRESS_KEY = 'progress';
const CHANNEL = 'tubelist:progress';

export async function getProgress(): Promise<Record<string, Progress>> {
  const res = await chrome.storage.local.get(PROGRESS_KEY);
  return (res[PROGRESS_KEY] as Record<string, Progress> | undefined) ?? {};
}

/** Serialized: every save rewrites the whole map, so two overlapping saves would lose one of them. */
let queue: Promise<unknown> = Promise.resolve();

export function withProgressLock<T>(work: () => Promise<T>): Promise<T> {
  const job = queue.then(work);
  queue = job.then(() => undefined, () => undefined);
  return job;
}

async function commit(id: string, t: number, d: number, ended: boolean): Promise<Progress> {
  const all = await getProgress();
  const done = (all[id]?.done ?? false) || ended || d - t <= 2; // sticky: rewatching keeps ✓
  const p = { t: Math.min(t, d), d, done };
  all[id] = p;
  await chrome.storage.local.set({ [PROGRESS_KEY]: all });
  return p;
}

export function setProgress(id: string, t: number, d: number, ended: boolean): Promise<Progress | null> {
  if (!Number.isFinite(d) || !Number.isFinite(t) || !(d > 0) || !(t >= 0)) return Promise.resolve(null);
  if (typeof chrome.runtime?.sendMessage === 'function' && !isServer) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: CHANNEL, id, t, d, ended }, (res: { ok: boolean; value?: Progress; error?: string }) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message ?? 'TubeList background is unavailable'));
      else if (!res?.ok) reject(new Error(res?.error ?? 'TubeList background did not answer'));
      else resolve(res.value ?? null);
    }));
  }
  return withProgressLock(() => commit(id, t, d, ended));
}

let isServer = false;
export function installProgressServer(): void {
  isServer = true;
  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    const m = message as { type?: string; id?: string; t?: number; d?: number; ended?: boolean } | null;
    if (m?.type !== CHANNEL) return false;
    if (typeof m.id !== 'string' || typeof m.t !== 'number' || typeof m.d !== 'number' || typeof m.ended !== 'boolean'
      || !Number.isFinite(m.t) || !Number.isFinite(m.d) || m.t < 0 || m.d <= 0) {
      respond({ ok: false, error: 'Invalid progress update' });
      return false;
    }
    const { id, t, d, ended } = m;
    void withProgressLock(() => commit(id, t, d, ended)).then(
      value => respond({ ok: true, value }),
      (err: unknown) => respond({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  });
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
