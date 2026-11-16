import type { Video } from './types';
import { VIDEO_ID_RE, thumbUrl } from './url';

const BASE = 'https://www.youtube.com/youtubei/v1/';
export const CLIENT_VERSION = '2.20261112.00.00';

async function call(endpoint: 'player' | 'next' | 'browse', body: object): Promise<unknown> {
  const res = await fetch(BASE + endpoint + '?prettyPrint=false', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION, hl: 'en', gl: 'US' } }, ...body }),
  });
  if (!res.ok) throw new Error(`YouTube ${endpoint} failed: HTTP ${res.status}`);
  return res.json();
}

const obj = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function findAll(value: unknown, key: string): unknown[] {
  const out: unknown[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    const o = obj(v);
    if (!o) return;
    for (const [k, val] of Object.entries(o)) {
      if (k === key) out.push(val);
      walk(val);
    }
  };
  walk(value);
  return out;
}

export function parsePlayer(json: unknown): Omit<Video, 'addedAt'> | null {
  const j = obj(json);
  const videoDetails = obj(j?.videoDetails);
  const id = str(videoDetails?.videoId);
  if (!id) return null;
  const microformat = obj(j?.microformat);
  const renderer = obj(microformat?.playerMicroformatRenderer);
  return {
    id,
    title: str(videoDetails?.title) ?? '',
    channel: str(videoDetails?.author) ?? '',
    durationSec: Number(videoDetails?.lengthSeconds) || null,
    publishedAt: str(renderer?.publishDate) ?? str(renderer?.uploadDate) ?? null,
    thumbnail: thumbUrl(id),
  };
}

export function parseBrowse(json: unknown): { title: string | null; ids: string[]; continuation: string | null } {
  const metadata = obj(obj(json)?.metadata);
  const title = str(obj(metadata?.playlistMetadataRenderer)?.title);

  const ids: string[] = [];
  for (const raw of findAll(json, 'lockupViewModel')) {
    const lockup = obj(raw);
    if (lockup?.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') continue;
    const id = str(lockup.contentId);
    if (id && VIDEO_ID_RE.test(id)) ids.push(id);
  }
  for (const raw of findAll(json, 'playlistVideoRenderer')) {
    const id = str(obj(raw)?.videoId);
    if (id && VIDEO_ID_RE.test(id)) ids.push(id);
  }

  let continuation: string | null = null;
  for (const item of [...findAll(json, 'continuationItemViewModel'), ...findAll(json, 'continuationItemRenderer')]) {
    for (const cmd of findAll(item, 'continuationCommand')) {
      const token = str(obj(cmd)?.token);
      if (token) {
        continuation = token;
        break;
      }
    }
    if (continuation) break;
  }

  return { title, ids, continuation };
}

export function parseNext(json: unknown): { title: string | null; ids: string[] } {
  const contents = obj(obj(json)?.contents);
  const watchNext = obj(contents?.twoColumnWatchNextResults);
  const playlist = obj(obj(watchNext?.playlist)?.playlist);
  const title = str(playlist?.title);
  const ids = arr(playlist?.contents)
    .map(c => str(obj(obj(c)?.playlistPanelVideoRenderer)?.videoId))
    .filter((id): id is string => !!id && VIDEO_ID_RE.test(id));
  return { title, ids };
}

export async function fetchVideo(id: string): Promise<Omit<Video, 'addedAt'> | null> {
  return parsePlayer(await call('player', { videoId: id }));
}

export async function fetchPlaylistIds(listId: string): Promise<{ title: string | null; ids: string[] }> {
  const first = parseBrowse(await call('browse', { browseId: 'VL' + listId }));
  let title = first.title;
  const ids = [...first.ids];
  let continuation = first.continuation;
  let pages = 1;
  // ponytail: 200 pages (~20k videos) and stop; a longer playlist is truncated silently. Upgrade: keep
  // paging and report the truncation to the caller.
  while (continuation && pages < 200) {
    const page = parseBrowse(await call('browse', { continuation }));
    if (!title) title = page.title;
    ids.push(...page.ids);
    continuation = page.continuation;
    pages++;
  }
  const unique = [...new Set(ids)];
  if (!title && unique.length === 0) throw new Error('Playlist not found or private');
  return { title, ids: unique };
}

export async function fetchQueueIds(info: { listId: string | null; videoIds: string[] }): Promise<string[]> {
  if (info.listId === null) return info.videoIds;
  // ponytail: next returns ≤~200 items; queues larger than that are truncated. Upgrade: page via next continuation if users hit it.
  return parseNext(await call('next', { playlistId: info.listId })).ids;
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (e) {
        results[i] = { status: 'rejected', reason: e };
      }
      done++;
      onProgress?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Fetches what it can; `failed` counts videos whose metadata could not be read (unavailable, blocked, error). */
export async function fetchVideos(
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ videos: Video[]; failed: number }> {
  const results = await mapPool(ids, 6, fetchVideo, onProgress);
  const addedAt = Date.now();
  const videos: Video[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) videos.push({ ...r.value, addedAt });
    else failed++;
  }
  return { videos, failed };
}