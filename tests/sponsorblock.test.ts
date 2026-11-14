import { DEFAULT_SKIP_PREFS, SKIP_OPTIONS, setSkipPrefs } from '../src/lib/store';

// Categories the /api/skipSegments `categories` filter accepts. A typo here silently drops a toggle
// from the frame's request, so the list is pinned.
const API_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler', 'poi_highlight'];

it('offers exactly the API categories, plus the countdown row', () => {
  expect(SKIP_OPTIONS.map(o => o.id)).toEqual([...API_CATEGORIES, 'countdown']);
  expect(new Set(SKIP_OPTIONS.map(o => o.label)).size).toBe(SKIP_OPTIONS.length);
  for (const o of SKIP_OPTIONS) expect(o.label.trim()).not.toBe('');
});

it('starts with every category and the countdown on', () => {
  expect(Object.keys(DEFAULT_SKIP_PREFS.categories)).toEqual(API_CATEGORIES);
  expect(Object.values(DEFAULT_SKIP_PREFS.categories).every(v => v === true)).toBe(true);
  expect(DEFAULT_SKIP_PREFS.countdown).toBe(true);
});

it('writes one skipPrefs object to local storage', async () => {
  const prefs = { ...DEFAULT_SKIP_PREFS, countdown: false };
  await setSkipPrefs(prefs);
  expect((await chrome.storage.local.get('skipPrefs')).skipPrefs).toEqual(prefs);
});