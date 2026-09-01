import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionStatus,
  moveCompletionSelection,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewline,
} from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  keymap,
  placeholder,
  rectangularSelection,
  tooltips,
} from "@codemirror/view";
import { completionIcon } from "../completionIcons";
import { historyPopover } from "../historyPopover";
import { inlineSuggestion } from "../inlineSuggest";
import { makeCompletionSource } from "./completionSource";
import { baseTheme, highlightStyle } from "./theme";

const shellLanguage = StreamLanguage.define(shell);

export type ShellEditorOptions = {
  parent: HTMLElement;
  fontFamily: string;
  fontSize: number;
  placeholderText?: string;
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  /** Escape with no completion open; return true when handled. */
  onEscape?: () => boolean;
  /** Live command-name list (history first-words + PATH) for completion. */
  commandNames?: () => string[];
  /** Fish-style full-command autosuggestion for the current input line. */
  suggest?: (line: string) => Promise<string | null>;
  /** Recency-ranked history for the ArrowUp popover (Ctrl-R style). */
  historyList?: (query: string, limit: number) => Promise<string[]>;
  /** Live cwd of the terminal, for path completion in argument position. */
  getCwd?: () => string | null;
  /** Fires on every edit with the current text (used to gate empty-state UI). */
  onChange?: (text: string) => void;
};

export type ShellEditorHandle = {
  readonly view: EditorView;
  focus(): void;
  getValue(): string;
  setValue(text: string): void;
  clear(): void;
  setEditable(editable: boolean): void;
  retheme(fontFamily: string, fontSize: number): void;
  destroy(): void;
};

// Arrow keys drive the completion popup when it is open; each command returns
// false when no completion is active, so the keys fall through (e.g. to the
// history popover / cursor movement).
const completionNav = Prec.highest(
  keymap.of([
    { key: "ArrowDown", run: moveCompletionSelection(true) },
    { key: "ArrowUp", run: moveCompletionSelection(false) },
    { key: "Escape", run: closeCompletion },
  ]),
);

export function createShellEditor(opts: ShellEditorOptions): ShellEditorHandle {
  const themeComp = new Compartment();
  const highlightComp = new Compartment();
  const editableComp = new Compartment();

  const clear = (view: EditorView) =>
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "" },
    });

  const submitKeys = Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          // Enter always runs the line (Tab is accept). Predictable shell UX.
          const text = view.state.doc.toString();
          if (!text.trim()) return true;
          opts.onSubmit(text);
          clear(view);
          return true;
        },
      },
      { key: "Shift-Enter", run: insertNewline },
      {
        key: "Tab",
        run: (view) =>
          completionStatus(view.state) === "active"
            ? acceptCompletion(view)
            : startCompletion(view),
      },
      {
        key: "Ctrl-c",
        run: (view) => {
          opts.onInterrupt();
          clear(view);
          return true;
        },
        preventDefault: true,
      },
    ]),
  );

  const state = EditorState.create({
    doc: "",
    extensions: [
      history(),
      drawSelection({ cursorBlinkRate: 1100 }),
      rectangularSelection(),
      crosshairCursor(),
      EditorState.allowMultipleSelections.of(true),
      EditorView.lineWrapping,
      tooltips({ parent: document.body }),
      shellLanguage,
      highlightComp.of(syntaxHighlighting(highlightStyle())),
      autocompletion({
        override: [
          makeCompletionSource(
            opts.commandNames ?? (() => []),
            opts.getCwd ?? (() => null),
          ),
        ],
        icons: false,
        defaultKeymap: false,
        addToOptions: [{ render: (c) => completionIcon(c.type), position: 20 }],
      }),
      completionNav,
      ...(opts.suggest ? inlineSuggestion(opts.suggest) : []),
      ...(opts.historyList ? historyPopover(opts.historyList) : []),
      placeholder(opts.placeholderText ?? "Run a command"),
      ...(opts.onChange
        ? [
            EditorView.updateListener.of((u) => {
              if (u.docChanged) opts.onChange?.(u.state.doc.toString());
            }),
          ]
        : []),
      submitKeys,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      ...(opts.onEscape
        ? [
            Prec.lowest(
              keymap.of([
                { key: "Escape", run: () => opts.onEscape?.() ?? false },
              ]),
            ),
          ]
        : []),
      editableComp.of(EditorView.editable.of(true)),
      themeComp.of(baseTheme(opts.fontFamily, opts.fontSize)),
    ],
  });

  const view = new EditorView({ state, parent: opts.parent });

  return {
    view,
    focus: () => view.focus(),
    getValue: () => view.state.doc.toString(),
    setValue: (text) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
      }),
    clear: () => clear(view),
    setEditable: (editable) =>
      view.dispatch({
        effects: editableComp.reconfigure(EditorView.editable.of(editable)),
      }),
    retheme: (fontFamily, fontSize) =>
      view.dispatch({
        effects: [
          themeComp.reconfigure(baseTheme(fontFamily, fontSize)),
          highlightComp.reconfigure(syntaxHighlighting(highlightStyle())),
        ],
      }),
    destroy: () => view.destroy(),
  };
}
