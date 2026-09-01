/**
 * Document synchronization between the CodeMirror buffer (authoritative) and
 * the main-process LSP session: didOpen on mount, debounced incremental
 * didChange batches with monotone versions + checksum drift detection, didClose
 * on destroy. All feature requests (hover/definition/…) must `flush()` first so
 * server-side text matches the positions they send.
 */
import { type WorkspaceEnv, workspaceScopeKey } from "../../../workspace";
import { Facet, StateEffect } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { registerLspView, unregisterLspView } from "./diagnostics";
import {
  type DocChangePayload,
  type DocOpenResult,
  lspDocChange,
  lspDocClose,
  lspDocOpen,
  lspDocResync,
} from "./ipc";
import { contentChecksum, offsetToLsp } from "./positions";
import { lspStatusKey, useLspStatusStore } from "./statusStore";

const CHANGE_DEBOUNCE_MS = 200;

export type LspEditorContext = {
  /** The env of the tab's OWN rig — never the global current env. */
  getEnv(): WorkspaceEnv;
  getRigRoot(): string | null;
  getPath(): string;
  /** CodeMirror language id (languageResolver id); null = no LSP. */
  getLanguageId(): string | null;
  /** Open (or focus) a file at a position — wired to the app's tab open flow. */
  openFileAt?(path: string, line: number, character: number): void;
  /** Called when the LSP session for this editor becomes (in)active. */
  onActiveChange?(active: boolean): void;
};

export const lspContext = Facet.define<
  LspEditorContext,
  LspEditorContext | null
>({
  combine: (values) => values[0] ?? null,
});

/** Dispatched whenever this editor's LSP session becomes (in)active — the
 * completion module listens and swaps the popup source accordingly. */
export const lspActiveEffect = StateEffect.define<boolean>();

export class LspSyncPlugin {
  readonly ctx: LspEditorContext;
  /** Captured once at mount — a tab never migrates between rigs mid-flight. */
  readonly env: WorkspaceEnv;
  readonly scopeKey: string;
  readonly path: string;
  active = false;
  sessionKey: string | null = null;
  openResult: DocOpenResult | null = null;
  version = 1;
  /** serverId → last published diagnostics; merged into setDiagnostics. */
  readonly diagnosticsBySource = new Map<
    string,
    import("./ipc").LspDiagnosticPayload["diagnostics"]
  >();

  private pending: DocChangePayload[][] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Serializes didOpen → didChange → didClose so order is guaranteed. */
  private chain: Promise<unknown> = Promise.resolve();
  private destroyed = false;

  constructor(readonly view: EditorView) {
    const ctx = view.state.facet(lspContext);
    if (!ctx) throw new Error("lspSupport() requires lspContext");
    this.ctx = ctx;
    this.env = ctx.getEnv();
    this.scopeKey = workspaceScopeKey(this.env);
    this.path = ctx.getPath();
    const text = view.state.doc.toString();
    // Language may resolve lazily; retry once on the next macrotask if absent.
    const language = ctx.getLanguageId();
    if (language) this.open(language, text);
    else {
      setTimeout(() => {
        if (this.destroyed) return;
        const late = this.ctx.getLanguageId();
        if (late) this.open(late, text);
      }, 50);
    }
  }

  private open(languageId: string, text: string): void {
    this.chain = this.chain.then(async () => {
      if (this.destroyed) return;
      try {
        const result = await lspDocOpen({
          workspace: this.env,
          rigRoot: this.ctx.getRigRoot(),
          path: this.path,
          languageId,
          text,
        });
        if (this.destroyed) {
          if (result.active) void lspDocClose(this.env, this.path);
          return;
        }
        this.openResult = result;
        this.active = result.active;
        this.sessionKey = result.sessionKey ?? null;
        if (result.active) {
          registerLspView(this);
          this.view.dom.classList.add("cm-lsp-enabled");
          this.view.dispatch({ effects: lspActiveEffect.of(true) });
          useLspStatusStore
            .getState()
            .setActive(
              lspStatusKey(this.scopeKey, this.path),
              result.serverId ?? "lsp",
            );
        }
        this.ctx.onActiveChange?.(result.active);
      } catch {
        // Main not ready / command missing — editor works without LSP.
      }
    });
  }

  update(update: ViewUpdate): void {
    if (!update.docChanged) return;
    // Ranges are positions in the update's OLD doc, emitted descending so the
    // server can apply them sequentially without offset shifting.
    const group: DocChangePayload[] = [];
    const oldDoc = update.startState.doc;
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      group.unshift({
        range: {
          start: offsetToLsp(oldDoc, fromA),
          end: offsetToLsp(oldDoc, toA),
        },
        text: inserted.toString(),
      });
    });
    if (group.length === 0) return;
    this.pending.push(group);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, CHANGE_DEBOUNCE_MS);
  }

  /** Push all pending changes now; resolves when the server copy is current. */
  flush(): Promise<unknown> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pending.length === 0) return this.chain;
    const groups = this.pending;
    this.pending = [];
    this.version += 1;
    const version = this.version;
    // Checksum of the buffer as of scheduling — matches what the server copy
    // must equal after applying exactly these groups.
    const checksum = contentChecksum(this.view.state.doc.toString());
    this.chain = this.chain.then(async () => {
      if (!this.active) return;
      try {
        const result = await lspDocChange({
          workspace: this.env,
          path: this.path,
          version,
          changes: groups.flat(),
          checksum,
        });
        if (result?.resync) await this.resync();
      } catch {
        // Session died; the status push flips `active` off via lsp:status.
      }
    });
    return this.chain;
  }

  private async resync(): Promise<void> {
    this.version += 1;
    await lspDocResync({
      workspace: this.env,
      path: this.path,
      version: this.version,
      text: this.view.state.doc.toString(),
    });
  }

  /** Session state changed externally (crash/restart) — reflect it. */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.view.dom.classList.toggle("cm-lsp-enabled", active);
    this.view.dispatch({ effects: lspActiveEffect.of(active) });
    useLspStatusStore
      .getState()
      .setActive(
        lspStatusKey(this.scopeKey, this.path),
        active ? (this.openResult?.serverId ?? "lsp") : null,
      );
    this.ctx.onActiveChange?.(active);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    unregisterLspView(this);
    useLspStatusStore
      .getState()
      .setActive(lspStatusKey(this.scopeKey, this.path), null);
    const wasActive = this.active;
    this.active = false;
    if (wasActive) {
      this.chain = this.chain.then(() => lspDocClose(this.env, this.path));
    }
  }
}

export const lspSync = ViewPlugin.fromClass(LspSyncPlugin);

/** The sync plugin instance of a view (null when LSP isn't wired/active). */
export function lspSyncOf(view: EditorView): LspSyncPlugin | null {
  return view.plugin(lspSync);
}
