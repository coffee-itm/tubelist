import { saveLink } from '../src/lib/save';
import { getPlaylists, savePlaylist, addToSaved, SAVED_SOURCE_ID } from '../src/lib/store';
import type { Video } from '../src/lib/types';

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';

const player = (id: string) => ({
  videoDetails: { videoId: id, title: 'Video ' + id, author: 'Channel', lengthSeconds: '60' },
  microformat: { playerMicroformatRenderer: { publishDate: '2026-01-02' } },
});

globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const req: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
  const videoId = req && typeof req === 'object' && 'videoId' in req && typeof req.videoId === 'string' ? req.videoId : '';
  const body = String(url).includes('/player')
    ? player(videoId)
    : { metadata: { playlistMetadataRenderer: { title: 'My List' } }, contents: [{ lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: B } }] };
  return { ok: true, json: async () => body };
}) as unknown as typeof fetch;

const video = (id: string): Video => ({ id, title: 'Video ' + id, channel: 'Channel', durationSec: 60, publishedAt: null, thumbnail: 'thumb', addedAt: 1 });

it('adds a pasted video link to Saved', async () => {
  expect(await saveLink({ type: 'video', videoId: A }, { kind: 'saved' })).toBe('Added to Saved: Video ' + A);
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual([A]);
  expect(await saveLink({ type: 'video', videoId: A }, { kind: 'saved' })).toBe('Already in Saved: Video ' + A);
});

it('adds a pasted video link to a target playlist', async () => {
  const p = await savePlaylist({ name: 'Custom', kind: 'custom', sourceId: null, videos: [] });
  expect(await saveLink({ type: 'video', videoId: A }, { kind: 'playlist', playlistId: p.id, name: 'Custom' })).toBe('Added to Custom: Video ' + A);
  expect((await getPlaylists()).find(x => x.id === p.id)?.videos.map(v => v.id)).toEqual([A]);
});

it('saves a pasted playlist link as its own playlist', async () => {
  expect(await saveLink({ type: 'playlist', listId: 'PL1', videoId: null }, { kind: 'saved' })).toBe('Saved 1 video to My List');
  const p = (await getPlaylists())[0];
  expect([p.kind, p.sourceId, p.name]).toEqual(['youtube', 'PL1', 'My List']);
  expect(p.videos.map(v => v.id)).toEqual([B]);
});

it('saves a watch_videos queue as its own playlist', async () => {
  const message = await saveLink({ type: 'queue', listId: null, videoIds: [A, B], videoId: null }, { kind: 'saved' });
  expect(message).toMatch(/^Saved 2 videos to Queue /);
  const p = (await getPlaylists())[0];
  expect([p.kind, p.sourceId]).toEqual(['queue', null]);
  expect(p.videos.map(v => v.id)).toEqual([A, B]);
});

it('names the videos it could not read instead of dropping them silently', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { videoId?: string };
    if (String(url).includes('/player')) {
      if (body.videoId === B) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => player(body.videoId ?? '') };
    }
    return {
      ok: true,
      json: async () => ({
        metadata: { playlistMetadataRenderer: { title: 'My List' } },
        contents: [
          { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: A } },
          { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: B } },
        ],
      }),
    };
  }) as unknown as typeof fetch);

  expect(await saveLink({ type: 'playlist', listId: 'PL1', videoId: null }, { kind: 'saved' })).toBe('Saved 1 video to My List (1 unavailable)');
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual([A]);
  vi.unstubAllGlobals();
});

it('does not overwrite an existing playlist when a refresh cannot read every video', async () => {
  await savePlaylist({ name: 'My List', kind: 'youtube', sourceId: 'PL1', videos: [video(A), video(B)] });
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { videoId?: string };
    if (String(url).includes('/player')) return body.videoId === B
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => player(A) };
    return { ok: true, json: async () => ({
      metadata: { playlistMetadataRenderer: { title: 'My List' } },
      contents: [A, B].map(id => ({ lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: id } })),
    }) };
  }) as unknown as typeof fetch);
  try {
    await expect(saveLink({ type: 'playlist', listId: 'PL1', videoId: null }, { kind: 'saved' })).rejects.toThrow('incomplete');
    expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual([A, B]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects a non-YouTube link', async () => {
  await expect(saveLink({ type: 'invalid' }, { kind: 'saved' })).rejects.toThrow('Not a YouTube video/playlist link');
});

it('keeps a video out of the Saved playlist when added elsewhere', async () => {
  await addToSaved(video(A));
  const p = await savePlaylist({ name: 'Custom', kind: 'custom', sourceId: null, videos: [] });
  await saveLink({ type: 'video', videoId: B }, { kind: 'playlist', playlistId: p.id, name: 'Custom' });
  const saved = (await getPlaylists()).find(x => x.sourceId === SAVED_SOURCE_ID);
  expect(saved?.videos.map(v => v.id)).toEqual([A]);
});
