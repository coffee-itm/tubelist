import '../styles.css';
import { h } from '../lib/dom';
import { getPlayerPrefs, getSkipPrefs, setPlayerPrefs, setSkipPrefs, SKIP_OPTIONS } from '../lib/store';
import { backup, clearAll, restore } from '../lib/backup';
import { askConfirm } from '../lib/dialog';
import type { PlayerPrefs, SkipPrefs } from '../lib/types';

const app = document.getElementById('app') as HTMLElement;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';
const HEADER = 'sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur';
const H2 = 'px-2 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const NOTE = 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400';
const ON = 'bg-green-500';
const OFF = 'bg-zinc-300 dark:bg-zinc-700';
const BTN = `rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 ${FOCUS}`;
const DANGER = `rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 ${FOCUS}`;

let skip: SkipPrefs;
let player: PlayerPrefs;
let status = '';
let statusEl: HTMLElement;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Writes the line in place: a full re-render here would drop the focus the user is standing on. */
function setStatus(text: string): void {
  status = text;
  statusEl.textContent = text;
  statusEl.classList.toggle('hidden', text === '');
}

/** A blob URL on a throwaway anchor. Revoked a task later: the click's action must be dispatched first. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a');
  a.href = url;
  a.download = name;
  document.body.append(a); // Firefox ignores a click on a detached anchor
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** After an import or a clear the switches have to show the stored values again, not the old ones. */
async function refresh(): Promise<void> {
  [skip, player] = await Promise.all([getSkipPrefs(), getPlayerPrefs()]);
  render();
}

const logo = (): HTMLImageElement => {
  const img = h('img');
  img.src = 'icons/icon.svg';
  img.width = 24;
  img.height = 24;
  img.alt = '';
  return img;
};

/**
 * One switch row. `isOn` is read on every click, so a fast second click never reuses a stale value;
 * the row repaints in place, because re-rendering the page would drop the focus the user just used.
 */
function switchRow(label: string, isOn: () => boolean, onChange: (next: boolean) => Promise<void>): HTMLElement {
  const on = isOn();
  const knob = h('span', `absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`);
  const toggle = h('button', `relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? ON : OFF} ${FOCUS}`, knob);
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  const paint = (v: boolean): void => {
    toggle.setAttribute('aria-checked', String(v));
    toggle.classList.toggle(ON, v);
    toggle.classList.toggle('bg-zinc-300', !v);
    toggle.classList.toggle('dark:bg-zinc-700', !v);
    knob.classList.toggle('translate-x-5', v);
  };
  paint(on);
  toggle.setAttribute('aria-label', label);
  toggle.addEventListener('click', async () => {
    const next = !isOn();
    paint(next);
    await onChange(next);
    paint(isOn());
  });
  return h('div', 'flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800',
    h('span', 'text-sm', label), toggle);
}

function render(): void {
  statusEl = h('p', `px-2 pb-1 text-xs text-zinc-500 dark:text-zinc-400 ${status ? '' : 'hidden'}`, status);
  statusEl.setAttribute('role', 'status'); // a live region: the result of an import lands here, off-focus
  app.replaceChildren(
    h('header', HEADER, logo(), h('span', 'font-semibold', 'TubeList settings')),
    h('section', 'p-2',
      h('h2', H2, 'SponsorBlock'),
      ...SKIP_OPTIONS.map(o =>
        switchRow(
          o.label,
          () => (o.id === 'countdown' ? skip.countdown : skip.categories[o.id] !== false),
          async next => {
            skip = o.id === 'countdown'
              ? { ...skip, countdown: next }
              : { ...skip, categories: { ...skip.categories, [o.id]: next } };
            await setSkipPrefs(skip);
          },
        ),
      ),
      h('p', NOTE,
        'Segments come from the community SponsorBlock database (sponsor.ajay.app); video IDs are sent only as a 4-character hash prefix. Ads are unaffected.'),
    ),
    h('section', 'p-2',
      h('h2', H2, 'Player'),
      switchRow('Show video description', () => player.description, async next => {
        player = { ...player, description: next };
        await setPlayerPrefs(player);
      }),
      switchRow('Sync with logged YouTube account', () => player.sync, async next => {
        player = { ...player, sync: next };
        await setPlayerPrefs(player);
      }),
      h('p', NOTE,
        'On, the player frames the signed-in youtube.com/watch page: YouTube records watch history and the resume position. Off (default), it uses the embed player, which records neither. Playlists, local progress bars and SponsorBlock skipping work either way.'),
    ),
    h('section', 'p-2',
      h('h2', H2, 'Data'),
      dataRows(),
      statusEl,
      h('p', NOTE,
        'A backup is one JSON file with your playlists, videos, watch progress and settings. Import replaces the stored data with the file\'s; it is not a merge.'),
    ),
  );
}

function dataRows(): HTMLElement {
  const exportBtn = h('button', BTN, 'Export');
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', async () => {
    try {
      download(`tubelist-${new Date().toISOString().slice(0, 10)}.json`, await backup());
      setStatus('Backup downloaded.');
    } catch (e) {
      setStatus(`Export failed: ${message(e)}`);
    }
  });

  const file = h('input', 'hidden');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.addEventListener('change', () => {
    const picked = file.files?.[0];
    if (!picked) return;
    void picked.text().then(async text => {
      try {
        const playlists = await restore(text);
        const videos = playlists.reduce((n, p) => n + p.videos.length, 0);
        setStatus(`Imported ${playlists.length} playlist${playlists.length === 1 ? '' : 's'} with ${videos} video${videos === 1 ? '' : 's'}.`);
      } catch (e) {
        setStatus(`Import failed: ${message(e)}`);
      }
      file.value = ''; // the same file twice in a row is still a change
      await refresh(); // the switches and the status line still hold the pre-import values otherwise
    });
  });

  const importBtn = h('button', BTN, 'Import');
  importBtn.type = 'button';
  importBtn.addEventListener('click', () => file.click());

  const clearBtn = h('button', DANGER, 'Clear all data');
  clearBtn.type = 'button';
  clearBtn.addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Clear all data?',
      body: 'Deletes every playlist, video, watch progress and setting TubeList stores on this device. It cannot be undone, so export a backup first if you may want any of it back.',
      confirm: 'Clear data',
    });
    if (!ok) return;
    await clearAll();
    setStatus('All TubeList data cleared.');
    await refresh();
  });

  return h('div', 'flex flex-wrap items-center gap-2 px-2 py-1', exportBtn, importBtn, clearBtn, file);
}

void Promise.all([getSkipPrefs(), getPlayerPrefs()]).then(([s, p]) => {
  skip = s;
  player = p;
  render();
});