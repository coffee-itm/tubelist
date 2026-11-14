import { h } from '../lib/dom';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2';
const CARD = `m-auto w-[21rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[1px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${FOCUS}`;
const FIELD = 'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-500 hover:border-zinc-400 focus:ring-2 focus:ring-red-500 dark:border-zinc-700 dark:placeholder:text-zinc-400';
const CANCEL = `rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 ${FOCUS}`;
const SUBMIT = `rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800 disabled:opacity-50 ${FOCUS}`;

interface Draft {
  title: string;
  body?: string;
  label?: string; // present → ask for text
  confirm: string;
}

/**
 * A native <dialog>, so Esc, focus containment, scroll locking and the top layer come from the
 * platform rather than from hand-rolled key handling. Resolves the field text ('' when there is
 * none) or null when the user cancelled.
 */
function open(draft: Draft): Promise<string | null> {
  const { promise, resolve } = Promise.withResolvers<string | null>();
  const dlg = h('dialog', CARD);
  const form = h('form', 'space-y-3');
  form.method = 'dialog';
  form.noValidate = true;

  const submit = h('button', SUBMIT, draft.confirm);
  submit.value = 'ok'; // form method="dialog" copies this into returnValue

  const cancel = h('button', CANCEL, 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => dlg.close('cancel'));

  form.append(h('h2', 'text-sm font-semibold', draft.title));
  if (draft.body) form.append(h('p', 'text-xs leading-relaxed text-zinc-500 dark:text-zinc-400', draft.body));

  const field = draft.label ? h('input', FIELD) : null;
  if (field && draft.label) {
    field.id = 'tl-dialog-input';
    field.autocomplete = 'off';
    const label = h('label', 'block space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300', draft.label, field);
    label.htmlFor = field.id;
    submit.disabled = true; // empty name is not a name
    field.addEventListener('input', () => { submit.disabled = !field.value.trim(); });
    form.append(label);
  }

  form.append(h('div', 'flex justify-end gap-2 pt-1', cancel, submit));
  dlg.append(form);

  dlg.addEventListener('close', () => {
    dlg.remove();
    resolve(dlg.returnValue === 'ok' ? (field?.value.trim() ?? '') : null);
  });

  document.body.append(dlg);
  dlg.showModal();
  (field ?? cancel).focus(); // Cancel takes focus when nothing is typed, so Enter stays safe
  field?.select();
  return promise;
}

export const askText = (draft: { title: string; label: string; confirm: string; body?: string }) => open(draft);

export const askConfirm = (draft: { title: string; body: string; confirm: string }): Promise<boolean> =>
  open(draft).then(value => value !== null);