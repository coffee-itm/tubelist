import '../styles.css';
import { h } from '../lib/dom';
import { getPlaylists } from '../lib/store';
import { formatDuration, formatPublished } from '../lib/format';
import { watchUrl, VIDEO_ID_RE } from '../lib/url';
import { getProgress, progressOverlay, setProgress, type Progress } from '../lib/progress';
import type { Playlist, Video } from '../lib/types';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';

const params = new URLSearchParams(location.search);
const initialId = params.get('v');
const pl = params.get('pl');

const iframe = document.getElementById('yt') as HTMLIFrameElement;
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
  const playlist = all.find(p => p.id === pl);
  const videoById = new Map<string, Video>();
  for (const p of all) for (const v of p.videos) if (!videoById.has(v.id)) videoById.set(v.id, v);

  const main = document.querySelector('main') as HTMLElement;
  const rows: HTMLButtonElement[] = [];
  const thumbs = new Map<string, HTMLElement>();
  let heading: HTMLElement | null = null;
  let currentId = firstId;

  const updateRowProgress = (id: string, p: Progress): void => {
    const thumb = thumbs.get(id);
    if (!thumb) return;
    for (const el of thumb.querySelectorAll('[data-progress]')) el.remove();
    thumb.append(...progressOverlay(p));
  };

  if (playlist) {
    plNameEl.textContent = playlist.name;
    heading = h('h2', 'px-2 py-2 text-sm font-semibold');
    const aside = h('aside', 'lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto rounded-2xl bg-zinc-900 p-2', heading);

    for (const v of playlist.videos) {
      const row = h('button', `w-full text-left flex gap-3 rounded-xl p-2 hover:bg-zinc-800 ${FOCUS}`);
      const thumb = h('div', 'relative shrink-0 overflow-hidden rounded-lg');
      const img = h('img', 'w-[120px] h-[68px] object-cover');
      img.src = v.thumbnail;
      img.loading = 'lazy';
      img.alt = '';
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

      row.append(thumb, text);
      row.addEventListener('click', () => show(v.id));
      rows.push(row);
      aside.append(row);
    }
    main.append(aside);
  }

  let lastSave = 0;
  let live = { t: 0, d: 0 };
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
    if (!m || m.tubelist !== 1 || m.id !== currentId) return; // id check drops YouTube's own SPA navigation to another video
    if (typeof m.t === 'number') live.t = m.t;
    if (typeof m.d === 'number' && Number.isFinite(m.d) && m.d > 0) live.d = m.d;
    const ended = m.state === 'ended';
    if (ended || m.state === 'pause' || Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      save(ended);
    }
  });
  // The player page is the "left off here" moment; hidden tab or unload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save(false);
  });
  window.addEventListener('pagehide', () => save(false));

  const show = (id: string): void => {
    currentId = id;
    live = { t: 0, d: 0 };
    const stored = progress[id];
    // ponytail: resume source is local progress; reading the account's resume position is not implemented.
    const resumeAt = stored && !stored.done && stored.t > 3 ? stored.t : 0;
    iframe.src = watchUrl(id, resumeAt);
    const video = videoById.get(id);

    if (video) {
      titleEl.textContent = video.title;
      metaEl.textContent = [video.channel, formatPublished(video.publishedAt), formatDuration(video.durationSec)].filter(Boolean).join(' · ');
      document.title = `${video.title} — TubeList`;
    } else {
      titleEl.textContent = id;
      metaEl.textContent = '';
      document.title = 'TubeList';
    }
    linkEl.href = `https://www.youtube.com/watch?v=${id}`;

    const index = playlist ? playlist.videos.findIndex(x => x.id === id) : -1;
    if (heading && playlist) heading.textContent = index < 0 ? 'Up next' : `Up next · ${index + 1}/${playlist.videos.length}`;

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

  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement) return;
    if (!playlist) return;
    const index = playlist.videos.findIndex(x => x.id === currentId);
    if (e.key === 'n' && index > -1 && index < playlist.videos.length - 1) show(playlist.videos[index + 1].id);
    if (e.key === 'p' && index > 0) show(playlist.videos[index - 1].id);
  });

  show(firstId);
}