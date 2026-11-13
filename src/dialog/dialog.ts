import '../styles.css';
import { h } from '../lib/dom';
import { classifyUrl } from '../lib/url';
import { fetchVideo, fetchPlaylistIds, fetchQueueIds, fetchVideos } from '../lib/innertube';
import { cleanName, findBySourceId, savePlaylist } from '../lib/store';
import type { PlaylistKind, Video } from '../lib/types';

const STATUS_CLASS = 'mt-3 min-h-5 text-sm';

const heading = document.getElementById('heading') as HTMLElement;
const infoEl = document.getElementById('info') as HTMLElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLElement;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement;

const link = classifyUrl(new URLSearchParams(location.search).get('url') ?? '');

let kind: PlaylistKind = 'custom';
let sourceId: string | null = null;
let videos: Omit<Video, 'addedAt'>[] = [];
let videoIds: string[] = [];
let defaultName = '';

function setStatus(text: string, variant: 'error' | 'success' | null = null): void {
  statusEl.className = STATUS_CLASS + (variant === 'error' ? ' text-red-600 dark:text-red-400' : variant === 'success' ? ' text-emerald-600' : '');
  statusEl.replaceChildren(text);
}

function showError(message: string): void {
  setStatus(message, 'error');
  saveBtn.disabled = true;
}

function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.includes('HTTP 400') ? 'Playlist not found or private' : text;
}

async function init(): Promise<void> {
  cancelBtn.addEventListener('click', () => window.close());
  saveBtn.addEventListener('click', () => void save());
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !saveBtn.disabled) void save();
  });

  if (link.type === 'invalid') return showError('Not a YouTube video, playlist or queue link.');

  statusEl.replaceChildren(h('span', 'inline-block size-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent align-[-2px] mr-2'), 'Loading…');

  try {
    if (link.type === 'video') {
      const v = await fetchVideo(link.videoId);
      if (!v) return showError('Video unavailable');
      heading.textContent = 'New playlist from video';
      infoEl.textContent = v.title;
      defaultName = v.title;
      videos = [v];
      kind = 'custom';
      sourceId = null;
    } else if (link.type === 'playlist') {
      const { title, ids } = await fetchPlaylistIds(link.listId);
      heading.textContent = 'Save YouTube playlist';
      infoEl.textContent = `${ids.length} videos`;
      defaultName = title ?? 'YouTube playlist';
      kind = 'youtube';
      sourceId = link.listId;
      videoIds = ids;
    } else {
      videoIds = await fetchQueueIds(link);
      heading.textContent = 'Save queue';
      infoEl.textContent = `${videoIds.length} videos`;
      defaultName = 'Queue ' + new Date().toLocaleString();
      kind = 'queue';
      sourceId = link.listId;
    }

    if (kind !== 'custom' && videoIds.length === 0) return showError('No videos found in this link.');

    if (sourceId) {
      const existing = await findBySourceId(sourceId);
      if (existing) {
        infoEl.textContent += ` — already saved as "${existing.name}", saving will update it.`;
        defaultName = existing.name;
      }
    }

    nameInput.value = defaultName;
    setStatus('', null);
    saveBtn.disabled = false;
    nameInput.focus();
  } catch (err) {
    showError(message(err));
  }
}

async function save(): Promise<void> {
  saveBtn.disabled = true;
  nameInput.disabled = true;

  try {
    const collected: Video[] =
      kind === 'custom'
        ? videos.map(v => ({ ...v, addedAt: Date.now() }))
        : await fetchVideos(videoIds, (done, total) => setStatus(`Fetching details ${done}/${total}…`));

    if (collected.length === 0) {
      setStatus('None of the videos are available.', 'error');
      nameInput.disabled = false;
      saveBtn.disabled = false;
      return;
    }

    await savePlaylist({ name: cleanName(nameInput.value, defaultName), kind, sourceId, videos: collected });
    setStatus(`Saved ${collected.length} videos ✓`, 'success');
    setTimeout(() => window.close(), 800);
  } catch (err) {
    setStatus(message(err), 'error');
    nameInput.disabled = false;
    saveBtn.disabled = false;
  }
}

void init();