/**
 * `LogView` — a read-only, line-numbered, searchable text viewer on the same
 * CodeMirror stack as the file editor, so logs (and any long output) read like
 * a file: a line-number gutter, the editor's mono font + theme, and the exact
 * same find panel (⌘F / the imperative `openSearch`). Non-editable but
 * selectable; when `follow` is set, new content scrolls the view to the bottom.
 */
import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { buildSharedExtensions } from "../lib/extensions";
import { useEditorThemeExt } from "../lib/useEditorThemeExt";

export type LogViewHandle = {
  /** Open the CodeMirror find panel (same as ⌘F in the editor). */
  openSearch: () => void;
  /** Scroll the viewport to the last line. */
  scrollToBottom: () => void;
};

type Props = {
  text: string;
  /** Auto-scroll to the bottom whenever `text` changes (live tail). */
  follow?: boolean;
  /** Soft-wrap long lines instead of scrolling horizontally. */
  wrap?: boolean;
  className?: string;
};

export const LogView = forwardRef<LogViewHandle, Props>(function LogView(
  { text, follow = false, wrap = false, className },
  ref,
) {
  const themeExt = useEditorThemeExt();
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const didInitialScrollRef = useRef(false);

  const scrollToBottom = () => {
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.length, { y: "end" }),
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: handle methods read only the stable view ref; the handle identity is intentionally stable
  useImperativeHandle(
    ref,
    () => ({
      openSearch: () => {
        const view = cmRef.current?.view;
        if (view) openSearchPanel(view);
      },
      scrollToBottom,
    }),
    [],
  );

  const extensions = useMemo(
    () => [
      ...buildSharedExtensions(),
      // buildSharedExtensions already adds search({ top: true }); include a
      // second identical config only if it were missing. It isn't, so rely on
      // it and keep this list to the read-only concerns.
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      ...(wrap ? [EditorView.lineWrapping] : []),
    ],
    [wrap],
  );

  // Show the newest lines on open (once), then only auto-scroll while
  // following. Off-follow, the view stays where the user left it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToBottom reads only the live view ref; text/follow are the intended triggers
  useEffect(() => {
    if (!text) return;
    if (follow || !didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scrollToBottom();
    }
  }, [text, follow]);

  return (
    <CodeMirror
      ref={cmRef}
      value={text}
      theme={themeExt}
      extensions={extensions}
      height="100%"
      className={className}
      editable={false}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        bracketMatching: false,
        closeBrackets: false,
        autocompletion: false,
        highlightSelectionMatches: false,
        history: false,
        searchKeymap: true,
        defaultKeymap: true,
        drawSelection: true,
      }}
    />
  );
});
