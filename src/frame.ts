import { nextSkip, NO_COUNTDOWN, type Countdown, type Prefs, type Segment } from './lib/skip';

// Runs in the watch page only when framed by TubeList's player.html. Chrome (and Firefox 148+) name the
// ancestor origin; anything else — an older Firefox, or a reload YouTube starts inside the frame —
// falls to the handshake, which no other page can answer from this origin. The referrer does not help
// on Firefox: it sends no moz-extension referrer for the frame (measured on Gecko 158).
/**
 * Watch-page trim: the frame shows only the video. Kept off the embed page — see setup().
 * ytd-popup-container stays visible: it hosts the "still watching?" dialog.
 */
const WATCH_CSS = `
html,body{overflow:hidden!important;background:#000!important}
#masthead-container,#secondary,#below,#related,#comments,ytd-miniplayer,tp-yt-app-drawer{display:none!important}
/* Non-fullscreen only. In fullscreen YouTube must own the player and video geometry: it measures its
   control bar against that box, and overriding it collapses the bar to its 100px minimum in the corner.
   Both gates are needed because fullscreen lands on <html> while YouTube also flags .ytp-fullscreen. */
html:not(:fullscreen) #movie_player:not(.ytp-fullscreen){position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important}
html:not(:fullscreen) #movie_player:not(.ytp-fullscreen) video{width:100vw!important;height:100vh!important;left:0!important;top:0!important;object-fit:contain}`;

/** SponsorBlock countdown, used on both page kinds. z-index matches the player's own so it survives the pin. */
const COUNTDOWN_CSS = `
#tubelist-countdown{position:fixed;left:16px;bottom:76px;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.84);color:#fff;font:500 13px/1.2 Roboto,arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)}
#tubelist-countdown[hidden]{display:none}
#tubelist-countdown button{cursor:pointer;border:0;border-radius:6px;padding:4px 10px;background:#fff;color:#000;font:600 12px Roboto,arial,sans-serif}
#tubelist-countdown button:focus-visible{outline:2px solid #f00;outline-offset:2px}`;

const parentOrigin = chrome.runtime.getURL('').slice(0, -1); // chrome-extension://<id> | moz-extension://<uuid>
const isFramed = window.top !== window;

if (isFramed && location.ancestorOrigins?.[0] === parentOrigin) setup();
else if (isFramed) {
  // Not `once`: YouTube posts messages to its own window while booting, and consuming the listener
  // on one of those would leave the frame without progress or SponsorBlock for the whole page.
  const onHello = (e: MessageEvent): void => {
    if (e.origin !== parentOrigin || (e.data as { tubelist?: number } | null)?.tubelist !== 2) return;
    window.removeEventListener('message', onHello);
    setup();
  };
  window.addEventListener('message', onHello);
  window.parent.postMessage({ tubelist: 1 }, parentOrigin);
}

