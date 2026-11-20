// @vitest-environment jsdom
// The frame script has no exports: it arms itself at import for the embedded case. So this file
// fakes the embedding (top window, parent handshake) and reads what it posts back.
const parentOrigin = 'chrome-extension://test';
const posted: unknown[] = [];

// What the service worker relays back for `sb:segments`: only entries for the video that asked.
let segmentsFor: string | null = null;
let segments: { category: string; actionType: string; segment: [number, number]; UUID: string }[] = [];

beforeAll(async () => {
  vi.useFakeTimers(); // the 500 ms ad/skip loop is advanced by hand, one tick at a time
  Object.defineProperty(window, 'top', { value: {}, configurable: true });
  Object.defineProperty(window, 'parent', { value: { postMessage: (m: unknown) => posted.push(m) }, configurable: true });
  Object.assign(chrome.runtime, {
    lastError: undefined,
    sendMessage: (msg: { type?: string }, cb?: (r: unknown) => void) => {
      if (msg?.type === 'sb:segments') cb?.(segmentsFor ? [{ videoID: segmentsFor, segments }] : []);
    },
  });
  HTMLMediaElement.prototype.play = () => Promise.resolve(); // jsdom logs a not-implemented notice
  // The frame hashes the video id with WebCrypto. The real digest settles off the faked clock, which
  // would make every tick after a segment lookup race it; the value never reaches an assertion.
  vi.stubGlobal('crypto', { subtle: { digest: async () => new ArrayBuffer(32) } });
  await import('../src/frame');
  // YouTube posts messages into its own window while booting; one of those must not eat the handshake.
  window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.youtube.com', data: { type: 'yt-action' } }));
  // The player page answers the embedder handshake; only then does the frame set itself up.
  window.dispatchEvent(new MessageEvent('message', { origin: parentOrigin, data: { tubelist: 2 } }));
});

/** Feeds one timeupdate from a video element and returns the report the frame posted. */
function reportAt(time: number): unknown {
  const v = document.createElement('video');
  Object.defineProperty(v, 'currentTime', { value: time });
  Object.defineProperty(v, 'duration', { value: 100 });
  document.body.append(v);
  posted.length = 0;
  v.dispatchEvent(new Event('timeupdate'));
  v.remove();
  return posted.at(-1);
}

/** The one video the loop finds: `document.querySelector('video')` picks the first appended. */
const videoAt = (time: number, duration = 100): HTMLVideoElement => {
  document.body.replaceChildren();
  const v = document.createElement('video');
  let current = time;
  Object.defineProperty(v, 'currentTime', { configurable: true, get: () => current, set: (n: number) => void (current = n) });
  Object.defineProperty(v, 'duration', { value: duration, configurable: true });
  document.body.append(v);
  return v;
};

const countdownBox = (): HTMLElement | null => document.getElementById('tubelist-countdown');

it('reports progress from a watch page with its `v` parameter', () => {
  window.history.replaceState(null, '', '/watch?v=9bZkp7q19f0');
  expect(reportAt(12)).toMatchObject({ tubelist: 1, id: '9bZkp7q19f0', t: 12, d: 100, state: 'timeupdate' });
});

it('reports progress from an embed page with its path ID', () => {
  window.history.replaceState(null, '', '/embed/dQw4w9WgXcQ?autoplay=1');
  expect(reportAt(30)).toMatchObject({ id: 'dQw4w9WgXcQ', t: 30 });
});
it('reports completion in a hidden tab even when media events are missed', async () => {
  window.history.replaceState(null, '', '/embed/dQw4w9WgXcQ?autoplay=1');
  const v = videoAt(100);
  Object.defineProperty(v, 'ended', { value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  posted.length = 0;
  await vi.advanceTimersByTimeAsync(1000);
  expect(posted).toContainEqual(expect.objectContaining({ id: 'dQw4w9WgXcQ', state: 'ended' }));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  v.remove();
});
it('pauses the media when the player page asks it to, and ignores other senders', () => {
  const v = document.createElement('video');
  const pause = vi.spyOn(v, 'pause').mockImplementation(() => {}); // jsdom logs a not-implemented notice
  document.body.append(v);
  for (const origin of ['https://evil.test', parentOrigin]) {
    window.dispatchEvent(new MessageEvent('message', { origin, data: { tubelist: 3, cmd: 'pause' } }));
  }
  expect(pause).toHaveBeenCalledTimes(1);
  v.remove();
});

const WATCH = 'dQw4w9WgXcQ';

/** Arms one sponsor segment from 10 s to 20 s for the video the frame is on. */
async function armSponsorSegment(countdown: boolean): Promise<void> {
  window.history.replaceState(null, '', `/watch?v=${WATCH}`);
  document.body.replaceChildren();
  await chrome.storage.local.set({ skipPrefs: { categories: { sponsor: true }, countdown } });
  segmentsFor = WATCH;
  segments = [{ category: 'sponsor', actionType: 'skip', segment: [10, 20], UUID: 'u1' }];
}

it('seeks past an enabled segment once its metadata arrives', async () => {
  await armSponsorSegment(false);
  const v = videoAt(12);
  // The first tick only starts the lookup; the second one has the segments.
  await vi.advanceTimersByTimeAsync(1000);
  expect(v.currentTime).toBe(20);
  expect(countdownBox()).toBeNull(); // no countdown when it is off
});

it('counts a sponsor down first, and skips when the countdown runs out', async () => {
  await armSponsorSegment(true);
  const v = videoAt(12);
  await vi.advanceTimersByTimeAsync(1000);
  expect(v.currentTime).toBe(12); // still playing: the box counts down, the loop does not seek
  expect(countdownBox()?.hidden).toBe(false);
  expect(countdownBox()?.textContent).toContain('Sponsor in');

  await vi.advanceTimersByTimeAsync(3000);
  expect(v.currentTime).toBe(20);
  expect(countdownBox()?.hidden).toBe(true);
});

it('skips immediately from the countdown button', async () => {
  await armSponsorSegment(true);
  const v = videoAt(12);
  await vi.advanceTimersByTimeAsync(1000);
  const button = [...countdownBox()!.querySelectorAll('button')].find(b => b.textContent === 'Skip now')!;
  button.click();
  expect(v.currentTime).toBe(20);
  expect(countdownBox()?.hidden).toBe(true);
});

it('leaves a segment the viewer seeked into alone', async () => {
  await armSponsorSegment(false);
  const v = videoAt(5);
  await vi.advanceTimersByTimeAsync(1000); // segments are in: at 5 s nothing is active
  expect(v.currentTime).toBe(5);

  v.currentTime = 12; // the viewer drags the bar into the segment
  v.dispatchEvent(new Event('seeking'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(v.currentTime).toBe(12); // remembered for this video, not skipped again
});

it('runs an ad out instead of skipping it, and stays quiet about its tail', async () => {
  document.body.replaceChildren();
  const player = document.createElement('div');
  player.id = 'movie_player';
  player.className = 'ad-showing';
  const v = videoAt(5, 30);
  document.body.append(player);
  posted.length = 0;

  await vi.advanceTimersByTimeAsync(500);
  expect(v.currentTime).toBe(29.5); // the last half second plays out, so YouTube's own end handler runs

  // The break ends and YouTube drops `ad-showing` while the same <video> still reports the ad's tail:
  // that clock must not reach the player page as the video's progress or resume point.
  player.className = '';
  await vi.advanceTimersByTimeAsync(1000);
  v.dispatchEvent(new Event('timeupdate'));
  expect(posted).toEqual([]);
});
