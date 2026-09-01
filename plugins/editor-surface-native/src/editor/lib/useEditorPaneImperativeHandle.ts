/**
 * Wires up the imperative handle exposed by `EditorPane` — search, focus,
 * selection, reload, goto-line, and undo/redo — over the underlying CodeMirror
 * view. Keeping it here shrinks the component to its render/effect wiring.
 */
import { redo, undo } from "@codemirror/commands";
import {
  findNext,
  findPrevious,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { type ForwardedRef, type RefObject, useImperativeHandle } from "react";

/** Imperative API exposed by `EditorPane` to its parent via `ref`. */
export type EditorPaneHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
  focus: () => void;
  getSelection: () => string | null;
  getPath: () => string;
  /** Persist the buffer to disk — same as ⌘S / vim `:w`. */
  save: () => Promise<void>;
  /** Re-read the file from disk. Skips silently if the buffer is dirty. */
  reload: () => boolean;
  /** Move the cursor to a 1-based line (and optional 0-based column) and
   * center it, once content is ready. */
  gotoLine: (line: number, character?: number) => void;
  /** Apply CodeMirror's undo/redo commands. */
  undo: () => void;
  redo: () => void;
};

type Params = {
  cmRef: RefObject<ReactCodeMirrorRef | null>;
  path: string;
  applyPendingGoto: () => void;
  saveRef: RefObject<() => Promise<unknown>>;
  reloadRef: RefObject<() => boolean>;
  pendingLineRef: RefObject<{ line: number; character?: number } | null>;
};

/** Attach the {@link EditorPaneHandle} API to the forwarded `ref`. */
export function useEditorPaneImperativeHandle(
  ref: ForwardedRef<EditorPaneHandle>,
  { cmRef, path, applyPendingGoto, saveRef, reloadRef, pendingLineRef }: Params,
) {
  useImperativeHandle(
    ref,
    () => ({
      setQuery: (q: string) => {
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: setSearchQuery.of(
            new SearchQuery({ search: q, caseSensitive: false }),
          ),
        });
        if (q) findNext(view);
      },
      findNext: () => {
        const view = cmRef.current?.view;
        if (view) findNext(view);
      },
      findPrevious: () => {
        const view = cmRef.current?.view;
        if (view) findPrevious(view);
      },
      clearQuery: () => {
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: "" })),
        });
      },
      focus: () => {
        cmRef.current?.view?.focus();
      },
      getSelection: () => {
        const view = cmRef.current?.view;
        if (!view) return null;
        const { from, to } = view.state.selection.main;
        if (from === to) return null;
        return view.state.sliceDoc(from, to);
      },
      getPath: () => path,
      save: async () => {
        await saveRef.current();
      },
      reload: () => reloadRef.current(),
      gotoLine: (line: number, character?: number) => {
        pendingLineRef.current = { line, character };
        applyPendingGoto();
      },
      undo: () => {
        const view = cmRef.current?.view;
        if (view) undo(view);
      },
      redo: () => {
        const view = cmRef.current?.view;
        if (view) redo(view);
      },
    }),
    [path, applyPendingGoto],
  );
}
