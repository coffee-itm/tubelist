import type { Playlist, PlaylistKind, PlayerPrefs, SkipPrefs, Video } from './types';
import { PROGRESS_KEY, withProgressLock } from './progress';

const KEY = 'playlists';

const read = async (): Promise<Playlist[]> => ((await chrome.storage.local.get(KEY))[KEY] as Playlist[] | undefined) ?? [];
const write = async (playlists: Playlist[]): Promise<void> => {
  await chrome.storage.local.set({ [KEY]: playlists });
};

export interface SaveInput {
  name: string;
  kind: PlaylistKind;
  sourceId: string | null;
  videos: Video[];
}

export const SAVED_SOURCE_ID = 'tubelist:saved';

/**
 * Every playlist write is one of these. The service worker is the only context that applies them
 * (`installStoreServer`), so two contexts editing at once cannot lose each other's write; callers
 * elsewhere send the op and get the result back. `removed` lists video ids the op dropped, which the
 * writer prunes from progress.
 */
type StoreOp =
  | { op: 'save'; input: SaveInput }
  | { op: 'addVideo'; playlistId: string; video: Video }
  | { op: 'addToSaved'; video: Video }
  | { op: 'removeVideo'; playlistId: string; videoId: string }
  | { op: 'moveVideo'; playlistId: string; from: number; to: number }
  | { op: 'rename'; playlistId: string; name: string }
  | { op: 'delete'; playlistId: string };

interface OpOutcome {
  playlists: Playlist[];
  value: unknown;
  removed: string[];
}

function applyOp(playlists: Playlist[], op: StoreOp): OpOutcome {
  const find = (id: string): Playlist => {
    const p = playlists.find(x => x.id === id);
    if (!p) throw new Error('Playlist not found');
    return p;
  };
  const keep = (value: unknown = null): OpOutcome => ({ playlists, value, removed: [] });

  switch (op.op) {
    case 'save': {
      const existing = op.input.sourceId === null ? undefined : playlists.find(x => x.sourceId === op.input.sourceId);
      if (existing) {
        const next = new Set(op.input.videos.map(v => v.id));
        const removed = existing.videos.map(v => v.id).filter(id => !next.has(id));
        existing.name = op.input.name;
        existing.kind = op.input.kind;
        existing.videos = op.input.videos;
        return { playlists, value: existing, removed };
      }
      const saved: Playlist = { ...op.input, id: crypto.randomUUID(), createdAt: Date.now() };
      playlists.push(saved);
      return { playlists, value: saved, removed: [] };
    }
    case 'addVideo': {
      const p = find(op.playlistId);
      if (p.videos.some(v => v.id === op.video.id)) return keep('duplicate');
      p.videos.push(op.video);
      return keep('added');
    }
    case 'addToSaved': {
      let p = playlists.find(x => x.sourceId === SAVED_SOURCE_ID);
      if (!p) {
        p = { id: crypto.randomUUID(), name: 'Saved', kind: 'custom', sourceId: SAVED_SOURCE_ID, createdAt: Date.now(), videos: [] };
        playlists.push(p);
      }
      if (p.videos.some(v => v.id === op.video.id)) return keep('duplicate');
      p.videos.push(op.video);
      return keep('added');
    }
    case 'removeVideo': {
      const p = find(op.playlistId);
      p.videos = p.videos.filter(v => v.id !== op.videoId);
      return { playlists, value: null, removed: [op.videoId] };
    }
    case 'moveVideo': {
      if (op.from === op.to) return keep();
      const p = find(op.playlistId);
      if (op.from < 0 || op.to < 0 || op.from >= p.videos.length || op.to >= p.videos.length) return keep();
      p.videos.splice(op.to, 0, ...p.videos.splice(op.from, 1));
      return keep();
    }
    case 'rename':
      find(op.playlistId).name = op.name;
      return keep();
    case 'delete': {
      const p = playlists.find(x => x.id === op.playlistId);
      if (!p) return keep(); // already gone: deleting twice is not an error
      playlists.splice(playlists.indexOf(p), 1);
      return { playlists, value: null, removed: p.videos.map(v => v.id) };
    }
    default:
      throw new Error('Unknown store operation');
  }
}

const isVideo = (v: unknown): v is Video => !!v && typeof v === 'object'
  && typeof (v as Video).id === 'string' && typeof (v as Video).title === 'string'
  && typeof (v as Video).channel === 'string' && typeof (v as Video).thumbnail === 'string'
  && (typeof (v as Video).durationSec === 'number' || (v as Video).durationSec === null)
  && (typeof (v as Video).publishedAt === 'string' || (v as Video).publishedAt === null)
  && typeof (v as Video).addedAt === 'number';

