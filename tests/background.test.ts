// The service worker was the one module with no test at all. It owns the context menus, the DNR rules
// and the two message relays, so a bug here is invisible until a user right-clicks something.
import { getPlaylists, savePlaylist, SAVED_SOURCE_ID } from '../src/lib/store';

type Listener = (...args: never[]) => unknown;

const listeners = {
  message: [] as ((msg: unknown, sender: unknown, respond: (r: unknown) => void) => unknown)[],
  installed: [] as (() => void)[],
  startup: [] as (() => void)[],
  changed: [] as ((changes: Record<string, unknown>, area: string) => void)[],
  clicked: [] as ((info: chrome.contextMenus.OnClickData, tab?: { id?: number }) => void)[],
};

const badges: { text: string; title: string }[] = [];
const menus: { id: string; title: string; parentId?: string }[] = [];
const inserted: { tabId: number; frameIds: number[]; css: string }[] = [];
const rules: { removeRuleIds?: number[]; addRules?: { id: number }[] }[] = [];
const warns: unknown[][] = [];

/** The service worker's own listeners, wired onto the shared mock before it is imported. */
function installChromeMock(): void {
  const c = chrome as unknown as Record<string, Record<string, unknown>>;
  Object.assign(c.runtime, {
    lastError: undefined,
    onMessage: { addListener: (l: Listener) => void listeners.message.push(l as never) },
    onInstalled: { addListener: (l: () => void) => void listeners.installed.push(l) },
    onStartup: { addListener: (l: () => void) => void listeners.startup.push(l) },
  });
  Object.assign(c.storage, {
    onChanged: { addListener: (l: Listener) => void listeners.changed.push(l as never) },
  });
  c.declarativeNetRequest = {
    updateDynamicRules: async (r: { removeRuleIds?: number[]; addRules?: { id: number }[] }) => void rules.push(r),
  };
  c.contextMenus = {
    create: (props: { id: string; title: string; parentId?: string }, cb?: () => void) => void (menus.push(props), cb?.()),
    removeAll: async () => void (menus.length = 0),
    onClicked: { addListener: (l: Listener) => void listeners.clicked.push(l as never) },
  };
  c.action = {
    setBadgeText: async ({ text }: { text: string }) => void badges.push({ text, title: lastTitle() }),
    setBadgeBackgroundColor: async () => {},
    setTitle: async ({ title }: { title: string }) => void badges.push({ text: lastText(), title }),
  };
  c.scripting = {
    executeScript: async (): Promise<{ result?: unknown }[]> => {
      if (promptFails) throw new Error('cannot inject into this page');
      return [{ result: promptResult }];
    },
    insertCSS: async ({ target, css }: { target: { tabId: number; frameIds: number[] }; css: string }) =>
      void inserted.push({ tabId: target.tabId, frameIds: target.frameIds, css }),
  };
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void warns.push(args));
}

let promptResult: unknown = null;
let promptFails = false;

const lastText = (): string => badges.at(-1)?.text ?? '';
/** One flash writes the text and the title, so the recorded states repeat: collapse those runs. */
const badgeTexts = (): string[] => badges.map(b => b.text).filter((t, i, all) => t !== all[i - 1]);
const lastTitle = (): string => badges.at(-1)?.title ?? '';

/** Chrome runs every listener until one answers; the store server is registered before the worker's own. */
async function send(message: unknown, sender: unknown = {}): Promise<unknown> {
  for (const l of listeners.message) {
    const answer = Promise.withResolvers<unknown>();
    if (l(message, sender, answer.resolve) === true) return answer.promise;
  }
  return undefined;
}

/** Microtasks only: the worker's click path is a long await chain with no timers in it. */
async function flush(): Promise<void> {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

const videoJson = (id: string) => ({
  videoDetails: { videoId: id, title: 'Video ' + id, author: 'Channel', lengthSeconds: '60' },
});

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? '{}')) as { videoId?: string };
  if (String(url).includes('/player')) {
    if (body.videoId === 'bad40000000') return { ok: false, status: 400, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => videoJson(body.videoId ?? '') };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      metadata: { playlistMetadataRenderer: { title: 'My List' } },
      contents: [{ lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: A } }],
    }),
  };
});

const A = 'aaaaaaaaaaa';
const click = (menuItemId: string, linkUrl = `https://www.youtube.com/watch?v=${A}`): void => {
  for (const l of listeners.clicked) l({ menuItemId, linkUrl } as chrome.contextMenus.OnClickData, { id: 7 });
};

beforeAll(async () => {
  vi.useFakeTimers();
  installChromeMock();
  vi.stubGlobal('fetch', fetchMock);
  await import('../src/background');
});

