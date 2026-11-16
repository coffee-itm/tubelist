export const TRASH_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4v3h-4zM6.5 7l1 13h9l1-13M10.5 11v6M13.5 11v6"/></svg>';

export const CHEVRON_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export const GEAR_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

/**
 * Parses icon markup into a node. Assigning this constant to `innerHTML` trips AMO's
 * UNSAFE_VAR_ASSIGNMENT warning — the rule cannot tell a constant from user input — so the markup is
 * parsed instead. Every icon string here is a literal defined in this file, never page or user data.
 * Parsed as HTML, not as `image/svg+xml`: the literals carry no `xmlns`, and XML parsing would leave
 * the element in no namespace, where it renders as nothing at all.
 */
export function icon(markup: string): SVGElement {
  const el = new DOMParser().parseFromString(markup, 'text/html').body.firstElementChild;
  return document.importNode(el!, true) as unknown as SVGElement;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const c of children) if (c) el.append(c); // strings become text nodes, so this is XSS-safe
  return el;
}