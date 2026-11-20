import '../styles.css';
import { h, icon, LOOP_ICON, LOOP_ONE_ICON, MOON_ICON, TRASH_ICON, YOUTUBE_ICON } from '../lib/dom';
import { getPlaylists, getPlayerPrefs, moveVideo, removeVideo, setPlayerPrefs } from '../lib/store';
import { sortable } from '../lib/sortable';
import { askConfirm } from '../lib/dialog';
import { formatDuration, formatPublished } from '../lib/format';
import { embedUrl, watchUrl, VIDEO_ID_RE } from '../lib/url';
import { getProgress, progressOverlay, setProgress, type Progress } from '../lib/progress';
import { fetchVideo } from '../lib/innertube';
import type { PlayerPrefs, Video } from '../lib/types';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';

const params = new URLSearchParams(location.search);
const initialId = params.get('v');
const pl = params.get('pl');

const iframe = document.getElementById('yt') as HTMLIFrameElement;
// frame.ts asks its embedder who it is: a reload YouTube starts inside the frame loses the extension
// referrer, so the frame sets itself up once this page — and only this page — confirms.
window.addEventListener('message', e => {
  if (e.source !== iframe.contentWindow || e.origin !== 'https://www.youtube.com') return;
  if ((e.data as { tubelist?: number } | null)?.tubelist !== 1) return;
  iframe.contentWindow?.postMessage({ tubelist: 2 }, e.origin);
});
const titleEl = document.getElementById('title') as HTMLElement;
const metaEl = document.getElementById('meta') as HTMLElement;
const linkEl = document.getElementById('yt-link') as HTMLAnchorElement;
const plNameEl = document.getElementById('plname') as HTMLElement;

if (!initialId || !VIDEO_ID_RE.test(initialId)) {
  titleEl.textContent = 'Invalid or missing video ID.';
  document.title = 'TubeList';
} else {
  void start(initialId);
}