beforeEach(() => {
  menus.length = 0;
  badges.length = 0;
  inserted.length = 0;
  rules.length = 0;
  warns.length = 0;
  fetchMock.mockClear();
  promptResult = 'Named in the page';
  promptFails = false;
});

it('installs the rules, the skip defaults and the menus on install', async () => {
  for (const l of listeners.installed) l();
  await flush();
  expect(rules[0].removeRuleIds).toEqual([1, 2, 3, 4]); // stale ids from an older build are dropped
  expect(rules[0].addRules?.map(r => r.id)).toEqual([1, 3]);
  expect(rules[1].addRules?.map(r => r.id)).toEqual([4]);
  expect((await chrome.storage.local.get('skipPrefs')).skipPrefs).toMatchObject({ categories: { filler: false } });
  expect(menus.map(m => m.id)).toEqual(['add', 'pl:saved', 'sep', 'new']); // no custom playlists yet
  expect(badges.at(-1)).toEqual({ text: '', title: lastTitle() }); // a badge left by a dead worker is cleared
});

it('offers one menu row per custom playlist, and none for a YouTube or queue playlist', async () => {
  await chrome.storage.local.set({
    playlists: [
      { id: 'c1', name: 'Mine', kind: 'custom', sourceId: null, createdAt: 1, videos: [] },
      { id: 'y1', name: 'Imported', kind: 'youtube', sourceId: 'PL1', createdAt: 2, videos: [] },
      { id: 'q1', name: 'A queue', kind: 'queue', sourceId: null, createdAt: 3, videos: [] },
    ],
  });
  for (const l of listeners.changed) l({ playlists: {} }, 'local');
  await flush();
  expect(menus.map(m => m.id)).toEqual(['add', 'pl:saved', 'pl:c1', 'sep', 'new']);
  expect(menus.find(m => m.id === 'pl:saved')?.title).toBe('Saved');
  expect(menus.every(m => m.parentId === 'add' || m.id === 'add')).toBe(true);
});

it('adds a right-clicked video to Saved and reports it on the badge', async () => {
  click('pl:saved');
  await flush();
  const saved = (await getPlaylists()).find(p => p.sourceId === SAVED_SOURCE_ID);
  expect(saved?.videos.map(v => v.id)).toEqual([A]);
  expect(badges.at(-1)).toEqual({ text: '✓', title: 'Added to Saved: Video ' + A });
});

it('adds a right-clicked video to the playlist whose menu row was clicked', async () => {
  const created = await savePlaylist({ name: 'Mine', kind: 'custom', sourceId: null, videos: [] });
  badges.length = 0;

  click(`pl:${created.id}`);
  await flush();
  expect((await getPlaylists()).find(p => p.id === created.id)?.videos.map(v => v.id)).toEqual([A]);
  expect(badges.at(-1)).toEqual({ text: '✓', title: 'Added to Mine: Video ' + A });
});

