import '../styles.css';
import { h, icon, CHECK_ICON, CHEVRON_ICON, GEAR_ICON, SHARE_ICON, TRASH_ICON } from '../lib/dom';
import { cleanName, deletePlaylist, getListSort, getPlaylists, savePlaylist, setListSort, updatePlaylist, SAVED_SOURCE_ID } from '../lib/store';
import { fetchVideo } from '../lib/innertube';
import { sortable } from '../lib/sortable';
import { PLAYLIST_SORT_OPTIONS, SORT_OPTIONS, sortPlaylists, sortVideos } from '../lib/sort';
import { getProgress, progressOverlay, type Progress } from '../lib/progress';
import { formatDuration, formatPublished } from '../lib/format';
import { playerUrl, queueUrl, classifyUrl } from '../lib/url';
import { saveLink, type SaveTarget } from '../lib/save';
import { askChoice, askConfirm, askText } from '../lib/dialog';
import type { ListSort, Playlist, PlaylistKind, SortMode, Video } from '../lib/types';

const app = document.getElementById('app') as HTMLElement;
let openId: string | null = null;
// The detail view edits a working copy. Nothing reaches storage until Save, so a stray back
// gesture cannot half-apply a rename, a type change and a reorder.
let draft: Playlist | null = null;
let dirty = false;
const dropDraft = () => { draft = null; dirty = false; };

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';
const HEADER = 'sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur';
const SELECT = `max-w-full appearance-none truncate rounded-lg border border-zinc-300 bg-white py-1.5 pl-2 pr-7 text-xs outline-none transition-colors hover:border-zinc-400 focus:ring-2 focus:ring-red-500 dark:border-zinc-700 dark:bg-zinc-900 ${FOCUS}`;
const KIND: Record<PlaylistKind, [string, string]> = {
  custom: ['Playlist', 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'],
  youtube: ['YouTube', 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300'],
  queue: ['Queue', 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300'],
};
const KIND_OPTIONS: PlaylistKind[] = ['custom', 'youtube', 'queue'];

// Built once: the bar is re-appended on every render, so typing survives a storage change.
const linkInput = h('input', `w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-500 hover:border-zinc-400 focus:ring-2 focus:ring-red-500 dark:border-zinc-700 dark:placeholder:text-zinc-400 ${FOCUS}`);
linkInput.type = 'text';
linkInput.id = 'tl-link';
linkInput.placeholder = 'Paste a video or playlist link';
linkInput.autocomplete = 'off';
linkInput.spellcheck = false;

const linkLabel = h('label', 'sr-only', 'YouTube video or playlist link');
linkLabel.htmlFor = linkInput.id;

const addStatus = h('p', 'text-xs');
addStatus.setAttribute('role', 'status');
addStatus.hidden = true;
const clearStatus = () => {
  addStatus.textContent = '';
  addStatus.hidden = true;
};
const SAVED = 'saved';

function option(value: string, label: string): HTMLOptionElement {
  const el = h('option', '', label);
  el.value = value;
  return el;
}

const targetSelect = h('select', `w-full appearance-none truncate rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-8 text-sm outline-none transition-colors hover:border-zinc-400 focus:ring-2 focus:ring-red-500 dark:border-zinc-700 dark:bg-zinc-900 ${FOCUS}`);
targetSelect.setAttribute('aria-label', 'Playlist to save into');
targetSelect.title = 'Where a pasted video goes';

const chevron = h('span', 'pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400', icon(CHEVRON_ICON));
const targetWrap = h('div', 'relative min-w-0 flex-1', targetSelect, chevron);

/** Rebuilds the options from storage, keeping the current choice when it still exists. */
function syncTargets(playlists: Playlist[]): void {
  const wanted = targetSelect.value || openId || SAVED;
  // The Saved playlist is renamable, so its dropdown row follows the stored name.
  const saved = playlists.find(p => p.sourceId === SAVED_SOURCE_ID);
  targetSelect.replaceChildren(
    option(SAVED, saved?.name ?? 'Saved'),
    ...playlists.filter(p => p.sourceId !== SAVED_SOURCE_ID).map(p => option(p.id, p.name)),
  );
  if (![...targetSelect.options].some(o => o.value === wanted)) targetSelect.value = SAVED;
  else targetSelect.value = wanted;
}

/** Repaints one thumbnail's watched bar/badge in place (progress ticks every few seconds). */
const progressThumbs = new Map<string, HTMLElement>();
function paintProgress(thumb: HTMLElement, p: Progress | undefined): void {
  for (const el of thumb.querySelectorAll('[data-progress]')) el.remove();
  thumb.append(...progressOverlay(p));
}

const addButton = h('button', `shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800 disabled:opacity-50 ${FOCUS}`, 'Add');
const addBar = h('div', 'space-y-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800',
  linkLabel,
  linkInput,
  h('div', 'flex items-center gap-2', targetWrap, addButton),
  addStatus,
);

async function addLink(): Promise<void> {
  const raw = linkInput.value.trim();
  if (!raw || addButton.disabled) return;
  const picked = (await getPlaylists()).find(p => p.id === targetSelect.value);
  const target: SaveTarget = picked ? { kind: 'playlist', playlistId: picked.id, name: picked.name } : { kind: 'saved' };
  const where = picked?.name ?? 'Saved';
  const say = (text: string, color: string) => {
    addStatus.className = `text-xs ${color}`;
    addStatus.textContent = text;
    addStatus.hidden = false;
  };
  const link = classifyUrl(raw);
  // ponytail: only a video link can land in the open playlist. A playlist/queue link always makes or
  // refreshes its own by sourceId, so none is staged; refresh such a paste after Save.
  if (draft && picked?.id === draft.id && link.type === 'video') {
    if (draft.videos.some(v => v.id === link.videoId)) { say(`Already in ${draft.name}`, 'text-zinc-500 dark:text-zinc-400'); return; }
    addButton.disabled = true;
    say('Fetching...', 'text-zinc-500 dark:text-zinc-400');
    try {
      const meta = await fetchVideo(link.videoId);
      if (meta) {
        draft.videos.push({ ...meta, addedAt: Date.now() });
        dirty = true;
        linkInput.value = '';
        say(`Added to ${draft.name} (unsaved)`, 'text-green-700 dark:text-green-400');
        void render();
      } else say('Video unavailable', 'text-red-600 dark:text-red-400');
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), 'text-red-600 dark:text-red-400');
    }
    addButton.disabled = false;
    return;
  }
  addButton.disabled = true;
  addButton.setAttribute('aria-busy', 'true');
  say(`Saving to ${where}...`, 'text-zinc-500 dark:text-zinc-400');
  try {
    const message = await saveLink(link, target, (done, total) => say(`Fetching ${done}/${total}…`, 'text-zinc-500 dark:text-zinc-400'));
    linkInput.value = '';
    say(message, 'text-green-700 dark:text-green-400');
    void render();
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    say(text.includes('HTTP 400') ? 'Playlist not found or private' : text, 'text-red-600 dark:text-red-400');
  }
  addButton.disabled = false;
  addButton.removeAttribute('aria-busy');
}
addButton.addEventListener('click', () => void addLink());
linkInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') void addLink();
});

