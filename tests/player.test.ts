// @vitest-environment jsdom
import { savePlaylist, setPlayerPrefs } from '../src/lib/store';
import type { Video } from '../src/lib/types';

const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const video: Video = {
  id: A,
  title: 'Video A',
  channel: 'Channel',
  durationSec: 60,
  publishedAt: null,
  thumbnail: 'thumb',
  addedAt: 1,
  description: 'About the video https://example.com/x.',
};

// jsdom has no layout, so the real player's scrollIntoView call is missing.
Element.prototype.scrollIntoView = () => {};

const iframe = (): HTMLIFrameElement => document.getElementById('yt') as HTMLIFrameElement;
const desc = (): HTMLDetailsElement => document.querySelector('details') as HTMLDetailsElement;
const rowOf = (title: string): HTMLElement =>
  [...document.querySelectorAll('main aside button')].find(b => b.textContent?.includes(title)) as HTMLElement;

// B is a row saved before v0.4: no description, so the player has to fetch one. Stubbed here, because
// the real call would leave the test suite talking to youtube.com.
const playerJson = (id: string) => ({
  videoDetails: { videoId: id, title: 'Video ' + id, author: 'Channel', lengthSeconds: '60', shortDescription: 'Fetched ' + id },
});
const fetchOk = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => ({ ok: true, json: async () => playerJson(JSON.parse(String(init?.body)).videoId) })),
  );
};

// The player reads `?v=` at import time and renders once prefs and playlists are loaded.
// Dynamic import is required: a static one would run before the URL and markup above exist.
beforeAll(async () => {
  fetchOk();
  document.body.innerHTML = `
    <main></main>
    <section>
      <iframe id="yt"></iframe>
      <h1 id="title"></h1>
      <p id="meta"></p>
      <div id="controls"></div>
      <a id="yt-link"></a>
      <span id="plname"></span>
    </section>`;
  const noDescription: Video = { ...video, id: B, title: 'Video B' };
  delete noDescription.description;
  const saved = await savePlaylist({ name: 'A', kind: 'custom', sourceId: null, videos: [video, noDescription] });
  window.history.replaceState(null, '', `?v=${A}&pl=${saved.id}`);
  await import('../src/player/player');
});

it('frames the embed player and shows the stored description by default', async () => {
  await vi.waitFor(() => expect(iframe().src).toBe('https://www.youtube.com/embed/' + A + '?autoplay=1&tubelist=1'));
  expect(document.getElementById('title')?.textContent).toBe('Video A');
  expect(desc().hidden).toBe(false);
  expect(desc().textContent).toContain('About the video');
});

it('makes a description link clickable in a new tab', async () => {
  const a = await vi.waitFor(() => desc().querySelector('a') as HTMLAnchorElement);
  expect(a.textContent).toBe('https://example.com/x');
  expect(a.href).toBe('https://example.com/x');
  expect(a.target).toBe('_blank');
  expect(a.rel).toBe('noopener noreferrer');
  // Sentence punctuation after the URL stays text.
  expect(desc().textContent).toContain('About the video https://example.com/x.');
});

it('hides and restores the description when the preference changes', async () => {
  await setPlayerPrefs({ description: false, sync: false });
  await vi.waitFor(() => expect(desc().hidden).toBe(true));
  await setPlayerPrefs({ description: true, sync: false });
  await vi.waitFor(() => expect(desc().hidden).toBe(false));
});

it('switches to the signed-in watch page when sync is enabled', async () => {
  await setPlayerPrefs({ description: true, sync: true });
  await vi.waitFor(() => expect(iframe().src).toContain('/watch?v=' + A));
  // Switching sources keeps the video, its title and the description.
  expect(document.getElementById('title')?.textContent).toBe('Video A');
  expect(desc().hidden).toBe(false);
});
// Found by label, not by position: the toolbar order is layout, not contract.
const toolbarButtons = (prefix: string): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('#controls button')].find(b => b.textContent?.startsWith(prefix))!;

