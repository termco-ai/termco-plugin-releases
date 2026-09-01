/**
 * LSP semantic highlighting: asks the primary server for
 * `textDocument/semanticTokens/full` and layers the result as decorations over
 * the Lezer syntax colors — the ingredient that makes VS Code feel "rich"
 * (parameter ≠ property ≠ type ≠ directive), incl. Angular templates via
 * ngserver. Colors follow VS Code's Dark+/Light+ defaults.
 */
import type { WorkspaceEnv } from "../../../workspace";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { invoke } from "../../../platform";
import { lspActiveEffect, lspSyncOf } from "./docSync";
import { lspToOffset } from "./positions";

const REFRESH_DEBOUNCE_MS = 600;

/** Token types we actually colorize — the rest keeps the theme's base color
 * (comments/strings/keywords are the theme's business, not the server's). */
const COLORED_TYPES = new Set([
  "namespace",
  "type",
  "class",
  "enum",
  "interface",
  "struct",
  "typeParameter",
  "parameter",
  "variable",
  "property",
  "enumMember",
  "function",
  "method",
  "macro",
  "decorator",
  "event",
]);

export type DecodedToken = {
  line: number;
  character: number;
  length: number;
  type: string;
  modifiers: string[];
};

/** Decode the LSP relative-delta token stream into absolute positions. */
export function decodeSemanticTokens(
  data: number[],
  legend: { tokenTypes: string[]; tokenModifiers: string[] },
): DecodedToken[] {
  const out: DecodedToken[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaChar : deltaChar;
    const modifierBits = data[i + 4];
    const modifiers: string[] = [];
    for (let bit = 0; bit < legend.tokenModifiers.length; bit++) {
      if (modifierBits & (1 << bit)) modifiers.push(legend.tokenModifiers[bit]);
    }
    out.push({
      line,
      character,
      length: data[i + 2],
      type: legend.tokenTypes[data[i + 3]] ?? "unknown",
      modifiers,
    });
  }
  return out;
}

const setSemanticTokens = StateEffect.define<DecorationSet>();

const semanticTokensField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSemanticTokens)) next = effect.value;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildDecorations(
  view: EditorView,
  tokens: DecodedToken[],
): DecorationSet {
  const doc = view.state.doc;
  const builder = new RangeSetBuilder<Decoration>();
  for (const token of tokens) {
    if (!COLORED_TYPES.has(token.type)) continue;
    const from = lspToOffset(doc, {
      line: token.line,
      character: token.character,
    });
    const lineEnd = doc.lineAt(from).to;
    const to = Math.min(from + token.length, lineEnd);
    if (to <= from) continue;
    const classes = [`cm-lsp-tok-${token.type}`];
    if (token.modifiers.includes("readonly")) classes.push("cm-lsp-tok-readonly");
    if (token.modifiers.includes("defaultLibrary"))
      classes.push("cm-lsp-tok-defaultLibrary");
    builder.add(from, to, Decoration.mark({ class: classes.join(" ") }));
  }
  return builder.finish();
}

const refreshPlugin = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;

    constructor(readonly view: EditorView) {
      // The session may already be active when this editor (re)mounts.
      this.schedule(300);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) this.schedule(REFRESH_DEBOUNCE_MS);
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(lspActiveEffect) && effect.value) this.schedule(50);
        }
      }
    }

    schedule(delay: number): void {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.refresh();
      }, delay);
    }

    async refresh(): Promise<void> {
      const plugin = lspSyncOf(this.view);
      if (this.destroyed || !plugin?.active) return;
      await plugin.flush();
      const requestVersion = plugin.version;
      let result: {
        legend: { tokenTypes: string[]; tokenModifiers: string[] };
        data: number[];
      } | null;
      try {
        result = (await invoke("lsp_semantic_tokens", {
          workspace: plugin.env as WorkspaceEnv,
          path: plugin.path,
        })) as typeof result;
      } catch {
        return;
      }
      if (this.destroyed || !result) return;
      // The doc moved on while the server computed — the next debounce rerequests.
      if (plugin.version !== requestVersion) return;
      const tokens = decodeSemanticTokens(result.data, result.legend);
      this.view.dispatch({
        effects: setSemanticTokens.of(buildDecorations(this.view, tokens)),
      });
    }

    destroy(): void {
      this.destroyed = true;
      if (this.timer) clearTimeout(this.timer);
    }
  },
);

/** VS Code Dark+/Light+-aligned colors. `.cm-line` bumps specificity over the
 * single-class rules that theme HighlightStyles generate. */
const semanticTheme = EditorView.baseTheme({
  "&dark .cm-line .cm-lsp-tok-type, &dark .cm-line .cm-lsp-tok-class, &dark .cm-line .cm-lsp-tok-interface, &dark .cm-line .cm-lsp-tok-enum, &dark .cm-line .cm-lsp-tok-struct, &dark .cm-line .cm-lsp-tok-typeParameter, &dark .cm-line .cm-lsp-tok-namespace":
    { color: "#4EC9B0" },
  "&dark .cm-line .cm-lsp-tok-function, &dark .cm-line .cm-lsp-tok-method, &dark .cm-line .cm-lsp-tok-macro":
    { color: "#DCDCAA" },
  "&dark .cm-line .cm-lsp-tok-variable, &dark .cm-line .cm-lsp-tok-parameter, &dark .cm-line .cm-lsp-tok-property, &dark .cm-line .cm-lsp-tok-event":
    { color: "#9CDCFE" },
  "&dark .cm-line .cm-lsp-tok-enumMember, &dark .cm-line .cm-lsp-tok-variable.cm-lsp-tok-readonly":
    { color: "#4FC1FF" },
  "&dark .cm-line .cm-lsp-tok-decorator": { color: "#C586C0" },

  "&light .cm-line .cm-lsp-tok-type, &light .cm-line .cm-lsp-tok-class, &light .cm-line .cm-lsp-tok-interface, &light .cm-line .cm-lsp-tok-enum, &light .cm-line .cm-lsp-tok-struct, &light .cm-line .cm-lsp-tok-typeParameter, &light .cm-line .cm-lsp-tok-namespace":
    { color: "#267F99" },
  "&light .cm-line .cm-lsp-tok-function, &light .cm-line .cm-lsp-tok-method, &light .cm-line .cm-lsp-tok-macro":
    { color: "#795E26" },
  "&light .cm-line .cm-lsp-tok-variable, &light .cm-line .cm-lsp-tok-parameter, &light .cm-line .cm-lsp-tok-property, &light .cm-line .cm-lsp-tok-event":
    { color: "#001080" },
  "&light .cm-line .cm-lsp-tok-enumMember, &light .cm-line .cm-lsp-tok-variable.cm-lsp-tok-readonly":
    { color: "#0070C1" },
  "&light .cm-line .cm-lsp-tok-decorator": { color: "#AF00DB" },
});

export const lspSemanticTokensExtension = [
  semanticTokensField,
  refreshPlugin,
  semanticTheme,
];
