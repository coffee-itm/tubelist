import type { Playlist, Video } from './types';
import { PROGRESS_KEY } from './progress';

/** What a backup carries: playlists (each holds its own videos), both pref sets, and watch progress. */
const KEYS = ['playlists', 'skipPrefs', 'playerPrefs', PROGRESS_KEY];

const isVideo = (value: unknown): boolean => {
  const v = value as Video;
  return !!v && typeof v === 'object' && typeof v.id === 'string' && typeof v.title === 'string'
    && typeof v.channel === 'string' && typeof v.thumbnail === 'string'
    && (v.durationSec === null || typeof v.durationSec === 'number')
    && (v.publishedAt === null || typeof v.publishedAt === 'string') && typeof v.addedAt === 'number';
};

const isPlaylist = (value: unknown): boolean => {
  const p = value as Playlist;
  return !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string'
    && (p.kind === 'custom' || p.kind === 'youtube' || p.kind === 'queue')
    && (p.sourceId === null || typeof p.sourceId === 'string') && typeof p.createdAt === 'number'
    && Array.isArray(p.videos) && p.videos.every(isVideo);
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPrefs = (v: unknown, fields: string[]): boolean => record(v) && fields.every(k => !(k in v) || typeof v[k] === 'boolean');
const isProgress = (v: unknown): boolean => record(v) && Object.values(v).every(p => record(p)
  && typeof p.t === 'number' && Number.isFinite(p.t) && p.t >= 0
  && typeof p.d === 'number' && Number.isFinite(p.d) && p.d > 0 && p.t <= p.d
  && typeof p.done === 'boolean');

/**
 * The whole stored state, as the text of a backup file. `format` is what makes a file ours to read back.
 * An empty profile has no `playlists` key at all, so it is seeded here: without it the export of a
 * fresh install would fail its own import.
 */
export async function backup(): Promise<string> {
  return JSON.stringify({ format: 'tubelist', playlists: [], ...(await chrome.storage.local.get(KEYS)) }, null, 2);
}

/**
 * Validation stops at the shape every renderer reads: a playlist must hold a name, a kind and rows
 * with the fields a row displays, so a file cannot crash the popup or the player after an import.
 * Returns only the keys the file actually carries, so an old backup cannot blank a setting it never
 * knew about.
 */
export function parseBackup(text: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON');
  }
  const file = raw as Record<string, unknown> | null;
  if (!record(file) || file.format !== 'tubelist' || !Array.isArray(file.playlists) || !file.playlists.every(isPlaylist)
    || ('skipPrefs' in file && !(record(file.skipPrefs) && record(file.skipPrefs.categories)
      && Object.values(file.skipPrefs.categories).every(v => typeof v === 'boolean') && isPrefs(file.skipPrefs, ['countdown'])))
    || ('playerPrefs' in file && !isPrefs(file.playerPrefs, ['description', 'sync']))
    || (PROGRESS_KEY in file && !isProgress(file[PROGRESS_KEY]))) {
    throw new Error('Not a TubeList backup file');
  }
  return Object.fromEntries(KEYS.filter(k => k in file).map(k => [k, file[k]]));
}

/**
 * Replaces the stored data with the file's. ponytail: a direct write, not a store op, so an op already
 * in flight in another context (a save from the popup) can still be overwritten — an import is a
 * deliberate overwrite, and the store's serialization exists to keep two *incremental* edits apart.
 */
export async function restore(text: string): Promise<Playlist[]> {
  const data = parseBackup(text);
  await chrome.storage.local.set(data);
  return data.playlists as Playlist[];
}

/** Every TubeList key on this device, preferences included. */
export async function clearAll(): Promise<void> {
  await chrome.storage.local.clear();
}
