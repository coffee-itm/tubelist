// @vitest-environment jsdom
// tests/setup.ts stands in for jsdom's missing <dialog> implementation (showModal/close/returnValue
// and the `method="dialog"` submit), so these run the real dialog.ts against it.
import { askConfirm, askText } from '../src/lib/dialog';

const dialogs = (): HTMLDialogElement[] => [...document.querySelectorAll('dialog')];
const buttonIn = (dlg: HTMLDialogElement, label: string): HTMLButtonElement =>
  [...dlg.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement;
const submitIn = (dlg: HTMLDialogElement, label: string): void => {
  (dlg.querySelector('form') as HTMLFormElement).requestSubmit(buttonIn(dlg, label));
};

it('resolves true when the confirm button is used', async () => {
  const answer = askConfirm({ title: 'Delete playlist?', body: 'Gone for good.', confirm: 'Delete' });
  const [dlg] = dialogs();
  buttonIn(dlg, 'Delete').click();
  await expect(answer).resolves.toBe(true);
  expect(dialogs()).toHaveLength(0); // closed dialogs are removed, not left on the page
});

it('resolves false on Cancel', async () => {
  const answer = askConfirm({ title: 'Delete playlist?', body: 'Gone for good.', confirm: 'Delete' });
  buttonIn(dialogs()[0], 'Cancel').click();
  await expect(answer).resolves.toBe(false);
  expect(dialogs()).toHaveLength(0);
});

it('keeps a nameless playlist uncreatable and trims the name it does return', async () => {
  const answer = askText({ title: 'New playlist', label: 'Name', confirm: 'Create' });
  const [dlg] = dialogs();
  const field = dlg.querySelector('input') as HTMLInputElement;
  const create = buttonIn(dlg, 'Create');
  expect(create.disabled).toBe(true);

  field.value = '   ';
  field.dispatchEvent(new Event('input'));
  expect(create.disabled).toBe(true); // whitespace is not a name

  field.value = '  My list  ';
  field.dispatchEvent(new Event('input'));
  expect(create.disabled).toBe(false);
  submitIn(dlg, 'Create');
  await expect(answer).resolves.toBe('My list');
});

it('answers each of two dialogs that are open at once with its own field', async () => {
  const first = askText({ title: 'First', label: 'Name', confirm: 'Create' });
  const second = askText({ title: 'Second', label: 'Name', confirm: 'Create' });
  const [a, b] = dialogs();
  for (const [dlg, value] of [[a, 'one'], [b, 'two']] as [HTMLDialogElement, string][]) {
    const field = dlg.querySelector('input') as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }
  submitIn(b, 'Create');
  submitIn(a, 'Create');
  await expect(second).resolves.toBe('two');
  await expect(first).resolves.toBe('one');
});
