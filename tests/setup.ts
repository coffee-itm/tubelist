import { beforeEach } from 'vitest';

const map = new Map<string, unknown>();

beforeEach(() => map.clear());

globalThis.chrome = {
  storage: {
    local: {
      get: async (key: string) => (map.has(key) ? { [key]: structuredClone(map.get(key)) } : {}),
      set: async (obj: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(obj)) map.set(k, structuredClone(v));
      },
    },
  },
  runtime: { getURL: (p: string) => 'chrome-extension://test/' + p },
} as unknown as typeof chrome;