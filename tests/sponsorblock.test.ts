import { DEFAULT_SKIP_PREFS, SKIP_OPTIONS, setSkipPrefs } from '../src/lib/store';

// Categories the /api/skipSegments `categories` filter accepts. A typo here silently drops a toggle
// from the frame's request, so the list is pinned. `poi_highlight` is deliberately absent: POI segments
// have start == end, so the frame's range skip can never act on them.
const API_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler'];

it('offers exactly the API categories, plus the countdown row', () => {
  expect(SKIP_OPTIONS.map(o => o.id)).toEqual([...API_CATEGORIES, 'countdown']);
  expect(new Set(SKIP_OPTIONS.map(o => o.label)).size).toBe(SKIP_OPTIONS.length);
  for (const o of SKIP_OPTIONS) expect(o.label.trim()).not.toBe('');
});

it('starts with every category on except filler, and the countdown on', () => {
  expect(Object.keys(DEFAULT_SKIP_PREFS.categories)).toEqual(API_CATEGORIES);
  // SponsorBlock's own guidance: filler is aggressive and should not be on by default.
  expect(DEFAULT_SKIP_PREFS.categories.filler).toBe(false);
  expect(Object.entries(DEFAULT_SKIP_PREFS.categories).filter(([id]) => id !== 'filler').every(([, on]) => on)).toBe(true);
  expect(DEFAULT_SKIP_PREFS.countdown).toBe(true);
});

it('writes one skipPrefs object to local storage', async () => {
  const prefs = { ...DEFAULT_SKIP_PREFS, countdown: false };
  await setSkipPrefs(prefs);
  expect((await chrome.storage.local.get('skipPrefs')).skipPrefs).toEqual(prefs);
});