function setup(): void {
  // `/watch?v=ID` and the embed player's `/embed/ID` both run this script.
  const videoId = (): string | null =>
    new URLSearchParams(location.search).get('v') ??
    location.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1] ??
    null;

  // Injected by the service worker as an extension stylesheet (chrome.scripting.insertCSS) rather than a
  // <style> node: YouTube rebuilds its document while booting, so a node added here at document_start is
  // dropped, and a node on <html> before <head> exists leaves /embed/ stuck at readyState "loading"
  // (black frame). The embed player keeps its own layout anyway — it paints the control bar under
  // #movie_player, so the watch page's fixed pin would cover the controls.
  // Callback form, not the promise one: Firefox's `chrome.*` namespace is not documented to return a
  // promise, and a throw here would take the rest of setup() (media reporting, the skip loop) with it.
  chrome.runtime.sendMessage?.(
    {
      type: 'tl:css',
      css: location.pathname.startsWith('/embed/') ? COUNTDOWN_CSS : WATCH_CSS + COUNTDOWN_CSS,
    },
    () => void chrome.runtime.lastError, // a worker that is not there: CSS is cosmetic, nothing to report
  );
  document.addEventListener('DOMContentLoaded', () => window.dispatchEvent(new Event('resize')), { once: true });
  // YouTube lays its control bar out during the fullscreen transition; nudge it once the state settles.
  document.addEventListener('fullscreenchange', () => window.dispatchEvent(new Event('resize')));

  // The player page is a cross-origin embedder: the <video> is only reachable from inside this frame.
  // ponytail: pause is the only command so far; play/seek go here when something needs them.
  window.addEventListener('message', e => {
    if (e.origin !== parentOrigin) return;
    const m = e.data as { tubelist?: number; cmd?: string } | null;
    if (m?.tubelist !== 3 || m.cmd !== 'pause') return;
    const v = document.querySelector('video');
    if (v instanceof HTMLVideoElement) v.pause();
  });
  let adTailUntil = 0; // the ad's own ended/pause must never be reported as the video's
  const report = (e: Event): void => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    if (Date.now() < adTailUntil) return;
    if (document.getElementById('movie_player')?.classList.contains('ad-showing')) return; // preroll shares the <video>
    window.parent.postMessage(
      { tubelist: 1, id: videoId(), t: v.currentTime, d: v.duration, state: e.type },
      parentOrigin,
    );
  };
  // Media events don't bubble and <video> appears later, so capture on document.
  for (const type of ['timeupdate', 'pause', 'ended']) document.addEventListener(type, report, true);

  // --- SponsorBlock -------------------------------------------------------------------------
  // Segments come from the community database by 4-char hash prefix (the server has no videoID lookup).
  // Categories live only in the stored prefs object, so a new settings row needs no change here.
  let prefs: Prefs = {};
  let segs: Segment[] = [];
  let retryAt = 0; // backoff after a failed relay (service worker restarting or unregistered)
  let segsFor: string | null = null;
  const ignored = new Set<string>(); // segments the user seeked into: stay unskipped for this video
  let selfSeek = -1; // the time of our own last seek; the seeking event must not count as a user seek
  let countdown: Countdown = NO_COUNTDOWN;
  let cdLeft = -1;
  let cdBox: HTMLElement | null = null;
  let cdLabel: HTMLElement | null = null;

  async function loadSegments(id: string): Promise<void> {
    try {
      segsFor = id;
      segs = [];
      ignored.clear();
      hideCountdown();
      const on = prefs.categories ?? {};
      const cats = Object.keys(on).filter(k => on[k] !== false);
      if (!cats.length) {
        // No prefs object yet (the service worker writes the defaults on install): retry next tick.
        // Prefs that exist but are all off mean no request at all.
        if (!prefs.categories) segsFor = null;
        return;
      }
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)))]
        .slice(0, 2).map(b => b.toString(16).padStart(2, '0')).join('');
      // The watch page's own CSP covers this context ("Unsafe attempt to load URL ... Domains, protocols and
      // ports must match"), so the lookup is relayed to the service worker; see background.ts.
      const { promise, resolve } = Promise.withResolvers<unknown>();
      chrome.runtime.sendMessage({ type: 'sb:segments', prefix: hash, categories: cats }, (r: unknown) => {
        if (chrome.runtime.lastError) {
          // No worker to answer (restarting, or its script failed to load): ask again in a few seconds
          // instead of staying without segments until the video changes.
          segsFor = null;
          retryAt = Date.now() + 5000;
          resolve([]);
          return;
        }
        resolve(r ?? []);
      });
      const res = await promise;
      if (segsFor !== id) return; // SPA moved on, or prefs changed, while the request was out
      segs = (Array.isArray(res) ? res : [])
        .filter(e => e?.videoID === id)
        .flatMap(e => (e.segments ?? []) as { category: string; actionType: string; segment: [number, number]; UUID: string }[])
        .map(s => ({ c: s.category, a: s.actionType, s: s.segment[0], e: s.segment[1], u: s.UUID }));
    } catch {
      // Extension reloaded or context invalidated: back off instead of throwing every tick.
      segsFor = null;
      retryAt = Date.now() + 5000;
    }
  }

  /** One fetch per video id; called from the loop, so it also notices SPA navigation. */
  function ensureSegments(): void {
    if (Date.now() < retryAt) return;
    const id = videoId();
    if (id && id !== segsFor) void loadSegments(id);
  }

  const seekTo = (v: HTMLVideoElement, t: number): void => {
    selfSeek = t;
    v.currentTime = t;
  };

  // Fullscreen renders only the fullscreen element's subtree, so the countdown has to live inside it.
  const overlayHost = (): Element => document.fullscreenElement ?? document.documentElement;

  function overlay(): HTMLElement {
    if (cdBox) return cdBox;
    cdBox = document.createElement('div');
    cdBox.id = 'tubelist-countdown';
    cdBox.hidden = true;
    cdLabel = document.createElement('span');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'Skip now';
    skip.addEventListener('click', () => {
      const v = document.querySelector('video');
      if (v instanceof HTMLVideoElement) seekTo(v, countdown.end);
      hideCountdown();
    });
    cdBox.append(cdLabel, skip);
    overlayHost().append(cdBox);
    return cdBox;
  }

  function showCountdown(left: number): void {
    const box = overlay();
    if (cdLeft !== left && cdLabel) {
      cdLeft = left;
      cdLabel.textContent = `Sponsor in ${left}...`;
    }
    box.hidden = false;
  }

  function hideCountdown(): void {
    countdown = NO_COUNTDOWN;
    cdLeft = -1;
    if (cdBox) cdBox.hidden = true;
  }

  /** Skips one active segment per tick; a sponsor segment first counts down. */
  function skipPass(v: HTMLVideoElement): void {
    const step = nextSkip(v.currentTime, segs, prefs, ignored, countdown, Date.now());
    if (step.action === 'wait') {
      countdown = step.countdown;
      showCountdown(step.left);
      return;
    }
    if (step.action === 'seek') {
      hideCountdown();
      seekTo(v, step.to);
      return;
    }
    hideCountdown(); // no active segment (or the user seeked out of the one counting down)
  }

  // The countdown box moves with the fullscreen element, so the skip button stays reachable.
  document.addEventListener('fullscreenchange', () => {
    const host = overlayHost();
    if (cdBox && cdBox.parentElement !== host) host.append(cdBox);
  });

  // Media events don't bubble and <video> appears later, so capture on document.
  document.addEventListener('seeking', e => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    if (Math.abs(v.currentTime - selfSeek) < 0.1) {
      selfSeek = -1; // our own skip
      return;
    }
    const t = v.currentTime;
    for (const g of segs) if (t >= g.s && t < g.e) ignored.add(g.u);
    hideCountdown();
  }, true);

  const prefsRead = chrome.storage.local.get('skipPrefs').then(res => {
    prefs = (res.skipPrefs as Prefs | undefined) ?? {};
    segsFor = null; // categories are baked into the request
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('skipPrefs' in changes)) return;
    prefs = (changes.skipPrefs.newValue as Prefs | undefined) ?? {};
    segsFor = null;
  });

  // Ads arrive inside the same stream as the video, so there is no request a filter list can block:
  // run each ad to its end instead, including the sequences YouTube sends as a single break.
  // Stop just short of the end and let the last half second play: a seek to exactly `duration` ends the
  // media while YouTube's ad manager is still waiting for it, and the break then stays on screen at
  // `0:15 / 0:15` with a replay button. Playing the tail out fires the `ended` it listens for.
  const AD_TAIL = 0.5;
  let adNudged = false;
  setInterval((): void => {
    const mp = document.getElementById('movie_player');
    const v = document.querySelector('video');
    if (!(v instanceof HTMLVideoElement)) return;
    if (mp?.classList.contains('ad-showing')) {
      hideCountdown(); // an ad is never skipped or counted down
      adTailUntil = Date.now() + 2000;
      if (Number.isFinite(v.duration) && v.duration - v.currentTime > AD_TAIL) {
        seekTo(v, v.duration - AD_TAIL); // through seekTo: an ad's clock must not land in the ignore set
        if (v.paused) void v.play().catch(() => {});
      } else if (v.ended && !adNudged) {
        adNudged = true; // ended but still on screen: replay the tail once, that fires `ended` again
        seekTo(v, Math.max(0, v.duration - AD_TAIL));
        void v.play().catch(() => {});
      }
      return;
    }
    adNudged = false;
    void prefsRead.then(ensureSegments);
    skipPass(v);
  }, 500);
}