function validOp(op: StoreOp): boolean {
  switch (op.op) {
    case 'save': return !!op.input && typeof op.input.name === 'string'
      && ['custom', 'youtube', 'queue'].includes(op.input.kind)
      && (op.input.sourceId === null || typeof op.input.sourceId === 'string')
      && Array.isArray(op.input.videos) && op.input.videos.every(isVideo);
    case 'addVideo': return typeof op.playlistId === 'string' && isVideo(op.video);
    case 'addToSaved': return isVideo(op.video);
    case 'removeVideo': return typeof op.playlistId === 'string' && typeof op.videoId === 'string';
    case 'moveVideo': return typeof op.playlistId === 'string' && Number.isInteger(op.from) && Number.isInteger(op.to);
    case 'rename': return typeof op.playlistId === 'string' && typeof op.name === 'string';
    case 'delete': return typeof op.playlistId === 'string';
    default: return false;
  }
}

/** Progress rows for videos no playlist holds any more. Never touches a row another playlist still needs. */
async function pruneProgress(ids: string[], playlists: Playlist[]): Promise<void> {
  const held = new Set(playlists.flatMap(p => p.videos.map(v => v.id)));
  const orphans = ids.filter(id => !held.has(id));
  if (orphans.length === 0) return;
  await withProgressLock(async () => {
    const res = await chrome.storage.local.get(PROGRESS_KEY);
    const all = (res[PROGRESS_KEY] as Record<string, unknown> | undefined) ?? {};
    let changed = false;
    for (const id of orphans) {
      if (id in all) {
        delete all[id];
        changed = true;
      }
    }
    if (changed) await chrome.storage.local.set({ [PROGRESS_KEY]: all });
  });
}

async function runOp(op: StoreOp): Promise<OpOutcome> {
  const playlists = await read();
  const outcome = applyOp(playlists, op);
  await write(outcome.playlists);
  if (outcome.removed.length) await pruneProgress(outcome.removed, outcome.playlists);
  return outcome;
}

const CHANNEL = 'tubelist:store';
type Envelope = { ok: true; value: unknown } | { ok: false; error: string };

let isServer = false;
/** Serializes this context's own ops; cross-context ops are serialized by the server's chain. */
let localQueue: Promise<unknown> = Promise.resolve();