it('reports a link that is not YouTube, without touching storage', async () => {
  click('pl:saved', 'https://example.com/watch?v=' + A);
  await flush();
  expect(badges.at(-1)).toEqual({ text: '!', title: 'Not a YouTube video/playlist link' });
  expect(await getPlaylists()).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('saves a right-clicked playlist link as its own playlist, showing progress on the badge', async () => {
  click('pl:saved', 'https://www.youtube.com/playlist?list=PL1');
  await flush();
  expect(badgeTexts()).toEqual(['...', '100%', '✓']); // the badge counts the fetches, then flashes
  expect(badges.at(-1)?.title).toBe('Saved 1 video to My List');
  expect((await getPlaylists())[0]).toMatchObject({ name: 'My List', kind: 'youtube', sourceId: 'PL1' });
});

it('reports a playlist row whose playlist is gone', async () => {
  click('pl:gone');
  await flush();
  expect(badges.at(-1)).toEqual({ text: '!', title: 'Playlist no longer exists' });
});

it('creates a playlist named in the page for the New playlist... row', async () => {
  promptResult = '  Watch   later  ';
  click('new');
  await flush();
  expect((await getPlaylists()).map(p => p.name)).toEqual(['Watch later']); // cleaned, like the popup does
  expect(badges.at(-1)?.text).toBe('✓');
});

it('refuses an empty name, and a page that cannot be asked for one', async () => {
  promptResult = '   ';
  click('new');
  await flush();
  expect(badges.at(-1)).toEqual({ text: '!', title: 'A playlist needs a name' });

  promptFails = true;
  click('new');
  await flush();
  expect(badges.at(-1)).toEqual({ text: '!', title: 'Cannot ask for a name on this page; create the playlist in the TubeList popup' });
  expect(await getPlaylists()).toEqual([]);
});

it('reports a cancelled name prompt as nothing at all', async () => {
  promptResult = null;
  click('new');
  await flush();
  expect(badges).toEqual([]);
  expect(await getPlaylists()).toEqual([]);
});

it('translates the 400 a private or deleted YouTube playlist answers with', async () => {
  click('pl:saved', 'https://www.youtube.com/watch?v=bad40000000');
  await flush();
  expect(badges.at(-1)).toEqual({ text: '!', title: 'Playlist not found or private' });
});

it('clears the badge again after the flash', async () => {
  click('pl:saved');
  await flush();
  expect(badges.at(-1)?.text).toBe('✓');
  vi.advanceTimersByTime(2500);
  await flush();
  expect(badges.at(-1)).toEqual({ text: '', title: 'TubeList' });
});

it('relays the frame stylesheet to the exact frame that asked for it', async () => {
  await send({ type: 'tl:css', css: 'html{color:red}' }, { url: 'https://www.youtube.com/watch?v=x', tab: { id: 3 }, frameId: 9 });
  await flush();
  expect(inserted).toEqual([{ tabId: 3, frameIds: [9], css: 'html{color:red}' }]);

  inserted.length = 0;
  await send({ type: 'tl:css', css: 'html{color:red}' }, { url: 'https://example.com/', tab: { id: 3 }, frameId: 9 });
  await send({ type: 'tl:css', css: 42 }, { url: 'https://www.youtube.com/', tab: { id: 3 }, frameId: 9 });
  await send({ type: 'tl:css', css: 'x' }, { url: 'https://www.youtube.com/', tab: { id: 3 } }); // no frameId
  await flush();
  expect(inserted).toEqual([]);
});

it('ignores stylesheet requests from a top-level YouTube tab', async () => {
  await send({ type: 'tl:css', css: 'body{display:none}' }, { url: 'https://www.youtube.com/watch?v=x', tab: { id: 3 }, frameId: 0 });
  expect(inserted).toEqual([]);
});

it('relays the SponsorBlock lookup with the categories and action types the API expects', async () => {
  const answer = await send({ type: 'sb:segments', prefix: 'ab12', categories: ['sponsor', 'intro'] });
  await flush();
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toBe(
    'https://sponsor.ajay.app/api/skipSegments/ab12' +
      `?categories=${encodeURIComponent(JSON.stringify(['sponsor', 'intro']))}` +
      `&actionTypes=${encodeURIComponent(JSON.stringify(['skip']))}`,
  );
  expect(await answer).toEqual([]);
});

it('serializes player progress in the worker alongside playlist pruning', async () => {
  const { setProgress, getProgress } = await import('../src/lib/progress');
  const { removeVideo } = await import('../src/lib/store');
  const video = (id: string) => ({ id, title: id, channel: '', thumbnail: '', durationSec: 60, publishedAt: null, addedAt: 1 });
  const p = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [video(A), video('bbbbbbbbbbb')] });
  const [reply] = await Promise.all([
    send({ type: 'tubelist:progress', id: 'bbbbbbbbbbb', t: 10, d: 60, ended: false }),
    removeVideo(p.id, A),
  ]);
  expect(reply).toMatchObject({ ok: true, value: { t: 10 } });
  expect(await getProgress()).toEqual({ bbbbbbbbbbb: { t: 10, d: 60, done: false } });
  // This test runs in the worker context; a real player sends this message instead of writing storage directly.
  expect(await setProgress('bbbbbbbbbbb', 12, 60, false)).toMatchObject({ t: 12 });
});

it('answers a SponsorBlock lookup with an empty list when the API fails or answers with junk', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
  expect(await send({ type: 'sb:segments', prefix: 'ab12', categories: ['sponsor'] })).toEqual([]);

  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ not: 'an array' }) });
  expect(await send({ type: 'sb:segments', prefix: 'ab12', categories: ['sponsor'] })).toEqual([]);

  fetchMock.mockRejectedValueOnce(new Error('offline'));
  expect(await send({ type: 'sb:segments', prefix: 'ab12', categories: ['sponsor'] })).toEqual([]);
  await flush();
});

it('keeps the menus when the rule install fails, and says so once', async () => {
  const dnr = chrome.declarativeNetRequest as unknown as { updateDynamicRules: () => Promise<void> };
  const original = dnr.updateDynamicRules;
  dnr.updateDynamicRules = async () => {
    throw new Error('no rule permission');
  };
  for (const l of listeners.startup) l();
  await flush();
  expect(warns.flat().join(' ')).toContain('TubeList setup failed');
  expect(menus.map(m => m.id)).toEqual(['add', 'pl:saved', 'sep', 'new']); // boot() still built them
  dnr.updateDynamicRules = original;
});
