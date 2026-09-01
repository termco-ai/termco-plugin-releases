/**
 * Signature help: typing a server-advertised trigger character (usually `(`
 * or `,`) pops a tooltip above the cursor with the active signature and the
 * active parameter bolded. Escape or leaving the call site dismisses it.
 */
import { Prec, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  keymap,
  showTooltip,
  type Tooltip,
} from "@codemirror/view";
import { lspSyncOf } from "./docSync";
import { lspSignatureHelp, type SignatureHelpResult } from "./ipc";
import { offsetToLsp } from "./positions";
import { renderMarkdownLite } from "./renderMarkdownLite";

type SignatureState = { help: NonNullable<SignatureHelpResult>; pos: number };

const setSignature = StateEffect.define<SignatureState | null>();

function renderSignature(state: SignatureState): HTMLElement {
  const { help } = state;
  const root = document.createElement("div");
  root.className = "cm-lsp-signature";
  const signature =
    help.signatures[help.activeSignature ?? 0] ?? help.signatures[0];
  if (!signature) return root;

  const label = document.createElement("div");
  label.className = "cm-lsp-signature-label";
  const activeIndex = signature.activeParameter ?? help.activeParameter ?? -1;
  const parameter = signature.parameters?.[activeIndex];
  let range: [number, number] | null = null;
  if (parameter) {
    if (Array.isArray(parameter.label)) {
      range = parameter.label;
    } else {
      const at = signature.label.indexOf(parameter.label);
      if (at >= 0) range = [at, at + parameter.label.length];
    }
  }
  if (range) {
    label.append(
      document.createTextNode(signature.label.slice(0, range[0])),
      Object.assign(document.createElement("strong"), {
        textContent: signature.label.slice(range[0], range[1]),
      }),
      document.createTextNode(signature.label.slice(range[1])),
    );
  } else {
    label.textContent = signature.label;
  }
  root.append(label);

  const docs =
    typeof parameter?.documentation === "object"
      ? parameter.documentation.value
      : (parameter?.documentation ??
        (typeof signature.documentation === "object"
          ? signature.documentation.value
          : signature.documentation));
  if (docs) {
    const docsEl = renderMarkdownLite(docs);
    docsEl.classList.add("cm-lsp-signature-docs");
    root.append(docsEl);
  }
  return root;
}

const signatureField = StateField.define<SignatureState | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setSignature)) next = effect.value;
    }
    if (!next) return null;
    if (tr.docChanged) {
      next = { ...next, pos: tr.changes.mapPos(next.pos) };
    }
    // Moving the cursor before the opening position closes the help.
    if (
      (tr.docChanged || tr.selection) &&
      tr.state.selection.main.head < next.pos
    ) {
      return null;
    }
    return next;
  },
  provide: (field) =>
    showTooltip.from(field, (state): Tooltip | null =>
      state
        ? {
            pos: state.pos,
            above: true,
            arrow: false,
            create: () => ({ dom: renderSignature(state) }),
          }
        : null,
    ),
});

const signatureTheme = EditorView.baseTheme({
  ".cm-tooltip:has(> .cm-lsp-signature)": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    maxWidth: "40rem",
    padding: "5px 9px",
    fontSize: "12px",
  },
  ".cm-lsp-signature-label": {
    fontFamily: "inherit",
    whiteSpace: "pre-wrap",
  },
  ".cm-lsp-signature-docs": {
    marginTop: "3px",
    opacity: "0.85",
  },
});

async function requestSignature(
  view: EditorView,
  triggerCharacter: string | undefined,
  isRetrigger: boolean,
): Promise<void> {
  const plugin = lspSyncOf(view);
  if (!plugin?.active) return;
  await plugin.flush();
  const pos = view.state.selection.main.head;
  let help: SignatureHelpResult;
  try {
    help = await lspSignatureHelp(
      plugin.env,
      plugin.path,
      offsetToLsp(view.state.doc, pos),
      triggerCharacter
        ? { triggerKind: 2, triggerCharacter, isRetrigger }
        : { triggerKind: 1, isRetrigger },
    );
  } catch {
    help = null;
  }
  if (view.state.field(signatureField, false) === undefined) return;
  view.dispatch({
    effects: setSignature.of(
      help && help.signatures.length > 0
        ? { help, pos: view.state.selection.main.head }
        : null,
    ),
  });
}

/** Watches typed trigger characters advertised by the server. */
const signatureTrigger = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  const plugin = lspSyncOf(update.view);
  if (!plugin?.active) return;
  const triggers = plugin.openResult?.triggers?.signature ?? [];
  const retriggers = plugin.openResult?.triggers?.signatureRetrigger ?? [];
  const open = update.state.field(signatureField, false) != null;
  let typed: string | null = null;
  update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    const text = inserted.toString();
    if (text.length === 1) typed = text;
  });
  if (!typed) return;
  const isTrigger = triggers.includes(typed);
  const isRetrigger = open && (retriggers.includes(typed) || isTrigger);
  if (isTrigger || isRetrigger) {
    void requestSignature(update.view, typed, open);
  } else if (open && typed === ")") {
    // Heuristic close on the common call-end character.
    update.view.dispatch({ effects: setSignature.of(null) });
  }
});

const signatureKeymap = Prec.high(
  keymap.of([
    {
      key: "Escape",
      run: (view) => {
        if (!view.state.field(signatureField, false)) return false;
        view.dispatch({ effects: setSignature.of(null) });
        return true;
      },
    },
    {
      key: "Mod-Shift-Rig",
      preventDefault: true,
      run: (view) => {
        void requestSignature(view, undefined, false);
        return true;
      },
    },
  ]),
);

export const lspSignatureExtension = [
  signatureField,
  signatureTrigger,
  signatureKeymap,
  signatureTheme,
];