async function render(): Promise<void> {
  const [playlists, sort] = await Promise.all([getPlaylists(), getListSort()]);
  const ordered = sortPlaylists(playlists, sort);
  syncTargets(ordered);
  const progress = await getProgress();
  const playlist = ordered.find(p => p.id === openId);
  if (!playlist) {
    openId = null;
    dropDraft();
  } else if (!draft || draft.id !== playlist.id) {
    // Follow storage unless a draft is already open here: it holds the unsaved edits.
    draft = structuredClone(playlist);
  }
  progressThumbs.clear();
  app.replaceChildren(draft ? detail(draft, progress) : list(ordered, sort));
}

function logo(size: number, className = ''): HTMLImageElement {
  const img = h('img', className);
  img.src = 'icons/icon.svg';
  img.width = size;
  img.height = size;
  img.alt = '';
  return img;
}

function list(playlists: Playlist[], sort: ListSort): HTMLElement {
  const root = h('div');
  const gear = h('button', `ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${FOCUS}`);
  gear.type = 'button';
  gear.title = 'TubeList settings';
  gear.setAttribute('aria-label', 'TubeList settings');
  gear.append(icon(GEAR_ICON));
  gear.addEventListener('click', () => void chrome.runtime.openOptionsPage());
  const create = h('button', `rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800 ${FOCUS}`, '+ New playlist');
  create.addEventListener('click', async () => {
    const name = cleanName((await askText({ title: 'New playlist', label: 'Name', confirm: 'Create' })) ?? '', '');
    if (!name) return;
    const p = await savePlaylist({ name, kind: 'custom', sourceId: null, videos: [] });
    clearStatus();
    openId = p.id;
    targetSelect.value = p.id;
    void render();
  });
  root.append(
    h('div', HEADER,
      logo(24),
      h('span', 'font-semibold', 'TubeList'),
      h('span', 'text-xs text-zinc-500 dark:text-zinc-400', `v${chrome.runtime.getManifest().version}`),
      h('span', 'text-xs text-zinc-500 dark:text-zinc-400', String(playlists.length)),
      gear,
      create,
    ),
    addBar,
  );

  if (playlists.length === 0) {
    root.append(
      h('p', 'p-8 text-center text-sm text-zinc-500 dark:text-zinc-400',
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

  const sortSelect = h('select', SELECT);
  sortSelect.setAttribute('aria-label', 'Sort playlists');
  sortSelect.title = 'Sort the playlist list';
  for (const o of PLAYLIST_SORT_OPTIONS) sortSelect.append(option(o.id, o.label));
  sortSelect.value = sort;
  sortSelect.addEventListener('change', async () => {
    await setListSort(sortSelect.value as ListSort);
    void render();
  });
  root.append(
    h('div', 'flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800',
      h('label', 'text-xs text-zinc-500 dark:text-zinc-400', 'Sort'),
      sortSelect,
    ),
  );

  const ul = h('ul', 'p-2');
  for (const p of playlists) {
    const btn = h('button', `pl w-full flex items-center gap-3 rounded-xl p-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition ${FOCUS}`);
    btn.addEventListener('click', () => {
      clearStatus();
      dropDraft();
      openId = p.id;
      targetSelect.value = p.id;
      void render();
    });

    const latest = p.videos.reduce<Video | undefined>((a, b) => (!a || b.addedAt >= a.addedAt ? b : a), undefined);
    const thumb = h('div', 'relative shrink-0');
    if (latest) {
      const img = h('img', 'relative w-20 h-[45px] rounded-md object-cover');
      img.src = latest.thumbnail;
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
        h('div', 'text-xs text-zinc-500 dark:text-zinc-400', `${p.videos.length} video${p.videos.length === 1 ? '' : 's'} · ${formatDuration(total)}`),
      ),
      h('span', `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${colors}`, label),
    );
    ul.append(h('li', '', btn));
  }
  root.append(ul);
  return root;
}

/** Writes the working copy back and drops it. Callers render. */
async function saveDraft(): Promise<void> {
  if (!draft) return;
  await updatePlaylist(draft.id, { name: draft.name, kind: draft.kind, sort: draft.sort, videos: draft.videos });
  draft = null;
  dirty = false;
}

/** Back button: with unsaved edits, the user chooses Save, Discard, or stays (Cancel/Esc). */
async function leaveDetail(p: Playlist): Promise<void> {
  if (dirty) {
    const choice = await askChoice({
      title: 'Save your changes?',
      body: `"${p.name}" has unsaved edits.`,
      confirm: 'Save',
      alt: 'Discard',
    });
    if (choice === null) return;
    if (choice === 'confirm') await saveDraft();
    else dropDraft();
  }
  clearStatus();
  openId = null;
  dropDraft();
  targetSelect.value = SAVED;
  void render();
}

function detail(p: Playlist, progress: Record<string, Progress>): HTMLElement {
  const root = h('div');
  // Every edit lands here: the working copy changes, storage does not, until Save.
  const edit = () => { dirty = true; void render(); };

  const back = h('button', `rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`, '←');
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', () => void leaveDetail(p));

  const name = h('input', `min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-zinc-400 focus:ring-2 focus:ring-red-500 dark:border-zinc-700 ${FOCUS}`);
  name.value = p.name;
  name.setAttribute('aria-label', 'Playlist name');
  name.title = 'Click to rename';
  const commitName = () => {
    const next = cleanName(name.value, p.name);
    name.value = next;
    if (next !== p.name) {
      p.name = next;
      edit();
    }
  };
  name.addEventListener('change', () => commitName());
  name.addEventListener('keydown', e => {
    if (e.key === 'Enter') commitName();
  });

  const pencil = h('button', `rounded-md p-1 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`, '✎');
  pencil.setAttribute('aria-label', 'Rename playlist');
  pencil.addEventListener('click', () => {
    name.focus();
    name.select();
  });

  // Shown only once there is something to save.
  const save = h('button', `rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800 ${FOCUS}`, 'Save');
  save.hidden = !dirty;
  save.addEventListener('click', () => void saveDraft().then(() => render()));

  const row = h('div', HEADER, back, name, pencil, save);

  if (p.videos.length) {
    const share = h('button', `rounded-md p-1 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`);
    const label = () => { share.title = 'Copy share link'; share.setAttribute('aria-label', 'Copy share link'); };
    label();
    share.append(icon(SHARE_ICON));
    share.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(queueUrl(p.videos.map(v => v.id)));
        share.replaceChildren(icon(CHECK_ICON));
        share.title = 'Copied!';
        share.setAttribute('aria-label', 'Copied');
      } catch {
        share.title = 'Copy failed';
      }
      setTimeout(() => {
        share.replaceChildren(icon(SHARE_ICON));
        label();
      }, 1500);
    });
    row.append(share);

    const play = h('button', `rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 ${FOCUS}`, '▶ Play all');
    play.addEventListener('click', () => void chrome.tabs.create({ url: playerUrl(sortVideos(p.videos, p.sort)[0].id, p.id) }));
    row.append(play);
  }

  const del = h('button', `rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950 ${FOCUS}`, 'Delete');
  del.addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Delete playlist?',
      body: `"${p.name}" and its ${p.videos.length} video${p.videos.length === 1 ? '' : 's'} are removed from this browser.`,
      confirm: 'Delete',
    });
    if (!ok) return;
    await deletePlaylist(p.id);
    openId = null;
    dropDraft();
    void render();
  });
  row.append(del);
  root.append(row, addBar);

  const selectCls = SELECT;

  const kindSelect = h('select', selectCls);
  kindSelect.setAttribute('aria-label', 'Playlist type');
  kindSelect.title = "Change this playlist's type";
  for (const k of KIND_OPTIONS) kindSelect.append(option(k, KIND[k][0]));
  kindSelect.value = p.kind;
  kindSelect.addEventListener('change', () => {
    p.kind = kindSelect.value as PlaylistKind;
    // Same rule the store applies: a custom playlist mirrors no YouTube source.
    if (p.kind === 'custom' && p.sourceId !== SAVED_SOURCE_ID) p.sourceId = null;
    edit();
  });
  root.append(h('div', 'flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800',
    h('label', 'text-xs text-zinc-500 dark:text-zinc-400', 'Type'),
    kindSelect,
  ));

  if (p.videos.length === 0) {
    root.append(h('p', 'p-8 text-center text-sm text-zinc-500 dark:text-zinc-400', 'This playlist is empty.'));
    return root;
  }

  const ul = h('ul', 'p-2 space-y-1');
  const ordered = sortVideos(p.videos, p.sort);
  const rows = ordered.map(v => videoRow(p, v, progress[v.id]));
  for (const row of rows) ul.append(row);
  // Drag only makes sense in manual order: the sorted views are read-only.
  if (!p.sort || p.sort === 'manual') sortable(ul, rows, (from, to) => {
    p.videos.splice(to, 0, ...p.videos.splice(from, 1));
    edit();
  });

  const sortSelect = h('select', selectCls);
  sortSelect.setAttribute('aria-label', 'Sort videos');
  sortSelect.title = 'Sort this playlist';
  for (const o of SORT_OPTIONS) sortSelect.append(option(o.id, o.label));
  sortSelect.value = p.sort ?? 'manual';
  sortSelect.addEventListener('change', () => {
    p.sort = sortSelect.value as SortMode;
    edit();
  });
  root.append(h('div', 'flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800',
    h('label', 'text-xs text-zinc-500 dark:text-zinc-400', 'Sort'),
    sortSelect,
  ), ul);
  return root;
}