async function start(firstId: string): Promise<void> {
  const all = await getPlaylists();
  const progress = await getProgress();
  let prefs = await getPlayerPrefs();

  type LoopMode = 'off' | 'all' | 'one';
  const storedLoop = localStorage.getItem('loop');
  let loop: LoopMode = storedLoop === 'all' || storedLoop === 'one' ? storedLoop : 'off';
  const BTN = `inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${FOCUS}`;
  const OFF = 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800';
  const ON = 'border-red-600 bg-red-600 text-white hover:bg-red-500';
  const loopBtn = h('button', BTN);
  const syncBtn = h('button', BTN);
  const renderLoop = (): void => {
    const label = loop === 'one' ? 'Loop one' : loop === 'all' ? 'Loop all' : 'Loop off';
    loopBtn.className = `${BTN} ${loop === 'off' ? OFF : ON}`;
    loopBtn.replaceChildren(icon(loop === 'one' ? LOOP_ONE_ICON : LOOP_ICON), document.createTextNode(label));
    loopBtn.setAttribute('aria-pressed', String(loop !== 'off'));
    loopBtn.title = loop === 'off'
      ? 'Loop off — click for loop all'
      : loop === 'all' ? 'Loop all — click for loop one' : 'Loop one — click to turn loop off';
  };
  // The frame owns no playlist, so it only needs the mode: loop *one* becomes a native `video.loop`
  // there and repeats with no timer while this tab is hidden. It asks for the mode on every load.
  const pushLoop = (): void => iframe.contentWindow?.postMessage({ tubelist: 4, loop }, 'https://www.youtube.com');
  const renderSync = (): void => {
    syncBtn.className = `${BTN} ${prefs.sync ? ON : OFF}`;
    syncBtn.replaceChildren(icon(YOUTUBE_ICON), document.createTextNode(prefs.sync ? 'YouTube sync: on' : 'YouTube sync: off'));
    syncBtn.setAttribute('aria-pressed', String(prefs.sync));
    syncBtn.title = prefs.sync
      ? 'Playing through your signed-in YouTube watch page — click for the embed player'
      : 'Embed player — click to play through your signed-in YouTube account';
  };
  loopBtn.addEventListener('click', () => {
    loop = loop === 'off' ? 'all' : loop === 'all' ? 'one' : 'off';
    localStorage.setItem('loop', loop);
    renderLoop();
    pushLoop();
  });
  syncBtn.addEventListener('click', () => {
    prefs = { ...prefs, sync: !prefs.sync };
    renderSync();
    save(false);
    show(currentId);
    void setPlayerPrefs(prefs);
  });
  const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60];
  const sleepBtn = h('button', BTN);
  const sleepMenu = h('div', 'absolute bottom-full left-0 z-20 mb-1 hidden rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl');
  sleepMenu.setAttribute('aria-label', 'Sleep timer');
  const sleepWrap = h('div', 'relative', sleepBtn, sleepMenu);
  let sleepAt = 0; // wall-clock deadline; a paused or buffering video still counts down
  let sleepTick = 0;
  const setMenu = (open: boolean): void => {
    sleepMenu.classList.toggle('hidden', !open);
    sleepBtn.setAttribute('aria-expanded', String(open));
  };
  const renderSleep = (): void => {
    sleepBtn.className = `${BTN} ${sleepAt ? ON : OFF}`;
    const label = sleepAt ? `Sleep: ${formatDuration(Math.max(0, Math.ceil((sleepAt - Date.now()) / 1000)))}` : 'Sleep off';
    sleepBtn.replaceChildren(icon(MOON_ICON), document.createTextNode(label));
    sleepBtn.title = sleepAt ? 'Sleep timer — click to change or cancel' : 'Pause playback after a set time';
  };
  const setSleep = (minutes: number): void => {
    clearInterval(sleepTick);
    sleepTick = 0;
    sleepAt = minutes ? Date.now() + minutes * 60_000 : 0;
    // Only ticks while a timer is armed. The frame owns the <video>: it gets a command, because the
    // player is a cross-origin iframe. A hidden tab throttles this to about once a minute, so the
    // pause can land late.
    if (sleepAt) sleepTick = setInterval(() => {
      if (Date.now() < sleepAt) {
        renderSleep();
        return;
      }
      sleepAt = 0;
      clearInterval(sleepTick);
      sleepTick = 0;
      renderSleep();
      iframe.contentWindow?.postMessage({ tubelist: 3, cmd: 'pause' }, 'https://www.youtube.com');
    }, 1000);
    setMenu(false);
    renderSleep();
  };
  for (const minutes of SLEEP_MINUTES.concat(0)) {
    const item = h('button', `block w-full whitespace-nowrap rounded px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 ${FOCUS}`, minutes ? `${minutes} min` : 'Off');
    item.addEventListener('click', () => setSleep(minutes));
    sleepMenu.append(item);
  }
  const customInput = h('input', `mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 ${FOCUS}`);
  customInput.type = 'text';
  customInput.placeholder = 'hh:mm';
  customInput.setAttribute('aria-label', 'Custom sleep timer, hh:mm');
  // A form gives Enter-to-apply for free.
  const custom = h('form', '', customInput);
  custom.addEventListener('submit', e => {
    e.preventDefault();
    // `hh:mm`, or a bare number of minutes. Anything else (1.30, an hour+minutes in the wrong shape)
    // leaves the current timer alone and the value in the field to fix.
    const m = /^(?:(\d+):)?(\d+)$/.exec(customInput.value.trim());
    const minutes = m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : 0;
    if (minutes > 0) setSleep(Math.min(minutes, 1440));
  });
  sleepMenu.append(custom);
  const setMenuOpen = (open: boolean): void => {
    setMenu(open);
    if (open) customInput.focus(); // opening is a request to type a time; the presets still take a click
  };
  sleepBtn.addEventListener('click', () => setMenuOpen(sleepMenu.classList.contains('hidden')));
  document.addEventListener('pointerdown', e => {
    if (!sleepMenu.classList.contains('hidden') && !sleepWrap.contains(e.target as Node)) setMenu(false);
  });
  document.addEventListener('keydown', e => e.key === 'Escape' && setMenu(false));
  renderSleep();

  renderLoop();
  renderSync();
  (document.getElementById('controls') as HTMLElement).append(syncBtn, sleepWrap, loopBtn);
  const playlist = all.find(p => p.id === pl);
  // `?pl=` is what the popup opens, but a player URL can lose it (old bookmark, hand-edited link).
  // Loop all then still needs a queue, so fall back to the playlist holding the opening video.
  const loopList = playlist ?? all.find(p => p.videos.some(v => v.id === firstId));
  const videoById = new Map<string, Video>();
  for (const p of all) for (const v of p.videos) if (!videoById.has(v.id)) videoById.set(v.id, v);

  const descriptions = new Map<string, string>();
  const descEl = h('details', 'mt-3 rounded-xl bg-zinc-900 p-3 text-sm');
  const descBody = h('div', 'mt-2 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400');
  descEl.append(h('summary', 'cursor-pointer text-xs font-medium text-zinc-400', 'Description'), descBody);
  descEl.open = true; // the toggle means "shown"; collapsing is the user's own call
  descEl.hidden = true;
  metaEl.after(descEl);

  /** Description text is untrusted: links are built as nodes, never as markup. */
  const linkify = (el: HTMLElement, text: string): void => {
    el.replaceChildren();
    let at = 0;
    for (const m of text.matchAll(/https?:\/\/\S+/g)) {
      const url = m[0].replace(/[.,;:!?]+$/, ''); // prose punctuation that ends the sentence, not the link
      const a = h('a', 'text-blue-400 underline hover:text-blue-300', url);
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      el.append(text.slice(at, m.index), a);
      at = m.index! + url.length;
    }
    el.append(text.slice(at));
  };

  /** Shown only while the preference is on. A row saved before descriptions existed fetches one once. */
  const renderDescription = async (id: string, video: Video | undefined): Promise<void> => {
    descEl.hidden = !prefs.description;
    if (!prefs.description) return;
    let text = video?.description ?? descriptions.get(id);
    if (text === undefined) {
      const fetched = await fetchVideo(id).catch(() => null);
      if (!fetched) {
        // Not cached: a failed request must not pin the panel empty for the rest of the session.
        descEl.hidden = true;
        return;
      }
      text = fetched.description ?? '';
      descriptions.set(id, text);
      if (video) video.description = text;
      if (currentId !== id) return; // the user moved on while the request was out
    }
    linkify(descBody, text);
    descEl.hidden = !text;
  };

  const main = document.querySelector('main') as HTMLElement;
  const rows: HTMLDivElement[] = [];
  const thumbs = new Map<string, HTMLElement>();
  let heading: HTMLElement | null = null;
  let currentId = firstId;

  const setHeading = (): void => {
    if (!heading || !playlist) return;
    const index = playlist.videos.findIndex(x => x.id === currentId);
    heading.textContent = index < 0 ? 'Up next' : `Up next · ${index + 1}/${playlist.videos.length}`;
  };

  const updateRowProgress = (id: string, p: Progress): void => {
    const thumb = thumbs.get(id);
    if (!thumb) return;
    for (const el of thumb.querySelectorAll('[data-progress]')) el.remove();
    thumb.append(...progressOverlay(p));
  };

  if (playlist) {
    plNameEl.textContent = playlist.name;
    heading = h('h2', 'px-2 py-2 text-sm font-semibold');
    const list = h('div');
    const aside = h('aside', 'lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto rounded-2xl bg-zinc-900 p-2', heading, list);
    main.append(resizer(main, aside), aside);

    for (const v of playlist.videos) {
      const row = h('div', 'relative rounded-xl');
      const play = h('button', `w-full text-left flex gap-3 rounded-xl p-2 pr-9 hover:bg-zinc-800 ${FOCUS}`);
      const thumb = h('div', 'relative shrink-0 overflow-hidden rounded-lg');
      const img = h('img', 'w-[120px] h-[68px] object-cover');
      img.src = v.thumbnail;
      img.loading = 'lazy';
      img.alt = '';
      img.draggable = false;
      thumb.append(img);
      const duration = formatDuration(v.durationSec);
      if (duration) thumb.append(h('span', 'absolute bottom-1.5 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white', duration));
      thumb.append(...progressOverlay(progress[v.id]));
      thumbs.set(v.id, thumb);

      const published = formatPublished(v.publishedAt);
      const text = h('div', 'min-w-0 flex-1',
        h('div', 'line-clamp-2 text-sm font-medium leading-snug', v.title),
        h('div', 'mt-0.5 truncate text-xs text-zinc-500', v.channel),
        h('div', 'text-xs text-zinc-500', published),
      );
      if (v.publishedAt) text.lastElementChild!.setAttribute('title', new Date(v.publishedAt).toLocaleDateString());

      play.append(thumb, text);
      play.addEventListener('click', () => show(v.id));

      // Lazy: no undo, the video is gone from storage. Add when a misclick ever loses real data.
      const rm = h('button', `absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full text-zinc-500 transition hover:bg-red-600 hover:text-white ${FOCUS}`);
      rm.setAttribute('aria-label', 'Remove from playlist');
      rm.title = 'Remove from playlist';
      rm.append(icon(TRASH_ICON));
      rm.addEventListener('click', async () => {
        if (!await askConfirm({ title: 'Remove video?', body: `"${v.title}" leaves "${playlist.name}".`, confirm: 'Remove' })) return;
        await removeVideo(playlist.id, v.id);
        // A second click while the first dialog is still up re-splices -1 and eats a neighbour.
        const i = playlist.videos.findIndex(x => x.id === v.id);
        if (i > -1) {
          playlist.videos.splice(i, 1);
          rows.splice(i, 1);
        }
        row.remove();
        setHeading();
      });

      row.append(play, rm);
      rows.push(row);
      list.append(row);
    }

    sortable(list, rows, (from, to) => {
      playlist.videos.splice(to, 0, ...playlist.videos.splice(from, 1));
      void moveVideo(playlist.id, from, to);
      setHeading();
    });
  }

  let lastSave = 0;
  let live = { t: 0, d: 0, state: '' };
  let handledEnd = false;
  const save = (ended: boolean): void => {
    const id = currentId;
    void setProgress(id, live.t, live.d, ended).then(p => {
      if (!p) return;
      progress[id] = p;
      updateRowProgress(id, p);
    });
  };
  window.addEventListener('message', e => {
    if (e.origin !== 'https://www.youtube.com' || e.source !== iframe.contentWindow) return;
    const m = e.data as { tubelist?: number; id?: string; t?: number; d?: number; state?: string } | null;
    if (m?.tubelist === 5) {
      pushLoop(); // a freshly loaded frame asks for the mode, so it can arm native looping itself
      return;
    }
    if (!m || m.tubelist !== 1 || m.id !== currentId) return; // Drop YouTube SPA navigation to another video.
    if (typeof m.t === 'number') live.t = m.t;
    if (typeof m.d === 'number' && Number.isFinite(m.d) && m.d > 0) live.d = m.d;
    live.state = m.state ?? live.state;
    if (live.t < live.d - 0.5) handledEnd = false;
    const finished = live.state === 'ended' || (live.d > 0 && live.t >= live.d - 0.5);
    if (live.state === 'ended' || m.state === 'pause' || Date.now() - lastSave > 5000 || (finished && loop !== 'off')) {
      lastSave = Date.now();
      save(live.state === 'ended' || (finished && loop !== 'off'));
    }
    if (finished) handleFinished();
  });
  const handleFinished = (): void => {
    if (loop === 'off' || handledEnd || live.d <= 0 || live.t < live.d - 0.5) return;
    // Loop one is a native `video.loop` in the frame. Reloading the embed here used to tear the media down
    // a fraction of a second before its own end — before it could repeat — and YouTube refuses to
    // re-initialise the player while the tab is hidden, so the loop stalled until the tab was opened.
    if (loop === 'one') return;
    handledEnd = true;
    const i = loopList ? loopList.videos.findIndex(v => v.id === currentId) : -1;
    show(i > -1 ? loopList!.videos[(i + 1) % loopList!.videos.length].id : currentId);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      save(false);
      return;
    }
    iframe.contentWindow?.postMessage({ tubelist: 3, cmd: 'report' }, 'https://www.youtube.com');
  });
  window.addEventListener('pagehide', () => save(false));

  const show = (id: string): void => {
    if (currentId !== id && live.d > 0) save(false);
    currentId = id;
    live = { t: 0, d: 0, state: '' };
    handledEnd = false;
    const stored = progress[id];
    // ponytail: resume source is local progress; reading the account's resume position is not implemented.
    const resumeAt = stored && !stored.done && stored.t > 3 ? stored.t : 0;
    iframe.src = prefs.sync ? watchUrl(id, resumeAt) : embedUrl(id, resumeAt);
    const video = videoById.get(id);
    void renderDescription(id, video);

    if (video) {
      titleEl.textContent = video.title;
      metaEl.textContent = [video.channel, formatPublished(video.publishedAt)].filter(Boolean).join(' · ');
      document.title = `${video.title} — TubeList`;
    } else {
      titleEl.textContent = id;
      metaEl.textContent = '';
      document.title = 'TubeList';
    }
    linkEl.href = `https://www.youtube.com/watch?v=${id}`;

    const index = playlist ? playlist.videos.findIndex(x => x.id === id) : -1;
    setHeading();

    rows.forEach((row, i) => {
      const active = i === index;
      row.classList.toggle('bg-zinc-800', active);
      row.classList.toggle('ring-1', active);
      row.classList.toggle('ring-red-500/60', active);
      if (active) {
        row.setAttribute('aria-current', 'true');
        row.scrollIntoView({ block: 'nearest' });
      } else {
        row.removeAttribute('aria-current');
      }
    });

    history.replaceState(null, '', `?${new URLSearchParams(pl ? { v: id, pl } : { v: id })}`);
  };

  // Toggles apply live. Switching the player source reloads the current video from its stored position.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.playerPrefs) return;
    const wasSync = prefs.sync;
    const next = changes.playerPrefs.newValue as Partial<PlayerPrefs> | undefined;
    prefs = {
      description: typeof next?.description === 'boolean' ? next.description : prefs.description,
      sync: typeof next?.sync === 'boolean' ? next.sync : prefs.sync,
    };
    if (prefs.sync !== wasSync) {
      save(false);
      show(currentId);
    } else {
      void renderDescription(currentId, videoById.get(currentId));
    }
    renderSync();
  });

  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement) return;
    if (!playlist) return;
    const index = playlist.videos.findIndex(x => x.id === currentId);
    if (e.key === 'n' && index > -1 && index < playlist.videos.length - 1) show(playlist.videos[index + 1].id);
    if (e.key === 'p' && index > 0) show(playlist.videos[index - 1].id);
  });

  show(firstId);
}

