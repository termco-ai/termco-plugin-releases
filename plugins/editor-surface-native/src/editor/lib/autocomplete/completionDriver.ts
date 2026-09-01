/**
 * The `ViewPlugin` value that drives inline autocomplete: it watches document
 * and selection changes, debounces requests, cancels stale in-flight work,
 * caches results, and dispatches the resulting ghost suggestion.
 *
 * Stateful and per-view — one instance is created for each `EditorView`.
 */
import { Transaction } from "@codemirror/state";
import type { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import {
  CACHE_SIZE,
  CHAIN_DELAY_MS,
  DEBOUNCE_MS,
  PREFIX_WINDOW,
  SUFFIX_WINDOW,
} from "./constants";
import { LRU } from "./lru";
import { requestCompletion } from "./provider";
import { setSuggestion, suggestionField } from "./suggestionState";
import { suggestionKey, trimSuggestion } from "./suggestionText";
import { shouldTrigger } from "./trigger";
import type { AutocompleteContext } from "./types";

/** Debounces, requests, and applies inline completions for a single view. */
export class CompletionDriver implements PluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private inflightKey: string | null = null;
  private cache = new LRU<string, string>(CACHE_SIZE);

  constructor(
    private readonly view: EditorView,
    private readonly ctx: AutocompleteContext,
  ) {}

  update(u: ViewUpdate) {
    if (!u.docChanged && !u.selectionSet) return;

    let typed = false;
    let chained = false;
    let isDelete = false;
    let isUndo = false;
    for (const tr of u.transactions) {
      const ev = tr.annotation(Transaction.userEvent);
      if (!ev) continue;
      if (ev.startsWith("input.complete.ai")) chained = true;
      else if (ev.startsWith("input")) typed = true;
      else if (ev.startsWith("delete")) isDelete = true;
      else if (ev === "undo" || ev === "redo") isUndo = true;
    }

    if (isDelete || isUndo) {
      this.cancelTimer();
      this.cancelInFlight();
      return;
    }

    if (chained) {
      // After accept/accept-word, fire again with a short delay so the next
      // suggestion is ready as soon as the user looks up.
      this.schedule(false, CHAIN_DELAY_MS);
      return;
    }

    if (u.docChanged && typed) {
      this.schedule(false);
      return;
    }

    if (u.selectionSet && !u.docChanged) {
      // Pure cursor move — drop pending work, ghost is cleared by the field.
      this.cancelTimer();
      this.cancelInFlight();
    }
  }

  manualTrigger() {
    this.schedule(true);
  }

  private schedule(isManual: boolean, delayOverride?: number) {
    this.cancelTimer();
    const delay = delayOverride ?? (isManual ? 0 : DEBOUNCE_MS);
    this.timer = setTimeout(() => void this.fire(isManual), delay);
  }

  private cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private cancelInFlight() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
      this.inflightKey = null;
    }
  }

  private clearGhost() {
    if (this.view.state.field(suggestionField)) {
      this.view.dispatch({ effects: setSuggestion.of(null) });
    }
  }

  destroy() {
    this.cancelInFlight();
    this.cancelTimer();
  }

  private async fire(isManual: boolean) {
    const prefs = this.ctx.getPrefs();
    const state = this.view.state;
    if (!shouldTrigger(state, prefs, isManual)) return;

    const cursor = state.selection.main.from;
    const doc = state.doc;
    const prefix = doc.sliceString(Math.max(0, cursor - PREFIX_WINDOW), cursor);
    const suffix = doc.sliceString(
      cursor,
      Math.min(doc.length, cursor + SUFFIX_WINDOW),
    );

    const lang = this.ctx.getLanguage();
    const key = suggestionKey(prefix, suffix, lang);

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.applyResult(cached, cursor);
      return;
    }

    if (this.inflightKey === key) return;
    this.cancelInFlight();
    const controller = new AbortController();
    this.controller = controller;
    this.inflightKey = key;
    const signal = controller.signal;

    let raw = "";
    try {
      raw = await requestCompletion(
        {
          prefix,
          suffix,
          filename: this.ctx.getPath(),
          language: lang,
        },
        prefs,
        signal,
      );
    } catch (err) {
      if (signal.aborted) return;
      if (this.controller === controller) {
        this.controller = null;
        this.inflightKey = null;
      }
      return;
    }
    if (signal.aborted) return;
    if (this.controller === controller) {
      this.controller = null;
      this.inflightKey = null;
    }

    const trimmed = trimSuggestion(raw, prefix, suffix);
    // Only cache non-empty: empty often comes from a flaky reasoning-only
    // response, not from "no completion exists here." Letting it retry next
    // time is cheaper than persistently showing nothing.
    if (trimmed) this.cache.set(key, trimmed);
    this.applyResult(trimmed, cursor);
  }

  private applyResult(text: string, cursor: number) {
    if (!text) {
      this.clearGhost();
      return;
    }
    const sel = this.view.state.selection.main;
    if (sel.from !== cursor || sel.to !== cursor) return;
    this.view.dispatch({
      effects: setSuggestion.of({ from: cursor, text }),
    });
  }
}
