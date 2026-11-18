// @vitest-environment jsdom
import { getPlayerPrefs, getSkipPrefs, setPlayerPrefs } from '../src/lib/store';

const app = (): HTMLElement => document.getElementById('app') as HTMLElement;
// Renders at import time, so the import waits for the page markup.
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/settings/settings');
});

const row = (label: string): HTMLElement =>
  [...app().querySelectorAll<HTMLElement>('[role="switch"]')].find(el => el.getAttribute('aria-label') === label)!;

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