it('toggles YouTube sync from the player button', async () => {
  // State this test needs, rather than whatever the previous one left behind: it must pass on its own.
  await setPlayerPrefs({ description: true, sync: true });
  const syncBtn = toolbarButtons('YouTube sync');
  await vi.waitFor(() => expect(syncBtn.textContent).toBe('YouTube sync: on'));
  syncBtn.click();
  await vi.waitFor(() => expect(syncBtn.textContent).toBe('YouTube sync: off'));
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + A));
});

it('fetches a description the row does not carry, and retries one that failed', async () => {
  const failing = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', failing);
  rowOf('Video B').click();
  await vi.waitFor(() => expect(failing).toHaveBeenCalled());
  await vi.waitFor(() => expect(desc().hidden).toBe(true)); // nothing to show yet
  expect(desc().textContent).not.toContain('Fetched');

  fetchOk();
  rowOf('Video B').click(); // the same video again: a failure must not have been cached
  await vi.waitFor(() => expect(desc().textContent).toContain('Fetched ' + B));
  expect(desc().hidden).toBe(false);

  // The loop test below opens on the video this file starts from, and sends its events for A.
  rowOf('Video A').click();
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + A));
});

it('cycles loop modes and advances the playlist when a video ends', async () => {
  const loopBtn = toolbarButtons('Loop ');
  expect(loopBtn.textContent).toBe('Loop off');
  loopBtn.click();
  expect(loopBtn.textContent).toBe('Loop all');
  loopBtn.click();
  expect(loopBtn.textContent).toBe('Loop one');
  loopBtn.click();
  expect(loopBtn.textContent).toBe('Loop off');
  loopBtn.click(); // loop all

  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com',
    source: iframe().contentWindow,
    data: { tubelist: 1, id: A, t: 60, d: 60, state: 'ended' },
  }));
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + B));
  expect(document.getElementById('title')?.textContent).toBe('Video B');

  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com',
    source: iframe().contentWindow,
    data: { tubelist: 1, id: B, t: 60, d: 60, state: 'ended' },
  }));
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + A));
  expect(document.getElementById('title')?.textContent).toBe('Video A');

  // The embed's end screen can leave the media at `duration` without an `ended` event.
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com',
    source: iframe().contentWindow,
    data: { tubelist: 1, id: A, t: 59.6, d: 60, state: 'timeupdate' },
  }));
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + B));
});

it('requests fresh frame state when the player tab becomes visible', async () => {
  rowOf('Video A').click();
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + A));
  toolbarButtons('Loop ').click(); // loop all
  const post = vi.spyOn(iframe().contentWindow!, 'postMessage');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(post).toHaveBeenCalledWith({ tubelist: 3, cmd: 'report' }, 'https://www.youtube.com');
});
it('advances loop all while the player tab stays hidden when the frame reports completion', async () => {
  rowOf('Video A').click();
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + A));
  const loopBtn = toolbarButtons('Loop ');
  if (loopBtn.textContent !== 'Loop off') { loopBtn.click(); if (loopBtn.textContent !== 'Loop off') loopBtn.click(); }
  loopBtn.click();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com', source: iframe().contentWindow,
    data: { tubelist: 1, id: A, t: 60, d: 60, state: 'ended' },
  }));
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + B));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
it('leaves the frame in place on loop one so the native video.loop can repeat it while hidden', async () => {
  rowOf('Video A').click();
  await vi.waitFor(() => expect(iframe().src).toContain('/embed/' + A));
  const loopBtn = toolbarButtons('Loop ');
  if (loopBtn.textContent === 'Loop off') loopBtn.click();
  if (loopBtn.textContent === 'Loop all') loopBtn.click();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  const navigations: string[] = [];
  const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!;
  Object.defineProperty(iframe(), 'src', { configurable: true, get() { return original.get!.call(this); }, set(url: string) { navigations.push(url); original.set!.call(this, url); } });
  const src = iframe().src;
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com', source: iframe().contentWindow,
    data: { tubelist: 1, id: A, t: 60, d: 60, state: 'ended' },
  }));
  expect(navigations).toEqual([]);
  expect(iframe().src).toBe(src);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
