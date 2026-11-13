import '../styles.css';
import { h } from '../lib/dom';
import { cleanName, deletePlaylist, getPlaylists, removeVideo, renamePlaylist, savePlaylist } from '../lib/store';
import { getProgress, progressOverlay, type Progress } from '../lib/progress';
import { formatDuration, formatPublished } from '../lib/format';
import { playerUrl, queueUrl } from '../lib/url';
import type { Playlist, PlaylistKind, Video } from '../lib/types';

const app = document.getElementById('app') as HTMLElement;
let openId: string | null = null;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';
const HEADER = 'sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur';
const KIND: Record<PlaylistKind, [string, string]> = {
  custom: ['Playlist', 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'],
  youtube: ['YouTube', 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300'],
  queue: ['Queue', 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300'],
};

async function render(): Promise<void> {
  const playlists = await getPlaylists();
  const progress = await getProgress();
  const playlist = playlists.find(p => p.id === openId);
  if (openId && !playlist) openId = null;
  app.replaceChildren(playlist ? detail(playlist, progress) : list(playlists));
}

function logo(size: number, className = ''): HTMLImageElement {
  const img = h('img', className);
  img.src = 'icons/icon.svg';
  img.width = size;
  img.height = size;
  img.alt = '';
  return img;
}

function list(playlists: Playlist[]): HTMLElement {
  const root = h('div');
  const create = h('button', `ml-auto rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 ${FOCUS}`, '+ New playlist');
  create.addEventListener('click', async () => {
    const name = cleanName(prompt('Playlist name') ?? '', '');
    if (!name) return;
    const p = await savePlaylist({ name, kind: 'custom', sourceId: null, videos: [] });
    openId = p.id;
    void render();
  });
  root.append(
    h('div', HEADER,
      logo(24),
      h('span', 'font-semibold', 'TubeList'),
      h('span', 'text-xs text-zinc-500', String(playlists.length)),
      create,
    ),
  );

  if (playlists.length === 0) {
    root.append(
      h('p', 'p-8 text-center text-sm text-zinc-500',
        logo(48, 'opacity-80 mx-auto mb-3'),
        'No playlists yet.',
        h('br'),
        'Right-click any YouTube link → ',
        h('strong', '', 'Add to TubeList'),
        '.',
      ),
    );
    return root;
  }

  const ul = h('ul', 'p-2');
  for (const p of playlists) {
    const btn = h('button', `pl w-full flex items-center gap-3 rounded-xl p-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition ${FOCUS}`);
    btn.addEventListener('click', () => {
      openId = p.id;
      void render();
    });

    const first = p.videos[0];
    const thumb = h('div', 'relative shrink-0');
    if (first) {
      const img = h('img', 'relative w-20 h-[45px] rounded-md object-cover');
      img.src = first.thumbnail;
      img.loading = 'lazy';
      img.alt = '';
      thumb.append(h('div', 'absolute -top-1 left-1 right-1 h-full rounded-md bg-zinc-300 dark:bg-zinc-700'), img);
    } else {
      thumb.append(h('div', 'w-20 h-[45px] rounded-md bg-zinc-200 dark:bg-zinc-800'));
    }

    const total = p.videos.reduce((sum, v) => sum + (v.durationSec ?? 0), 0);
    const [label, colors] = KIND[p.kind];

    btn.append(
      thumb,
      h('div', 'min-w-0 flex-1',
        h('div', 'truncate text-sm font-medium', p.name),
        h('div', 'text-xs text-zinc-500', `${p.videos.length} videos · ${formatDuration(total)}`),
      ),
      h('span', `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${colors}`, label),
    );
    ul.append(h('li', '', btn));
  }
  root.append(ul);
  return root;
}

function detail(p: Playlist, progress: Record<string, Progress>): HTMLElement {
  const root = h('div');

  const back = h('button', `rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`, '←');
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', () => {
    openId = null;
    void render();
  });

  const name = h('input', `min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-zinc-400 focus:ring-2 focus:ring-red-500 dark:border-zinc-700 ${FOCUS}`);
  name.value = p.name;
  name.setAttribute('aria-label', 'Playlist name');
  name.title = 'Click to rename';
  const commitName = async () => {
    const next = cleanName(name.value, p.name);
    name.value = next;
    if (next !== p.name) {
      await renamePlaylist(p.id, next);
      void render();
    }
  };
  name.addEventListener('change', () => void commitName());
  name.addEventListener('keydown', e => {
    if (e.key === 'Enter') void commitName();
  });

  const pencil = h('button', `rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`, '✎');
  pencil.setAttribute('aria-label', 'Rename playlist');
  pencil.addEventListener('click', () => {
    name.focus();
    name.select();
  });

  const row = h('div', HEADER, back, name, pencil);

  if (p.videos.length) {
    const share = h('button', `rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`, 'Share');
    share.setAttribute('aria-label', 'Share playlist as YouTube link');
    share.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(queueUrl(p.videos.map(v => v.id)));
        share.textContent = '✓ Copied link';
      } catch {
        share.textContent = 'Copy failed';
      }
      setTimeout(() => { share.textContent = 'Share'; }, 1500);
    });
    row.append(share);

    const play = h('button', `rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 ${FOCUS}`, '▶ Play all');
    play.addEventListener('click', () => void chrome.tabs.create({ url: playerUrl(p.videos[0].id, p.id) }));
    row.append(play);
  }

  const del = h('button', `rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950 ${FOCUS}`, 'Delete');
  del.addEventListener('click', async () => {
    if (!confirm(`Delete playlist "${p.name}" and its ${p.videos.length} videos?`)) return;
    await deletePlaylist(p.id);
    openId = null;
    void render();
  });
  row.append(del);
  root.append(row);

  if (p.videos.length === 0) {
    root.append(h('p', 'p-8 text-center text-sm text-zinc-500', 'This playlist is empty.'));
    return root;
  }

  const ul = h('ul', 'p-2 space-y-1');
  for (const v of p.videos) ul.append(videoRow(p, v, progress[v.id]));
  root.append(ul);
  return root;
}

