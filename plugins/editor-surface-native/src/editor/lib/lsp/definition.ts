/**
 * Go-to-definition: Cmd/Ctrl-hover underlines the symbol like a link,
 * Cmd/Ctrl+Click and F12 jump to it (same-file → cursor move, cross-file →
 * the app's tab open flow), Ctrl+- pops the per-window jump-back stack.
 */
import { type Extension, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
} from "@codemirror/view";
import { type LspSyncPlugin, lspSyncOf } from "./docSync";
import { lspDefinition } from "./ipc";
import { popJump, pushJump } from "./jumpStack";
import { offsetToLsp } from "./positions";

const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

function hasModifier(event: MouseEvent | KeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

const setLinkRange = StateEffect.define<{ from: number; to: number } | null>();

const linkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setLinkRange)) {
        next = effect.value
          ? Decoration.set([
              Decoration.mark({ class: "cm-lsp-link" }).range(
                effect.value.from,
                effect.value.to,
              ),
            ])
          : Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const linkTheme = EditorView.baseTheme({
  ".cm-lsp-link": {
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    cursor: "pointer",
  },
});

async function goToDefinition(view: EditorView, pos: number): Promise<boolean> {
  const plugin = lspSyncOf(view);
  if (!plugin?.active) return false;
  await plugin.flush();
  let locations: Awaited<ReturnType<typeof lspDefinition>>;
  try {
    locations = await lspDefinition(
      plugin.env,
      plugin.path,
      offsetToLsp(view.state.doc, pos),
    );
  } catch {
    return false;
  }
  const target = locations[0];
  if (!target) return false;
  const origin = offsetToLsp(view.state.doc, view.state.selection.main.head);
  pushJump({
    path: plugin.path,
    line: origin.line,
    character: origin.character,
  });
  if (target.path === plugin.path) {
    jumpInView(view, target.line, target.character);
  } else {
    plugin.ctx.openFileAt?.(target.path, target.line, target.character);
  }
  return true;
}

function jumpInView(view: EditorView, line: number, character: number): void {
  const doc = view.state.doc;
  const targetLine = doc.line(Math.max(1, Math.min(line + 1, doc.lines)));
  const anchor = Math.min(
    targetLine.from + Math.max(0, character),
    targetLine.to,
  );
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
  });
  view.focus();
}

/** Pop the jump stack; `open` is the app's cross-file open callback. */
function jumpBack(
  plugin: LspSyncPlugin | null,
  view: EditorView,
): boolean {
  const location = popJump();
  if (!location) return false;
  if (plugin && location.path === plugin.path) {
    jumpInView(view, location.line, location.character);
  } else {
    plugin?.ctx.openFileAt?.(location.path, location.line, location.character);
  }
  return true;
}

/** Tracks the platform modifier and underlines the hovered word while held. */
const cmdHoverPlugin = ViewPlugin.fromClass(
  class {
    private clear: () => void;

    constructor(readonly view: EditorView) {
      const onKeyChange = (event: KeyboardEvent) => {
        if (!hasModifier(event)) this.setRange(null);
      };
      const onBlur = () => this.setRange(null);
      window.addEventListener("keyup", onKeyChange);
      window.addEventListener("blur", onBlur);
      this.clear = () => {
        window.removeEventListener("keyup", onKeyChange);
        window.removeEventListener("blur", onBlur);
      };
    }

    setRange(range: { from: number; to: number } | null): void {
      const current = this.view.state.field(linkField);
      let has = false;
      current.between(0, this.view.state.doc.length, () => {
        has = true;
      });
      if (!range && !has) return;
      this.view.dispatch({ effects: setLinkRange.of(range) });
    }

    onMouseMove(event: MouseEvent): void {
      if (!hasModifier(event) || !lspSyncOf(this.view)?.active) {
        this.setRange(null);
        return;
      }
      const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
      const word = pos != null ? this.view.state.wordAt(pos) : null;
      this.setRange(word ? { from: word.from, to: word.to } : null);
    }

    destroy(): void {
      this.clear();
    }
  },
  {
    eventHandlers: {
      mousemove(event) {
        this.onMouseMove(event);
      },
      mousedown(event, view) {
        if (event.button !== 0 || !hasModifier(event)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        void goToDefinition(view, pos);
        return true;
      },
    },
  },
);

export const lspDefinitionExtension: Extension = [
  linkField,
  linkTheme,
  cmdHoverPlugin,
  keymap.of([
    {
      key: "F12",
      preventDefault: true,
      run: (view) => {
        void goToDefinition(view, view.state.selection.main.head);
        return true;
      },
    },
    {
      key: "Ctrl--",
      preventDefault: true,
      run: (view) => jumpBack(lspSyncOf(view), view),
    },
  ]),
];
