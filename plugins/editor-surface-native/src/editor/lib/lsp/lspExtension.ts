/**
 * `lspSupport(ctx)` — assembles the editor-side LSP extensions (document sync,
 * hover, go-to-definition, completions, signature help as they land) behind
 * one entry point, analogous to `inlineCompletion(ctx)`.
 */
import type { Extension } from "@codemirror/state";
import { completionCompartment } from "../extensions";
import {
  completionSwapPlugin,
  defaultCompletionExtension,
} from "./completions";
import { lspDefinitionExtension } from "./definition";
import { type LspEditorContext, lspContext, lspSync } from "./docSync";
import { lspHoverExtension } from "./hover";
import { lspSemanticTokensExtension } from "./semanticTokens";
import { lspSignatureExtension } from "./signature";

export type { LspEditorContext } from "./docSync";

export function lspSupport(ctx: LspEditorContext): Extension[] {
  return [
    lspContext.of(ctx),
    lspSync,
    lspHoverExtension,
    lspDefinitionExtension,
    lspSignatureExtension,
    lspSemanticTokensExtension,
    // Popup completion lives in a compartment: word-based until a session is
    // active, then the LSP source (basicSetup's autocompletion is disabled).
    completionCompartment.of(defaultCompletionExtension()),
    completionSwapPlugin,
  ];
}