/** Drag/splitter handle between the player and the playlist column; width persists as `plw`. */
function resizer(main: HTMLElement, aside: HTMLElement): HTMLElement {
  const MIN = 260;
  const handle = h('div', `hidden lg:block -mx-2.5 w-1.5 self-stretch cursor-col-resize rounded-full bg-zinc-800 hover:bg-red-500/70 active:bg-red-500 ${FOCUS}`);
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize playlist sidebar');
  handle.tabIndex = 0;

  const apply = (w: number): void => {
    const px = Math.round(Math.min(Math.max(main.clientWidth - 320, MIN), Math.max(w, MIN)));
    main.style.setProperty('--plw', `${px}px`);
    handle.setAttribute('aria-valuenow', String(px));
    handle.setAttribute('aria-valuemin', String(MIN));
    handle.setAttribute('aria-valuemax', String(Math.max(main.clientWidth - 320, MIN)));
  };
  const persist = (): void => localStorage.setItem('plw', main.style.getPropertyValue('--plw'));
  const width = (): number => aside.getBoundingClientRect().width;

  const stored = parseFloat(localStorage.getItem('plw') ?? '');
  if (stored) apply(stored);

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    // The player is a cross-origin iframe, so a drag that crosses it would send its moves there
    // instead of here (pointer capture does not retarget across it). A shield over the viewport
    // keeps every move on this document.
    const shield = h('div', 'fixed inset-0 z-50 cursor-col-resize touch-none');
    document.body.append(shield);
    const startX = e.clientX;
    const startW = width(); // delta-based: matches the pointer exactly, no jump on the first move
    const move = (ev: PointerEvent): void => apply(startW + startX - ev.clientX);
    const end = (): void => {
      shield.remove();
      persist();
    };
    shield.addEventListener('pointermove', move);
    shield.addEventListener('pointerup', end, { once: true });
    shield.addEventListener('pointercancel', end, { once: true });
  });
  // A saved width can exceed the container after the window narrows; re-clamp it.
  window.addEventListener('resize', () => apply(width()));
  handle.addEventListener('keydown', e => {
    const delta = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0;
    if (!delta) return;
    e.preventDefault();
    apply(width() + delta);
    persist();
  });
  return handle;
}
