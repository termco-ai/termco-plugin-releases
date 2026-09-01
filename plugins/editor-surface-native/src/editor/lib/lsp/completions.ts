/**
 * LSP completions for the popup: a CompletionSource that replaces CodeMirror's
 * word-based source while a session is active (the AI ghost text is a separate
 * inline layer and stays untouched). Handles trigger characters, lazy resolve
 * for docs, textEdit/additionalTextEdits (auto-imports), and snippet inserts.
 */
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  insertCompletionText,
  snippet,
} from "@codemirror/autocomplete";
import { ChangeSet, type ChangeSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { completionCompartment } from "../extensions";
import { lspActiveEffect, lspSyncOf } from "./docSync";
import {
  type LspCompletionItem,
  lspCompletion,
  lspCompletionResolve,
} from "./ipc";
import { lspRangeToCm, offsetToLsp } from "./positions";
import { renderMarkdownLite } from "./renderMarkdownLite";
import { lspSnippetToCm } from "./snippets";

/** LSP CompletionItemKind → CM completion `type` (drives the icon). */
const KIND_MAP: Record<number, string> = {
  1: "text",
  2: "method",
  3: "function",
  4: "function", // constructor
  5: "property", // field
  6: "variable",
  7: "class",
  8: "interface",
  9: "namespace", // module
  10: "property",
  11: "keyword", // unit
  12: "constant", // value
  13: "enum",
  14: "keyword",
  15: "text", // snippet
  16: "constant", // color
  17: "text", // file
  18: "text", // reference
  19: "namespace", // folder
  20: "constant", // enum member
  21: "constant",
  22: "class", // struct
  23: "keyword", // event
  24: "keyword", // operator
  25: "type", // type parameter
};

let nextRequestId = 1;

function docOf(item: LspCompletionItem): string | null {
  const docs = item.documentation;
  if (!docs) return null;
  return typeof docs === "string" ? docs : docs.value;
}

function applyItem(
  resolveKey: string | null,
  item: LspCompletionItem,
): NonNullable<Completion["apply"]> {
  return (view, completion, from, to) => {
    void (async () => {
      let resolved = item;
      // additionalTextEdits (auto-imports) often only arrive from resolve.
      if (!item.additionalTextEdits && resolveKey) {
        try {
          resolved = await lspCompletionResolve(resolveKey, item);
        } catch {
          resolved = item;
        }
      }
      const doc = view.state.doc;
      // Prefer the server's textEdit range when it's still coherent with the
      // completion window CM computed; otherwise fall back to from..to.
      let start = from;
      let end = to;
      const edit = resolved.textEdit ?? item.textEdit;
      const editRange = edit
        ? "range" in edit
          ? edit.range
          : edit.replace
        : undefined;
      if (editRange) {
        const mapped = lspRangeToCm(doc, editRange);
        if (mapped.from <= from && mapped.to >= from) {
          start = mapped.from;
          end = Math.max(mapped.to, to);
        }
      }
      const newText = edit?.newText ?? resolved.insertText ?? resolved.label;

      // additionalTextEdits are relative to the same pre-apply document —
      // apply them first, then map the main-edit window through them.
      const additional = resolved.additionalTextEdits ?? [];
      if (additional.length > 0) {
        const specs: ChangeSpec[] = additional.map((e) => {
          const r = lspRangeToCm(doc, e.range);
          return { from: r.from, to: r.to, insert: e.newText };
        });
        const changes = ChangeSet.of(specs, doc.length);
        view.dispatch({ changes: specs });
        start = changes.mapPos(start, 1);
        end = changes.mapPos(end, 1);
      }

      if (resolved.insertTextFormat === 2) {
        snippet(lspSnippetToCm(newText))(view, completion, start, end);
      } else {
        view.dispatch(insertCompletionText(view.state, newText, start, end));
      }
    })();
  };
}

/**
 * Popup source factory. "primary" hits the doc's main session (with the
 * server's trigger characters); a number targets that secondary session
 * (eslint/tailwind — their completions join the same popup, CM merges the
 * results of all override sources natively).
 */
function makeLspCompletionSource(target: "primary" | number) {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const view = context.view;
    const plugin = view ? lspSyncOf(view) : null;
    if (!view || !plugin?.active) return null;
    const secondary =
      target === "primary"
        ? null
        : (plugin.openResult?.secondaries?.[target] ?? null);
    if (target !== "primary" && !secondary) return null;
    const resolveKey =
      target === "primary"
        ? plugin.sessionKey
        : (secondary?.sessionKey ?? null);

    const word = context.matchBefore(/[-\w$]+$/);
    const before = context.state.sliceDoc(
      Math.max(0, context.pos - 1),
      context.pos,
    );
    // Trigger characters are only known for the primary; secondaries fire on
    // word prefixes and explicit invocation.
    const triggerCharacters =
      target === "primary"
        ? (plugin.openResult?.triggers?.completion ?? [])
        : [];
    const isTrigger = triggerCharacters.includes(before);
    if (!context.explicit && !word && !isTrigger) return null;

    await plugin.flush();
    const requestId = nextRequestId++;
    let result: Awaited<ReturnType<typeof lspCompletion>>;
    try {
      result = await lspCompletion({
        workspace: plugin.env,
        path: plugin.path,
        position: offsetToLsp(context.state.doc, context.pos),
        context: context.explicit
          ? { triggerKind: 1 }
          : isTrigger && !word
            ? { triggerKind: 2, triggerCharacter: before }
            : { triggerKind: 1 },
        requestId,
        ...(secondary ? { sessionKey: secondary.sessionKey } : {}),
      });
    } catch {
      return null;
    }
    if (context.aborted || result.items.length === 0) return null;

    const options: Completion[] = result.items.map((item) => ({
      label: item.label,
      type: item.kind != null ? KIND_MAP[item.kind] : undefined,
      detail: item.detail,
      apply: applyItem(resolveKey, item),
      commitCharacters: item.commitCharacters,
      info: () => {
        const inline = docOf(item);
        if (inline) return renderMarkdownLite(inline);
        if (!resolveKey) return null;
        return lspCompletionResolve(resolveKey, item)
          .then((resolved) => {
            const docs = docOf(resolved) ?? resolved.detail;
            return docs ? renderMarkdownLite(docs) : null;
          })
          .catch(() => null);
      },
    }));

    return {
      from: word?.from ?? context.pos,
      options,
      // Complete lists can be re-filtered client-side while the user types a
      // word; incomplete lists must re-query the server on every keystroke.
      validFor: result.isIncomplete ? undefined : /^[-\w$]*$/,
    };
  };
}

const primarySource = makeLspCompletionSource("primary");
// Secondary source slots are static (CM sources are plain functions); each
// checks at call time whether its slot exists for the doc. Two slots cover
// the curated secondaries (eslint + tailwind); custom setups rarely need more.
const secondarySources = [
  makeLspCompletionSource(0),
  makeLspCompletionSource(1),
];

const lspPopupConfig = autocompletion({
  override: [primarySource, ...secondarySources],
});

/** Word-based fallback — behavior-identical to the old basicSetup popup. */
const defaultPopupConfig = autocompletion();

export function defaultCompletionExtension() {
  return defaultPopupConfig;
}

/** Swaps the popup source whenever the editor's LSP session flips. */
export const completionSwapPlugin = EditorView.updateListener.of((update) => {
  for (const tr of update.transactions) {
    for (const effect of tr.effects) {
      if (!effect.is(lspActiveEffect)) continue;
      const active = effect.value;
      const view = update.view;
      queueMicrotask(() => {
        view.dispatch({
          effects: completionCompartment.reconfigure(
            active ? lspPopupConfig : defaultPopupConfig,
          ),
        });
      });
    }
  }
});
