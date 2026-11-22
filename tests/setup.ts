import { beforeEach } from 'vitest';

interface Change {
  oldValue?: unknown;
  newValue?: unknown;
}
type Listener = (changes: Record<string, Change>, area: string) => void;

const map = new Map<string, unknown>();
const listeners = new Set<Listener>();

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

beforeEach(() => map.clear());

// jsdom has no object URLs, and the settings page's export path only needs them to exist and be revocable.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
}

// jsdom's HTMLDialogElement exposes only `open`: no show/showModal/close/returnValue, so every app
// dialog (delete, rename, remove) throws on open and cannot be tested at all. This stands in for the
// parts `dialog.ts` relies on: modal open, the `close` event, `returnValue`, and the `method="dialog"`
// submit the platform turns into `close(submitter.value)`. jsdom does fire `submit` for a clicked
// submit button; it has no implicit submission, so tests submit through the button (or requestSubmit).
if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal !== 'function') {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function (this: HTMLDialogElement): void {
    this.open = true;
  };
  proto.show = proto.showModal;
  proto.close = function (this: HTMLDialogElement & { returnValue?: string }, value?: string): void {
    if (value !== undefined) this.returnValue = value;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  document.addEventListener(
    'submit',
    e => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.method !== 'dialog') return;
      e.preventDefault();
      const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
      form.closest('dialog')?.close(submitter?.value ?? undefined);
    },
    true,
  );
}

globalThis.chrome = {
  storage: {
    local: {
      // Like the browser: a string key, a list of keys, or null/undefined for everything.
      get: async (key?: string | string[] | null) => {
        const keys = key == null ? [...map.keys()] : Array.isArray(key) ? key : [key];
        return Object.fromEntries(keys.filter(k => map.has(k)).map(k => [k, clone(map.get(k))]));
      },
      clear: async () => {
        const changes: Record<string, Change> = {};
        for (const [k, v] of map) changes[k] = { oldValue: clone(v) };
        map.clear();
        if (Object.keys(changes).length) for (const l of [...listeners]) l(changes, 'local');
      },
      set: async (obj: Record<string, unknown>) => {
        const changes: Record<string, Change> = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: clone(map.get(k)), newValue: clone(v) };
          map.set(k, clone(v));
        }
        // Like the browser: a write notifies every page watching the area.
        if (Object.keys(changes).length) for (const l of [...listeners]) l(changes, 'local');
      },
    },
    onChanged: {
      addListener: (l: Listener) => void listeners.add(l),
      removeListener: (l: Listener) => void listeners.delete(l),
    },
  },
  runtime: {
    getURL: (p: string) => 'chrome-extension://test/' + p,
    getManifest: () => ({ version: '0.0.0' }),
    openOptionsPage: async () => {},
  },
  tabs: { create: async () => ({}) },
} as unknown as typeof chrome;
