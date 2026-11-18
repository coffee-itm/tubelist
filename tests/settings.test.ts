// @vitest-environment jsdom
import { getPlayerPrefs, getSkipPrefs, getPlaylists, savePlaylist, setPlayerPrefs } from '../src/lib/store';
import { clearAll } from '../src/lib/backup';
import type { Video } from '../src/lib/types';

const app = (): HTMLElement => document.getElementById('app') as HTMLElement;
// Renders at import time, so the import waits for the page markup.
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/settings/settings');
});

const row = (label: string): HTMLElement =>
  [...app().querySelectorAll<HTMLElement>('[role="switch"]')].find(el => el.getAttribute('aria-label') === label)!;

const button = (label: string): HTMLButtonElement =>
  [...app().querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === label)!;

const status = (): HTMLElement => app().querySelector<HTMLElement>('[role="status"]')!;

const vid = (id: string): Video => ({
  id,
  title: 'Video ' + id,
  channel: 'Channel',
  durationSec: 60,
  publishedAt: null,
  thumbnail: 'thumb',
  addedAt: 1,
});

it('renders every SponsorBlock row plus the two Player toggles', async () => {
  await vi.waitFor(() => expect(app().querySelectorAll('[role="switch"]')).toHaveLength(11));
  expect(app().textContent).toContain('Player');
  expect(row('Show video description').getAttribute('aria-checked')).toBe('true');
  expect(row('Sync with logged YouTube account').getAttribute('aria-checked')).toBe('false');
});

it('persists a player toggle and repaints its row', async () => {
  row('Show video description').click();
  await vi.waitFor(async () => expect((await getPlayerPrefs()).description).toBe(false));
  expect(row('Show video description').getAttribute('aria-checked')).toBe('false');
  await setPlayerPrefs({ description: true, sync: false });
});

it('persists a SponsorBlock toggle', async () => {
  row('Skip intros').click();
  await vi.waitFor(async () => expect((await getSkipPrefs()).categories.intro).toBe(false));
  expect(row('Skip intros').getAttribute('aria-checked')).toBe('false');
});

it('exports the stored data, imports it back and clears everything', async () => {
  await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [vid('aaaaaaaaaaa')] });

  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    blobs.push(blob as Blob);
    return 'blob:test';
  });
  // jsdom has no download machinery: an unstubbed click prints "Not implemented: navigation".
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  button('Export').click();
  await vi.waitFor(() => expect(blobs).toHaveLength(1));
  expect(click).toHaveBeenCalledOnce();
  const text = await blobs[0].text();
  expect(JSON.parse(text)).toHaveProperty('format', 'tubelist');
  expect(status().textContent).toBe('Backup downloaded.');

  await clearAll();
  expect(await getPlaylists()).toHaveLength(0);

  const input = app().querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File([text], 'backup.json', { type: 'application/json' })] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(status().textContent).toContain('Imported 1 playlist'));
  expect((await getPlaylists())[0].videos.map(v => v.id)).toEqual(['aaaaaaaaaaa']);

  button('Clear all data').click();
  await vi.waitFor(() => expect(document.querySelector('dialog')).toBeTruthy());
  document.querySelector<HTMLButtonElement>('dialog button[value="ok"]')!.click();
  await vi.waitFor(async () => expect(await getPlaylists()).toHaveLength(0));
  expect(status().textContent).toBe('All TubeList data cleared.');
  expect(app().querySelectorAll('[role="switch"]')).toHaveLength(11); // the page still works after a clear
});