function enqueue(op: StoreOp): Promise<OpOutcome> {
  const job = localQueue.then(() => runOp(op));
  localQueue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

/** Handler for `chrome.runtime.onMessage`; returns false for anything that is not a store op. */
export function handleStoreMessage(message: unknown, _sender: unknown, respond: (response: Envelope) => void): boolean {
  const m = message as { type?: unknown; op?: StoreOp } | null;
  if (!m || m.type !== CHANNEL || typeof m.op !== 'object' || m.op === null) return false;
  if (!validOp(m.op)) { respond({ ok: false, error: 'Invalid store operation' }); return true; }
  void enqueue(m.op).then(
    outcome => respond({ ok: true, value: outcome.value }),
    (err: unknown) => respond({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true;
}

/** Called once from the service worker: it and only it applies playlist ops. */
export function installStoreServer(): void {
  isServer = true;
  chrome.runtime.onMessage.addListener(handleStoreMessage);
}

/** Callback form on purpose: Firefox's `chrome.*` namespace is not documented to return a promise. */
function sendOp(op: StoreOp): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  chrome.runtime.sendMessage({ type: CHANNEL, op }, (res: unknown) => {
    const err = chrome.runtime.lastError;
    if (err) reject(new Error(err.message ?? 'TubeList background is unavailable'));
    else resolve(res);
  });
  return promise;
}

async function mutate<R>(op: StoreOp): Promise<R> {
  // No runtime messaging (tests, or a page loaded outside the extension): apply locally.
  if (isServer || typeof chrome.runtime?.sendMessage !== 'function') return (await enqueue(op)).value as R;
  const res = (await sendOp(op)) as Envelope | undefined;
  if (!res) throw new Error('TubeList background did not answer; try again');
  if (!res.ok) throw new Error(res.error);
  return res.value as R;
}

export async function getPlaylists(): Promise<Playlist[]> {
  return (await read()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function savePlaylist(input: SaveInput): Promise<Playlist> {
  return mutate<Playlist>({ op: 'save', input });
}

export async function findBySourceId(sourceId: string): Promise<Playlist | undefined> {
  return (await read()).find(p => p.sourceId === sourceId);
}

export async function addVideo(playlistId: string, video: Video): Promise<'added' | 'duplicate'> {
  return mutate<'added' | 'duplicate'>({ op: 'addVideo', playlistId, video });
}

export async function addToSaved(video: Video): Promise<'added' | 'duplicate'> {
  return mutate<'added' | 'duplicate'>({ op: 'addToSaved', video });
}

export async function removeVideo(playlistId: string, videoId: string): Promise<void> {
  await mutate({ op: 'removeVideo', playlistId, videoId });
}

export async function moveVideo(playlistId: string, from: number, to: number): Promise<void> {
  await mutate({ op: 'moveVideo', playlistId, from, to });
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  await mutate({ op: 'rename', playlistId, name });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await mutate({ op: 'delete', playlistId });
}

// SponsorBlock: the frame reads the raw object and filters on `prefs[category]`, so it never holds this list.
const SKIP_KEY = 'skipPrefs';

/** The `skip` categories the SponsorBlock API accepts, plus the countdown row (`countdown` is not a category). */
export const SKIP_OPTIONS: { id: string; label: string }[] = [
  { id: 'sponsor', label: 'Skip sponsors' },
  { id: 'selfpromo', label: 'Skip self-promotion' },
  { id: 'interaction', label: 'Skip engagement reminders' },
  { id: 'intro', label: 'Skip intros' },
  { id: 'outro', label: 'Skip outros' },
  { id: 'preview', label: 'Skip previews' },
  { id: 'music_offtopic', label: 'Skip non-music sections' },
  { id: 'filler', label: 'Skip off-topic sections' },
  { id: 'countdown', label: 'Sponsor skip countdown' },
];

// SponsorBlock's own warning: `filler` is aggressive and should not be on by default.
const OFF_BY_DEFAULT: Record<string, true> = { filler: true };

export const DEFAULT_SKIP_PREFS: SkipPrefs = {
  categories: Object.fromEntries(SKIP_OPTIONS.filter(o => o.id !== 'countdown').map(o => [o.id, !OFF_BY_DEFAULT[o.id]])),
  countdown: true,
};

/** Merges over the defaults and drops rows that no longer exist, so a category set is always current. */
export async function getSkipPrefs(): Promise<SkipPrefs> {
  const saved = ((await chrome.storage.local.get(SKIP_KEY))[SKIP_KEY] ?? {}) as Partial<SkipPrefs>;
  const categories: Record<string, boolean> = { ...DEFAULT_SKIP_PREFS.categories };
  for (const o of SKIP_OPTIONS) {
    if (o.id === 'countdown') continue;
    const value = saved.categories?.[o.id];
    if (typeof value === 'boolean') categories[o.id] = value;
  }
  return { categories, countdown: saved.countdown ?? true };
}

export async function setSkipPrefs(p: SkipPrefs): Promise<void> {
  await chrome.storage.local.set({ [SKIP_KEY]: p });
}

/** Writes the defaults once: the framed player reads the raw object and needs the category list to exist. */
export async function ensureSkipPrefs(): Promise<void> {
  const res = await chrome.storage.local.get(SKIP_KEY);
  if (!res[SKIP_KEY]) await setSkipPrefs(DEFAULT_SKIP_PREFS);
}

// Player toggles. The player page reads these raw; defaults cover an older profile that never saved them.
const PLAYER_KEY = 'playerPrefs';
export const DEFAULT_PLAYER_PREFS: PlayerPrefs = { description: true, sync: false };

export async function getPlayerPrefs(): Promise<PlayerPrefs> {
  const saved = ((await chrome.storage.local.get(PLAYER_KEY))[PLAYER_KEY] ?? {}) as Partial<PlayerPrefs>;
  return {
    description: typeof saved.description === 'boolean' ? saved.description : DEFAULT_PLAYER_PREFS.description,
    sync: typeof saved.sync === 'boolean' ? saved.sync : DEFAULT_PLAYER_PREFS.sync,
  };
}

export async function setPlayerPrefs(p: PlayerPrefs): Promise<void> {
  await chrome.storage.local.set({ [PLAYER_KEY]: p });
}

// ponytail: code points, not grapheme clusters — a flag emoji can still be cut in half at 100.
export function cleanName(raw: string, fallback: string): string {
  const name = [...raw.trim().replace(/\s+/g, ' ')].slice(0, 100).join('');
  return name || fallback;
}
