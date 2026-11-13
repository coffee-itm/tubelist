import '../styles.css';
import { h } from '../lib/dom';
import { cleanName, deletePlaylist, getPlaylists, removeVideo, renamePlaylist } from '../lib/store';
import { formatDuration, formatPublished } from '../lib/format';
import { playerUrl } from '../lib/url';
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
  const playlist = playlists.find(p => p.id === openId);
  if (openId && !playlist) openId = null;
  app.replaceChildren(playlist ? detail(playlist) : list(playlists));
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
  root.append(
    h('div', HEADER,
      logo(24),
      h('span', 'font-semibold', 'TubeList'),
      h('span', 'ml-auto text-xs text-zinc-500', String(playlists.length)),
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

function detail(p: Playlist): HTMLElement {
  const root = h('div');

  const back = h('button', `rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`, '←');
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', () => {
    openId = null;
    void render();
  });

  const name = h('input', 'min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-red-500');
  name.value = p.name;
  name.setAttribute('aria-label', 'Playlist name');
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

  const row = h('div', HEADER, back, name);

  if (p.videos.length) {
    const play = h('button', `rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 ${FOCUS}`, '▶ Play all');
    play.addEventListener('click', () => void chrome.tabs.create({ url: playerUrl(p.videos[0].id, p.id) }));
    row.append(play);
  }

  const del = h('button', `rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950 ${FOCUS}`, 'Delete');
  del.addEventListener('click', async () => {
    if (!confirm(`Delete "${p.name}"?`)) return;
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
  for (const v of p.videos) ul.append(videoRow(p, v));
  root.append(ul);
  return root;
}

function videoRow(p: Playlist, v: Video): HTMLElement {
  const url = playerUrl(v.id, p.id);
  const a = h('a', `flex gap-3 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`);
  a.href = url;
  a.addEventListener('click', e => {
    e.preventDefault();
    void chrome.tabs.create({ url });
  });

  const thumb = h('div', 'relative shrink-0');
  const img = h('img', 'w-[120px] h-[68px] rounded-lg object-cover');
  img.src = v.thumbnail;
  img.loading = 'lazy';
  img.alt = '';
  thumb.append(img);
  const duration = formatDuration(v.durationSec);
  if (duration) thumb.append(h('span', 'absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white', duration));

  const published = formatPublished(v.publishedAt);
  const text = h('div', 'min-w-0 flex-1 pr-6',
    h('div', 'line-clamp-2 text-sm font-medium leading-snug', v.title),
    h('div', 'mt-0.5 truncate text-xs text-zinc-500', v.channel),
    h('div', 'text-xs text-zinc-500', published),
  );
  if (v.publishedAt) text.lastElementChild!.setAttribute('title', new Date(v.publishedAt).toLocaleDateString());

  a.append(thumb, text);

  const rm = h('button', `absolute right-2 top-2 rounded-md p-1 text-zinc-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 ${FOCUS}`, '×');
  rm.setAttribute('aria-label', 'Remove from playlist');
  rm.addEventListener('click', async () => {
    await removeVideo(p.id, v.id);
    void render();
  });

  return h('li', 'vid group relative', a, rm);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.playlists) void render();
});

void render();