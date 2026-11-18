import '../styles.css';
import { h } from '../lib/dom';
import { getPlayerPrefs, getSkipPrefs, setPlayerPrefs, setSkipPrefs, SKIP_OPTIONS } from '../lib/store';
import type { PlayerPrefs, SkipPrefs } from '../lib/types';

const app = document.getElementById('app') as HTMLElement;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';
const HEADER = 'sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur';
const H2 = 'px-2 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const NOTE = 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400';
const ON = 'bg-green-500';
const OFF = 'bg-zinc-300 dark:bg-zinc-700';

let skip: SkipPrefs;
let player: PlayerPrefs;

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
  );
}

void Promise.all([getSkipPrefs(), getPlayerPrefs()]).then(([s, p]) => {
  skip = s;
  player = p;
  render();
});