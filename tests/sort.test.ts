import { sortVideos } from '../src/lib/sort';
import { getPlaylists, savePlaylist, setSort } from '../src/lib/store';
import type { Video } from '../src/lib/types';

const v = (id: string, title: string, addedAt: number, durationSec: number | null): Video => ({
  id, title, channel: 'c', durationSec, publishedAt: null, thumbnail: 't', addedAt,
});

const A = v('aaaaaaaaaaa', 'Zeta', 300, 120);
const B = v('bbbbbbbbbbb', 'alpha', 100, 600);
const C = v('ccccccccccc', 'Beta', 200, null);
const list = [A, B, C];

const ids = (videos: Video[]): string[] => videos.map(x => x.id);

it('manual and absent keep the stored order and the same array', () => {
  expect(sortVideos(list, 'manual')).toBe(list);
  expect(sortVideos(list, undefined)).toBe(list);
});

it('sorts by date added', () => {
  expect(ids(sortVideos(list, 'newest'))).toEqual(['aaaaaaaaaaa', 'ccccccccccc', 'bbbbbbbbbbb']);
  expect(ids(sortVideos(list, 'oldest'))).toEqual(['bbbbbbbbbbb', 'ccccccccccc', 'aaaaaaaaaaa']);
});

it('sorts longest first, unknown durations last', () => {
  expect(ids(sortVideos(list, 'longest'))).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa', 'ccccccccccc']);
});

it('sorts by title, case-insensitive', () => {
  expect(ids(sortVideos(list, 'letter'))).toEqual(['bbbbbbbbbbb', 'ccccccccccc', 'aaaaaaaaaaa']);
});

it('does not mutate the stored array', () => {
  sortVideos(list, 'letter');
  expect(ids(list)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
});

it('persists the sort choice per playlist', async () => {
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: list });
  await setSort(p.id, 'oldest');
  expect((await getPlaylists())[0].sort).toBe('oldest');
});
