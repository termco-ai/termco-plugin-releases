/**
 * The public entry point for inline AI autocomplete: assembles the state field,
 * ghost decorations/theme, completion driver, and keymap into a single
 * CodeMirror extension.
 *
 * The concrete state (suggestion field/effect), rendering, driving logic, and
 * command handlers live in sibling files; this module only wires them together
 * so the extension array — and the shared singleton identities it references —
 * stay in one obvious place.
 */
import { type Extension, Prec } from "@codemirror/state";
import { type EditorView, keymap, ViewPlugin } from "@codemirror/view";
import { acceptSuggestion, acceptWord, dismissSuggestion } from "./commands";
import { CompletionDriver } from "./completionDriver";
import { ghostDecorations, ghostTheme } from "./ghostWidget";
import { suggestionField } from "./suggestionState";
import type { AutocompleteContext } from "./types";

export type { AutocompleteContext, AutocompletePrefs } from "./types";

/**
 * Build the inline-completion extension bound to the host `ctx`.
 *
 * Order in the returned array is load-bearing: the field precedes decorations
 * that read it, and the accept/dismiss keymap is elevated to `Prec.highest` so
 * Tab/Escape win over the editor's default bindings while a ghost is showing.
 */
export function inlineCompletion(ctx: AutocompleteContext): Extension {
  const plugin = ViewPlugin.define((view) => new CompletionDriver(view, ctx));

  const manualTrigger = (view: EditorView): boolean => {
    const inst = view.plugin(plugin);
    if (!inst) return false;
    inst.manualTrigger();
    return true;
  };

  return [
    suggestionField,
    ghostDecorations,
    ghostTheme,
    plugin,
    Prec.highest(
      keymap.of([
        { key: "Tab", run: acceptSuggestion },
        { key: "Escape", run: dismissSuggestion },
        { key: "Mod-ArrowRight", run: acceptWord },
        { key: "Alt-\\", run: manualTrigger },
      ]),
    ),
  ];
}