function videoRow(p: Playlist, v: Video, prog: Progress | undefined): HTMLElement {
  const url = playerUrl(v.id, p.id);
  const a = h('a', `flex gap-3 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`);
  a.href = url;
  a.addEventListener('click', e => {
    e.preventDefault();
    void chrome.tabs.create({ url });
  });

  const thumb = h('div', 'relative shrink-0 overflow-hidden rounded-lg');
  const img = h('img', 'w-[120px] h-[68px] object-cover');
  img.src = v.thumbnail;
  img.loading = 'lazy';
  img.alt = '';
  thumb.append(img);
  const duration = formatDuration(v.durationSec);
  if (duration) thumb.append(h('span', 'absolute bottom-1.5 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white', duration));
  thumb.append(...progressOverlay(prog));

  const published = formatPublished(v.publishedAt);
  const text = h('div', 'min-w-0 flex-1 pr-6',
    h('div', 'line-clamp-2 text-sm font-medium leading-snug', v.title),
    h('div', 'mt-0.5 truncate text-xs text-zinc-500', v.channel),
    h('div', 'text-xs text-zinc-500', published),
  );
  if (v.publishedAt) text.lastElementChild!.setAttribute('title', new Date(v.publishedAt).toLocaleDateString());

  a.append(thumb, text);

  const rm = h('button', `absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 transition hover:bg-red-600 hover:text-white hover:ring-red-600 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 ${FOCUS}`);
  rm.setAttribute('aria-label', 'Remove from playlist');
  rm.title = 'Remove from playlist';
  rm.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4v3h-4zM6.5 7l1 13h9l1-13M10.5 11v6M13.5 11v6"/></svg>';
  rm.addEventListener('click', async () => {
    if (!confirm(`Remove "${v.title}" from "${p.name}"?`)) return;
    await removeVideo(p.id, v.id);
    void render();
  });

  return h('li', 'vid relative', a, rm);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.playlists || changes.progress)) void render();
});

void render();