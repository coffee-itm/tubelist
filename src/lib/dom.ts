export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const c of children) if (c) el.append(c); // strings become text nodes, so this is XSS-safe
  return el;
}