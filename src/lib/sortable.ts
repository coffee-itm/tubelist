const DRAGGING = 'opacity-50';
const HINT = 'Drag, or Alt+↑/↓, to reorder';

/**
 * Makes `rows` reorderable inside `container` by drag and drop, or Alt+↑/↓ from any focused child.
 * `rows` is kept in the new order, the DOM is rebuilt from it, and `move(from, to)` persists the change.
 * Drops only show a line: the row itself moves on drop, so a cancelled drag leaves the list untouched.
 */
export function sortable(container: HTMLElement, rows: HTMLElement[], move: (from: number, to: number) => void): void {
  let dragged: HTMLElement | null = null;
  let from = -1;
  let dropRow: HTMLElement | null = null;
  let dropAfter = false;

  const mark = (row: HTMLElement | null, after: boolean): void => {
    if (dropRow && dropRow !== row) dropRow.style.boxShadow = '';
    dropRow = row;
    if (row) row.style.boxShadow = `inset 0 ${after ? '-2px 0' : '2px 0'} #ef4444`;
  };

  const clear = (): void => {
    mark(null, false);
    dragged?.classList.remove(DRAGGING);
    dragged = null;
  };

  const apply = (i: number, j: number): void => {
    if (i === j || j < 0 || j >= rows.length) return;
    rows.splice(j, 0, ...rows.splice(i, 1));
    container.append(...rows);
    move(i, j);
  };

  const target = (e: Event): HTMLElement | null => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-sortable]');
    return el && el !== dragged && container.contains(el) ? el : null;
  };

  for (const row of rows) {
    row.draggable = true;
    row.dataset.sortable = '';
    row.title ||= HINT;
    row.addEventListener('dragstart', e => {
      dragged = row;
      from = rows.indexOf(row);
      row.classList.add(DRAGGING);
      e.dataTransfer?.setData('text/plain', ''); // Firefox refuses a drag with no data
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', clear);
    row.addEventListener('keydown', e => {
      const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!delta || !e.altKey) return;
      e.preventDefault();
      const i = rows.indexOf(row);
      apply(i, i + delta);
    });
  }

  container.addEventListener('dragover', e => {
    const over = target(e);
    if (!dragged || !over) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const r = over.getBoundingClientRect();
    dropAfter = e.clientY > r.top + r.height / 2;
    mark(over, dropAfter);
  });
  container.addEventListener('dragleave', e => {
    const next = e.relatedTarget;
    if (!(next instanceof Node) || !container.contains(next)) mark(null, false);
  });
  container.addEventListener('drop', e => {
    if (!dragged || !dropRow) return;
    e.preventDefault();
    const boundary = rows.indexOf(dropRow) + (dropAfter ? 1 : 0);
    const to = boundary > from ? boundary - 1 : boundary;
    clear();
    apply(from, to);
  });
}