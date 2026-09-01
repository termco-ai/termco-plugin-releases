/**
 * Native-selection helpers — the replacement for xterm's synthetic
 * `getSelection()/hasSelection()/clearSelection()`. wterm renders real
 * DOM text, so the browser selection is the source of truth; these
 * helpers scope it to one terminal's element.
 */

function selectionIntersects(el: HTMLElement): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i);
    if (el.contains(range.commonAncestorContainer)) return sel;
  }
  return null;
}

/** Selected text within the terminal element, or null when none. */
export function engineSelectionText(el: HTMLElement): string | null {
  const sel = selectionIntersects(el);
  if (!sel) return null;
  const text = sel.toString();
  return text.length > 0 ? text : null;
}

export function engineHasSelection(el: HTMLElement): boolean {
  return selectionIntersects(el) !== null;
}

export function clearEngineSelection(el: HTMLElement): void {
  if (selectionIntersects(el)) window.getSelection()?.removeAllRanges();
}
