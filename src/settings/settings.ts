import '../styles.css';
import { h } from '../lib/dom';
import { getSkipPrefs, setSkipPrefs, SKIP_OPTIONS } from '../lib/store';
import type { SkipPrefs } from '../lib/types';

const app = document.getElementById('app') as HTMLElement;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';
const HEADER = 'sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur';

let prefs: SkipPrefs;

const logo = (): HTMLImageElement => {
  const img = h('img');
  img.src = 'icons/icon.svg';
  img.width = 24;
  img.height = 24;
  img.alt = '';
  return img;
};

/** One row = one SponsorBlock toggle. `countdown` is the only non-category id. */
function switchRow(o: { id: string; label: string }): HTMLElement {
  const countdown = o.id === 'countdown';
  const on = countdown ? prefs.countdown : prefs.categories[o.id] !== false;
  const knob = h('span', `absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`);
  const toggle = h('button', `relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-700'} ${FOCUS}`, knob);
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(on));
  toggle.setAttribute('aria-label', o.label);
  toggle.addEventListener('click', async () => {
    const next: SkipPrefs = countdown
      ? { ...prefs, countdown: !on }
      : { ...prefs, categories: { ...prefs.categories, [o.id]: !on } };
    await setSkipPrefs(next);
    prefs = next;
    render();
  });
  return h('div', 'flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800',
    h('span', 'text-sm', o.label), toggle);
}

function render(): void {
  app.replaceChildren(
    h('header', HEADER, logo(), h('span', 'font-semibold', 'TubeList settings')),
    h('section', 'p-2',
      h('h2', 'px-2 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400', 'SponsorBlock'),
      ...SKIP_OPTIONS.map(switchRow),
      h('p', 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
        'Segments come from the community SponsorBlock database (sponsor.ajay.app); video IDs are sent only as a 4-character hash prefix. Ads are unaffected.'),
    ),
  );
}

void getSkipPrefs().then(p => {
  prefs = p;
  render();
});
