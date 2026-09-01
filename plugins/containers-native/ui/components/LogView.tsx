/** Read-only, line-numbered container logs with the same CodeMirror behavior
 * as an editor: native selection, find panel, wrapping, and live-tail scroll. */
import { openSearchPanel, search } from "@codemirror/search";
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

export type LogViewHandle = {
  openSearch(): void;
  scrollToBottom(): void;
};

type Props = {
  text: string;
  follow?: boolean;
  wrap?: boolean;
  className?: string;
};

const logTheme = EditorView.theme({
  "&, &.cm-editor, &.cm-editor.cm-focused": {
    backgroundColor: "transparent !important",
    color: "var(--foreground)",
    height: "100%",
    outline: "none",
  },
  ".cm-scroller": {
    backgroundColor: "transparent !important",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "calc(12px * var(--app-zoom, 1))",
    lineHeight: "1.55",
  },
  ".cm-content": {
    backgroundColor: "transparent !important",
    caretColor: "var(--foreground)",
    padding: "8px 0",
  },
  ".cm-gutters, .cm-gutter": {
    backgroundColor: "transparent !important",
    border: "none",
    color: "var(--muted-foreground)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    opacity: "0.55",
    paddingLeft: "10px",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor:
      "color-mix(in srgb, var(--foreground) 18%, transparent) !important",
  },
  ".cm-panels": {
    backgroundColor: "var(--popover)",
    borderColor: "var(--border)",
    color: "var(--popover-foreground)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--border)",
  },
  ".cm-panel.cm-search": {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    fontSize: "12px",
    gap: "6px",
    padding: "7px 30px 7px 10px",
  },
  ".cm-panel.cm-search .cm-textfield": {
    backgroundColor: "var(--background)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--foreground)",
    fontFamily: "inherit",
    fontSize: "12px",
    margin: "0",
    outline: "none",
    padding: "4px 9px",
  },
  ".cm-panel.cm-search .cm-button": {
    backgroundColor:
      "color-mix(in srgb, var(--foreground) 6%, transparent)",
    backgroundImage: "none",
    border: "1px solid var(--border)",
    borderRadius: "9px",
    color: "var(--foreground)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "12px",
    padding: "4px 10px",
  },
  ".cm-panel.cm-search [name=close]": {
    background: "transparent",
    border: "none",
    color: "var(--muted-foreground)",
    cursor: "pointer",
    fontSize: "16px",
    lineHeight: "1",
    padding: "2px 6px",
    right: "6px",
    top: "0",
  },
});

export const LogView = forwardRef<LogViewHandle, Props>(function LogView(
  { text, follow = false, wrap = false, className },
  ref,
) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const didInitialScrollRef = useRef(false);

  const scrollToBottom = () => {
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.length, { y: "end" }),
    });
  };

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
      search({ top: true }),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      logTheme,
      ...(wrap ? [EditorView.lineWrapping] : []),
    ],
    [wrap],
  );

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
