/**
 * Mount a side-by-side `MergeView` — the shape VS Code shows a diff in.
 *
 * `@uiw/react-codemirror` wraps a single `EditorView`, but a `MergeView` builds
 * its own DOM containing two of them. So this bypasses that wrapper: the caller
 * supplies a host element and the view is attached to it directly.
 *
 * What the two-column form buys over `unifiedMergeView`:
 *
 * - **Line numbers on both sides.** In the unified view the document IS the new
 *   version and deleted lines hang beside it as block widgets, which is why
 *   they have no number at all.
 * - The library keeps the columns aligned with spacer widgets — the hatched
 *   gaps in VS Code — and scrolls them together, because the outer container
 *   scrolls while the inner editors do not.
 */

import { foldGutter } from "@codemirror/language";
import { MergeView } from "@codemirror/merge";
import { searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { type RefObject, useEffect, useRef } from "react";
import { languageCompartment } from "./extensions";
import { ignoreWhitespaceDiff } from "./ignoreWhitespaceDiff";
import { resolveLanguage } from "./languageResolver";

export type MergeViewInput = {
  /** Left column — the previous version. */
  original: string;
  /** Right column — the new version. */
  modified: string;
  /** Extensions shared by both editors (theme, read-only, gutters…). */
  extensions: Extension[];
  /** Language extension resolved synchronously, if it was available. */
  language: Extension;
  /** File path, used to resolve the language asynchronously when it was not. */
  path: string;
  /** Skip mounting entirely (loading, error, fallback view). */
  enabled: boolean;
};

/**
 * Build and tear down the view. Returns the host ref to attach to a `div`.
 *
 * Tearing down matters: without `destroy()` every tab switch would leave two
 * editors behind, and this component is remounted on every source change.
 */
export function useMergeView(input: MergeViewInput): RefObject<HTMLDivElement | null> {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MergeView | null>(null);
  const { original, modified, extensions, language, path, enabled } = input;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;

    // Extensions are declarative, so both editors can share the same list —
    // each state instantiates its own compartment from it.
    //
    // `lineNumbers` and `foldGutter` are listed explicitly because they used to
    // arrive via `basicSetup` from the React wrapper, which a MergeView does not
    // use. Both columns get their own gutter, which is the point of the
    // two-column layout: in the unified view deleted lines had no number at all.
    const side: Extension[] = [
      lineNumbers(),
      foldGutter(),
      keymap.of(searchKeymap),
      ...extensions,
      languageCompartment.of(language),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    const view = new MergeView({
      a: { doc: original, extensions: side },
      b: { doc: modified, extensions: side },
      parent: host,
      // Read-only: no per-chunk revert arrows. Accepting a change is a decision
      // made in the toolbar, not by nudging a diff.
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
      diffConfig: { override: ignoreWhitespaceDiff },
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [original, modified, extensions, language, enabled]);

  // The language may only be known after an async import; reconfigure both
  // editors in place rather than rebuilding the whole view.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void resolveLanguage(path).then((res) => {
      if (cancelled) return;
      const view = viewRef.current;
      if (!view) return;
      const effects = languageCompartment.reconfigure(res?.ext ?? []);
      view.a.dispatch({ effects });
      view.b.dispatch({ effects });
    });
    return () => {
      cancelled = true;
    };
  }, [path, enabled]);

  return hostRef;
}