it('ignores what the frame reports for another video', async () => {
  // YouTube navigates the framed page itself; a report from that other video must not move the playlist.
  const src = iframe().src;
  const title = document.getElementById('title')?.textContent;
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com',
    source: iframe().contentWindow,
    data: { tubelist: 1, id: 'ccccccccccc', t: 60, d: 60, state: 'ended' },
  }));
  expect(iframe().src).toBe(src);
  expect(document.getElementById('title')?.textContent).toBe(title);
});

it('saves progress when switching rows before a five-second tick', async () => {
  const { getProgress } = await import('../src/lib/progress');
  rowOf('Video A').click();
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com', source: iframe().contentWindow,
    data: { tubelist: 1, id: A, t: 18, d: 60, state: 'timeupdate' },
  }));
  rowOf('Video B').click();
  await vi.waitFor(async () => expect((await getProgress())[A]?.t).toBe(18));
});

it('counts a sleep timer down and pauses the frame when it runs out', () => {
  vi.useFakeTimers();
  const post = vi.spyOn(iframe().contentWindow!, 'postMessage');
  const sleepBtn = toolbarButtons('Sleep ');
  expect(sleepBtn.textContent).toBe('Sleep off');
  sleepBtn.click();

  const preset = [...document.querySelectorAll<HTMLButtonElement>('#controls button')].find(b => b.textContent === '5 min');
  preset!.click();
  expect(sleepBtn.textContent).toBe('Sleep: 5:00');
  expect(post).not.toHaveBeenCalled();

  vi.advanceTimersByTime(301_000);
  expect(post).toHaveBeenCalledWith({ tubelist: 3, cmd: 'pause' }, 'https://www.youtube.com');
  expect(sleepBtn.textContent).toBe('Sleep off');

  // Custom hh:mm: opening the menu focuses the field, and submitting applies it.
  const input = document.querySelector<HTMLInputElement>('#controls input[type=text]')!;
  sleepBtn.click();
  expect(document.activeElement).toBe(input);
  input.value = '1.30'; // neither hh:mm nor plain minutes: ignored, field keeps the value
  input.form!.requestSubmit();
  expect(sleepBtn.textContent).toBe('Sleep off');
  expect(input.value).toBe('1.30');

  input.value = '1:30';
  input.form!.requestSubmit();
  expect(sleepBtn.textContent).toBe('Sleep: 1:30:00'); // hh:mm in, the countdown is the app's own m:ss/h:mm:ss

  vi.advanceTimersByTime(5_401_000);
  expect(post).toHaveBeenCalledTimes(2);
  expect(sleepBtn.textContent).toBe('Sleep off');
  vi.useRealTimers();
});

/** The mode the Loop button currently shows, so these tests do not depend on the order of the others. */
const loopMode = (): string => {
  const label = toolbarButtons('Loop ').textContent ?? '';
  return label.includes('one') ? 'one' : label.includes('all') ? 'all' : 'off';
};

it('tells the frame the loop mode so it can loop natively while this tab is hidden', () => {
  const post = vi.spyOn(iframe().contentWindow!, 'postMessage');
  toolbarButtons('Loop ').click();
  expect(post).toHaveBeenCalledWith({ tubelist: 4, loop: loopMode() }, 'https://www.youtube.com');
  post.mockRestore();
});

it('answers a frame that asks which loop mode to use', () => {
  const post = vi.spyOn(iframe().contentWindow!, 'postMessage');
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://www.youtube.com', source: iframe().contentWindow, data: { tubelist: 5 },
  }));
  expect(post).toHaveBeenCalledWith({ tubelist: 4, loop: loopMode() }, 'https://www.youtube.com');
  post.mockRestore();
});
