import { addToSaved, addVideo, getPlaylists, handleStoreMessage, removeVideo, savePlaylist } from '../src/lib/store';
import type { Video } from '../src/lib/types';

const vid = (id: string): Video => ({ id, title: 'V ' + id, channel: 'C', durationSec: 10, publishedAt: null, thumbnail: 't', addedAt: 1 });

const runtime = chrome.runtime as unknown as {
  sendMessage?: (message: unknown, respond: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

/** Stands in for the service worker: the popup and player paths send the op over the runtime channel. */
function useChannel(): () => void {
  runtime.sendMessage = (message, respond) => {
    if (!handleStoreMessage(message, null, respond)) runtime.lastError = { message: 'Could not establish connection' };
  };
  return () => {
    delete runtime.sendMessage;
    delete runtime.lastError;
  };
}

it('applies an op sent over the runtime channel and answers with its value', async () => {
  const restore = useChannel();
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa')] });
  expect(p.id).toBeTruthy();
  expect(await addToSaved(vid('bbbbbbbbbbb'))).toBe('added');
  expect((await getPlaylists()).map(x => x.name).sort()).toEqual(['A', 'Saved']);
  restore();
});

it('does not lose an op that overlaps another', async () => {
  const restore = useChannel();
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [] });
  await Promise.all([addVideo(p.id, vid('aaaaaaaaaaa')), addVideo(p.id, vid('bbbbbbbbbbb'))]);
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  restore();
});

it('surfaces a failed op instead of silently changing nothing', async () => {
  const restore = useChannel();
  await expect(removeVideo('nope', 'aaaaaaaaaaa')).rejects.toThrow('Playlist not found');
  restore();
});

it('reports an unreachable background rather than writing on its own', async () => {
  runtime.sendMessage = (_message, respond) => {
    runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
    respond(undefined);
  };
  await expect(savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [] })).rejects.toThrow('Could not establish connection');
  expect(await getPlaylists()).toEqual([]);
  delete runtime.sendMessage;
  delete runtime.lastError;
});

it('reports a background that answered with nothing', async () => {
  runtime.sendMessage = (_message, respond) => respond(undefined);
  await expect(savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [] })).rejects.toThrow('did not answer');
  expect(await getPlaylists()).toEqual([]);
  delete runtime.sendMessage;
});

it('ignores messages that are not store ops', () => {
  expect(handleStoreMessage({ type: 'sb:segments', prefix: 'ab12', categories: ['sponsor'] }, null, () => {})).toBe(false);
  expect(handleStoreMessage(null, null, () => {})).toBe(false);
});
