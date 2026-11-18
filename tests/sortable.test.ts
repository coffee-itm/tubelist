// @vitest-environment jsdom
// The reorder path in the popup and the player: a wrong drop index silently corrupts the saved order.
import { sortable } from '../src/lib/sortable';

const order = (rows: HTMLElement[]): string => rows.map(r => r.textContent!).join(',');

function build(names: string[]): { ul: HTMLElement; rows: HTMLElement[]; calls: [number, number][] } {
  document.body.innerHTML = '';
  const ul = document.createElement('ul');
  const rows = names.map(n => {
    const li = document.createElement('li');
    li.textContent = n;
    return li;
  });
  ul.append(...rows);
  document.body.append(ul);
  const calls: [number, number][] = [];
  sortable(ul, rows, (from, to) => calls.push([from, to]));
  // jsdom has no layout: 10 px rows, so a clientY picks the half of the row it is dropped on.
  for (const [i, row] of rows.entries()) {
    row.getBoundingClientRect = () => ({ top: i * 10, height: 10, bottom: i * 10 + 10, toJSON: () => ({}) }) as DOMRect;
  }
  return { ul, rows, calls };
}

const dragEvent = (type: string, over: EventTarget, clientY?: number): void => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { dataTransfer: { setData: () => {}, effectAllowed: '', dropEffect: '' }, clientY });
  over.dispatchEvent(e);
};

const altKey = (row: HTMLElement, key: string, alt = true): void => {
  row.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: alt, bubbles: true, cancelable: true }));
};

it('drops a row above or below the row it is dropped on', () => {
  const above = build(['a', 'b', 'c', 'd']);
  dragEvent('dragstart', above.rows[0]);
  dragEvent('dragover', above.rows[3], 32); // upper half of d: a lands before it
  dragEvent('drop', above.ul);
  expect(order(above.rows)).toBe('b,c,a,d');

  const below = build(['a', 'b', 'c', 'd']);
  dragEvent('dragstart', below.rows[0]);
  dragEvent('dragover', below.rows[3], 38); // lower half of d: a lands after it
  dragEvent('drop', below.ul);
  expect(order(below.rows)).toBe('b,c,d,a');
});

it('reorders with Alt+↑/↓ from a focused row, and nowhere else', () => {
  const { rows, calls } = build(['a', 'b', 'c']);
  altKey(rows[0], 'ArrowDown');
  expect(order(rows)).toBe('b,a,c');
  altKey(rows[1], 'ArrowUp');
  expect(order(rows)).toBe('a,b,c');
  expect(calls).toEqual([[0, 1], [1, 0]]);

  altKey(rows[0], 'ArrowUp'); // the first row has nowhere to go
  altKey(rows[0], 'ArrowDown', false); // plain arrows scroll the list, they do not reorder it
  expect(order(rows)).toBe('a,b,c');
  expect(calls).toEqual([[0, 1], [1, 0]]);
});

it('leaves the order alone when the drag ends outside a row', () => {
  const { ul, rows, calls } = build(['a', 'b']);
  dragEvent('dragstart', rows[0]);
  dragEvent('drop', ul); // no dragover: no row was targeted
  dragEvent('dragend', rows[0]); // the browser ends every drag this way, cancelled ones included
  expect(order(rows)).toBe('a,b');
  expect(calls).toEqual([]);
  expect(rows[0].className).not.toContain('opacity-50');
});
