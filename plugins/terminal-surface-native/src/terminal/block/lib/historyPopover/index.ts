/**
 * Shell-history popover extension: opens the history list from the first line,
 * arrow-key navigation, live refilter as the query changes, and accept/dismiss
 * bindings. The list state and tooltip rendering live in `./state`.
 */

import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { acceptIndex, close, dispatch, historyField } from "./state";

export { historyOpen } from "./state";

type Fetcher = (query: string, limit: number) => Promise<string[]>;

const LIMIT = 200;
const REFILTER_MS = 60;

export function historyPopover(fetch: Fetcher) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const open = (view: EditorView) => {
    const query = view.state.doc.toString();
    void fetch(query, LIMIT).then((items) => {
      if (items.length) dispatch(view, { open: true, items, index: 0 });
    });
  };

  const refilter = (view: EditorView) => {
    if (timer) clearTimeout(timer);
    const query = view.state.doc.toString();
    timer = setTimeout(() => {
      void fetch(query, LIMIT).then((items) => {
        if (view.state.field(historyField, false)?.open) {
          dispatch(view, { open: true, items, index: 0 });
        }
      });
    }, REFILTER_MS);
  };

  const upOrOpen = (view: EditorView): boolean => {
    const h = view.state.field(historyField, false);
    if (h?.open) {
      if (h.index > 0) dispatch(view, { ...h, index: h.index - 1 });
      return true;
    }
    const head = view.state.selection.main.head;
    if (view.state.doc.lineAt(head).number !== 1) return false;
    open(view);
    return true;
  };

  const downOrClose = (view: EditorView): boolean => {
    const h = view.state.field(historyField, false);
    if (!h?.open) return false;
    if (h.index >= h.items.length - 1) close(view);
    else dispatch(view, { ...h, index: h.index + 1 });
    return true;
  };

  const accept = (view: EditorView): boolean => {
    const h = view.state.field(historyField, false);
    if (!h?.open) return false;
    acceptIndex(view, h.index);
    return true;
  };

  const dismiss = (view: EditorView): boolean => {
    if (!view.state.field(historyField, false)?.open) return false;
    close(view);
    return true;
  };

  return [
    historyField,
    Prec.highest(
      keymap.of([
        { key: "ArrowUp", run: upOrOpen },
        { key: "ArrowDown", run: downOrClose },
        { key: "Enter", run: accept },
        { key: "Escape", run: dismiss },
      ]),
    ),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      if (u.state.field(historyField, false)?.open) refilter(u.view);
    }),
  ];
}
