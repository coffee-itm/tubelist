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

globalThis.chrome = {
  storage: {
    local: {
      get: async (key: string) => (map.has(key) ? { [key]: clone(map.get(key)) } : {}),
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
    openOptionsPage: async () => {},
  },
  tabs: { create: async () => ({}) },
} as unknown as typeof chrome;