function videoRow(p: Playlist, v: Video, prog: Progress | undefined): HTMLElement {
  const url = playerUrl(v.id, p.id);
  const a = h('a', `flex gap-3 rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${FOCUS}`);
  a.href = url;
  a.draggable = false; // the row owns the drag; a link drag would carry the URL instead
  a.addEventListener('click', e => {
    e.preventDefault();
    void chrome.tabs.create({ url });
  });

  const thumb = h('div', 'relative shrink-0 overflow-hidden rounded-lg');
  const img = h('img', 'w-[120px] h-[68px] object-cover');
  img.src = v.thumbnail;
  img.loading = 'lazy';
  img.alt = '';
  img.draggable = false;
  thumb.append(img);
  const duration = formatDuration(v.durationSec);
  if (duration) thumb.append(h('span', 'absolute bottom-1.5 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white', duration));
  progressThumbs.set(v.id, thumb);
  paintProgress(thumb, prog);

  const published = formatPublished(v.publishedAt);
  const text = h('div', 'min-w-0 flex-1 pr-6',
    h('div', 'line-clamp-2 text-sm font-medium leading-snug', v.title),
    h('div', 'mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400', v.channel),
    h('div', 'text-xs text-zinc-500 dark:text-zinc-400', published),
  );
  if (v.publishedAt) text.lastElementChild!.setAttribute('title', new Date(v.publishedAt).toLocaleDateString());

  a.append(thumb, text);

  const rm = h('button', `absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 transition hover:bg-red-600 hover:text-white hover:ring-red-600 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 ${FOCUS}`);
  rm.setAttribute('aria-label', 'Remove from playlist');
  rm.title = 'Remove from playlist';
  rm.append(icon(TRASH_ICON));
  rm.addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Remove video?',
      body: `"${v.title}" leaves "${p.name}".`,
      confirm: 'Remove',
    });
    if (!ok) return;
    p.videos = p.videos.filter(x => x.id !== v.id);
    dirty = true;
    void render();
  });

  return h('li', 'vid relative', a, rm);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.playlists) {
    void render();
    return;
  }
  // Progress is written every few seconds while a video plays: repaint the thumbnails, not the popup.
  if (changes.progress && openId) {
    void getProgress().then(p => {
      for (const [id, thumb] of progressThumbs) paintProgress(thumb, p[id]);
    });
  }
});

void render();