/**
 * CodeMirror state field + tooltip rendering for the shell-history popover.
 *
 * Holds the open/closed list state, exposes small dispatch helpers, and builds
 * the DOM tooltip that lists matching history commands. The keymap and refilter
 * behaviour that drive this field live in `./index`.
 */

import { type EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  type EditorView,
  showTooltip,
  type Tooltip,
  type TooltipView,
} from "@codemirror/view";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { hugeIcon } from "../completionIcons";

export type HState = { open: boolean; items: string[]; index: number };

export const CLOSED: HState = { open: false, items: [], index: 0 };

const setHistory = StateEffect.define<HState>();

export const historyField = StateField.define<HState>({
  create: () => CLOSED,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHistory)) return e.value;
    return value;
  },
  provide: (f) => showTooltip.from(f, (s) => (s.open ? TOOLTIP : null)),
});

export function historyOpen(state: EditorState): boolean {
  return state.field(historyField, false)?.open ?? false;
}

export function dispatch(view: EditorView, next: HState) {
  view.dispatch({ effects: setHistory.of(next) });
}

export function close(view: EditorView) {
  if (view.state.field(historyField, false)?.open) dispatch(view, CLOSED);
}

export function acceptIndex(view: EditorView, i: number) {
  const h = view.state.field(historyField, false);
  const cmd = h?.items[i];
  if (cmd == null) {
    close(view);
    return;
  }
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: cmd },
    selection: { anchor: cmd.length },
    effects: setHistory.of(CLOSED),
  });
  view.focus();
}

const TOOLTIP: Tooltip = {
  pos: 0,
  above: true,
  strictSide: true,
  arrow: false,
  create: historyTooltipView,
};

function historyTooltipView(view: EditorView): TooltipView {
  const dom = document.createElement("div");
  dom.className = "cm-history-popover";
  const list = document.createElement("div");
  list.className = "cm-history-list";
  const footer = document.createElement("div");
  footer.className = "cm-history-footer";
  footer.textContent = "↑↓ navigate · ↵ run · esc";
  dom.append(list, footer);

  let lastSig = "";
  const render = () => {
    const h = view.state.field(historyField);
    const sig = `${h.index}|${h.items.length}|${h.items[0] ?? ""}`;
    if (sig === lastSig) return;
    lastSig = sig;
    list.replaceChildren();
    h.items.forEach((cmd, i) => {
      const row = document.createElement("div");
      row.className = "cm-history-item";
      if (i === h.index) row.setAttribute("aria-selected", "true");
      const icon = hugeIcon(Clock01Icon, 12);
      icon.classList.add("cm-history-icon");
      const text = document.createElement("span");
      text.className = "cm-history-text";
      text.textContent = cmd;
      row.append(icon, text);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        acceptIndex(view, i);
      });
      row.addEventListener("mouseenter", () => {
        const cur = view.state.field(historyField, false);
        if (cur?.open && cur.index !== i) {
          dispatch(view, { ...cur, index: i });
        }
      });
      list.appendChild(row);
    });
    const active = list.children[h.index] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  };

  render();
  return {
    dom,
    mount: render,
    update(u) {
      if (u.state.field(historyField) !== u.startState.field(historyField)) {
        render();
      }
    },
  };
}
