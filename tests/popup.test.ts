// @vitest-environment jsdom
import { getPlaylists, savePlaylist, SAVED_SOURCE_ID } from '../src/lib/store';
import { setProgress } from '../src/lib/progress';
import type { Video } from '../src/lib/types';

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';

const vid = (id: string): Video => ({
  id,
  title: 'Video ' + id,
  channel: 'Channel',
  durationSec: 60,
  publishedAt: null,
  thumbnail: 'thumb',
  addedAt: 1,
});

const app = (): HTMLElement => document.getElementById('app') as HTMLElement;
const rows = (): NodeListOf<HTMLElement> => app().querySelectorAll('li');

// The popup renders at import time and then keeps listening, so the module is loaded once per file.
// The import must be dynamic: a static one would run before `#app` exists (and before the mock is up).
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/popup/popup');
});

it('lists a playlist once it exists', async () => {
  await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid(A)] });
  await vi.waitFor(() => expect(rows().length).toBe(1));
  expect(app().textContent).toContain('1 video · 1:00');
});

it('shows the Saved playlist under the name it was given', async () => {
  await savePlaylist({ name: 'Inbox', kind: 'custom', sourceId: SAVED_SOURCE_ID, videos: [] });
  await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid(B)] });
  await vi.waitFor(() => expect(app().querySelectorAll('select[aria-label="Playlist to save into"] option').length).toBe(2));
  expect([...app().querySelectorAll('select[aria-label="Playlist to save into"] option')].map(o => o.textContent)).toEqual(['Inbox', 'A']);
});

it('repaints progress in place instead of rebuilding the open playlist', async () => {
  await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid(A), vid(B)] });
  await vi.waitFor(() => expect(rows().length).toBe(1));

  (app().querySelector('ul li button') as HTMLElement).click();
  await vi.waitFor(() => expect(app().querySelectorAll('li.vid').length).toBe(2));

  const row = app().querySelector('li.vid') as HTMLElement;
  await setProgress(A, 50, 100, false);
  await vi.waitFor(() => expect(row.querySelector('[data-progress]')).not.toBeNull());

  expect(app().querySelector('li.vid')).toBe(row); // same node: nothing was rebuilt
  expect((row.querySelector('[data-progress]')!.firstElementChild as HTMLElement).style.width).toBe('50%');
});

const appButton = (label: string): HTMLButtonElement =>
  [...app().querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement;
const dialogButton = (label: string): HTMLButtonElement =>
  [...document.querySelectorAll('dialog button')].find(b => b.textContent === label) as HTMLButtonElement;

it('deletes a playlist only once the confirm dialog is accepted', async () => {
  await savePlaylist({ name: 'Doomed', kind: 'custom', sourceId: null, videos: [vid(A)] });
  // Whatever view the previous test left behind, get to the list: storage was cleared between tests,
  // so the open playlist is gone and `Back` may or may not still be on screen.
  await vi.waitFor(() => {
    const back = app().querySelector('[aria-label="Back"]');
    if (back) (back as HTMLElement).click();
    expect([...rows()].some(r => r.textContent?.includes('Doomed'))).toBe(true);
  });
  ([...app().querySelectorAll('li > button')].find(b => b.textContent?.includes('Doomed')) as HTMLElement).click();
  await vi.waitFor(() => expect(appButton('Delete')).toBeTruthy());

  appButton('Delete').click();
  await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
  dialogButton('Cancel').click();
  // Everything the click queued runs here, on faked time: a dialog that wrongly confirmed would have
  // queued its delete a few microtasks later, so reading storage straight after the click would race it.
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  expect(document.querySelector('dialog')).toBeNull();
  expect((await getPlaylists()).some(p => p.name === 'Doomed')).toBe(true);
  // Still the detail view: a deleted playlist would have taken the popup back to the list.
  expect((app().querySelector('[aria-label="Playlist name"]') as HTMLInputElement).value).toBe('Doomed');

  appButton('Delete').click();
  await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
  dialogButton('Delete').click();
  await vi.waitFor(async () => expect((await getPlaylists()).some(p => p.name === 'Doomed')).toBe(false));
  expect(app().textContent).not.toContain('Doomed');
});

const openPlaylist = async (name: string): Promise<void> => {
  ([...app().querySelectorAll('li > button')].find(b => b.textContent?.includes(name)) as HTMLElement).click();
  await vi.waitFor(() => expect(app().querySelector('[aria-label="Playlist name"]')).not.toBeNull());
};

it('holds edits until Save, and offers save or discard on the way back', async () => {
  await savePlaylist({ name: 'Edit me', kind: 'custom', sourceId: null, videos: [vid(A)] });
  await vi.waitFor(() => expect([...rows()].some(r => r.textContent?.includes('Edit me'))).toBe(true));
  await openPlaylist('Edit me');

  const rename = async (to: string): Promise<void> => {
    const input = app().querySelector('[aria-label="Playlist name"]') as HTMLInputElement;
    input.value = to;
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(appButton('Save')).toBeTruthy()); // the Save button appears only once the draft is dirty
  };

  await rename('Discarded');
  expect((await getPlaylists())[0].name).toBe('Edit me'); // nothing is applied before Save

  (app().querySelector('[aria-label="Back"]') as HTMLElement).click();
  await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
  dialogButton('Discard').click();
  await vi.waitFor(() => expect(app().querySelector('[aria-label="Playlist name"]')).toBeNull()); // back on the list
  expect((await getPlaylists())[0].name).toBe('Edit me');

  await openPlaylist('Edit me');
  await rename('Kept');
  appButton('Save').click();
  await vi.waitFor(async () => expect((await getPlaylists())[0].name).toBe('Kept'));
});
