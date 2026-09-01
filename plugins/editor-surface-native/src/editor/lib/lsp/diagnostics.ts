/**
 * Routes `lsp:diagnostics` broadcasts from main into the right EditorView via
 * `setDiagnostics` (feeding the already-mounted lintGutter). One window-level
 * IPC listener total; sync plugins register themselves per editor. Also keeps
 * each plugin's `active` flag honest via `lsp:status` pushes.
 */
import { getCurrentWebviewWindow } from "../../../webviewWindow";
import { lspDiagnosticsForOpenDocument } from "../../../platform";
import { type Diagnostic, setDiagnostics } from "@codemirror/lint";
import type { LspSyncPlugin } from "./docSync";
import type { LspDiagnosticPayload, SessionStatus } from "./ipc";
import { lspRangeToCm } from "./positions";

const views = new Set<LspSyncPlugin>();
let listening = false;

function severityOf(severity?: number): Diagnostic["severity"] {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 4:
      return "hint";
    default:
      return "info";
  }
}

function mapDiagnostics(
  plugin: LspSyncPlugin,
  diagnostics: LspDiagnosticPayload["diagnostics"],
): Diagnostic[] {
  const doc = plugin.view.state.doc;
  return diagnostics.map((d) => {
    const { from, to } = lspRangeToCm(doc, d.range);
    return {
      // Zero-length ranges render invisibly; widen to one char where possible.
      from,
      to: to > from ? to : Math.min(to + 1, doc.length),
      severity: severityOf(d.severity),
      message: d.message,
      source: d.source
        ? `${d.source}${d.code != null ? ` (${d.code})` : ""}`
        : undefined,
    };
  });
}

function renderDiagnostics(plugin: LspSyncPlugin): void {
  const merged = [...plugin.diagnosticsBySource.values()].flatMap((slice) =>
    mapDiagnostics(plugin, slice),
  );
  plugin.view.dispatch(setDiagnostics(plugin.view.state, merged));
}

function onDiagnostics(payload: LspDiagnosticPayload): void {
  for (const plugin of views) {
    if (plugin.scopeKey !== payload.scopeKey) continue;
    if (plugin.path !== payload.path) continue;
    // Stale pushes (computed against an older version) are dropped — the
    // server re-publishes after the newest didChange anyway.
    if (payload.version != null && payload.version !== plugin.version) continue;
    // Per-source merge: multiple servers (primary + eslint/tailwind) publish
    // independently — each push replaces only its own slice.
    if (payload.serverId === "*") {
      plugin.diagnosticsBySource.clear();
    } else if (payload.diagnostics.length === 0) {
      plugin.diagnosticsBySource.delete(payload.serverId);
    } else {
      plugin.diagnosticsBySource.set(payload.serverId, payload.diagnostics);
    }
    renderDiagnostics(plugin);
  }
}

function onStatus(payload: { sessions: SessionStatus[] }): void {
  const byKey = new Map(payload.sessions.map((s) => [s.sessionKey, s]));
  for (const plugin of views) {
    if (!plugin.sessionKey) continue;
    const session = byKey.get(plugin.sessionKey);
    plugin.setActive(
      session?.state === "running" || session?.state === "restarting",
    );
  }
}

function hydrateDiagnostics(plugin: LspSyncPlugin): void {
  void lspDiagnosticsForOpenDocument(plugin.env, plugin.path)
    .then((slices) => {
      if (!views.has(plugin)) return;
      for (const slice of slices) {
        if (!plugin.diagnosticsBySource.has(slice.serverId)) {
          plugin.diagnosticsBySource.set(slice.serverId, slice.diagnostics);
        }
      }
      renderDiagnostics(plugin);
    })
    .catch(() => {});
}

function ensureListening(): void {
  if (listening) return;
  listening = true;
  const win = getCurrentWebviewWindow();
  void win.listen<LspDiagnosticPayload>("lsp:diagnostics", (event) =>
    onDiagnostics(event.payload),
  );
  void win.listen<{ sessions: SessionStatus[] }>("lsp:status", (event) =>
    onStatus(event.payload),
  );
}

export function registerLspView(plugin: LspSyncPlugin): void {
  ensureListening();
  views.add(plugin);
  hydrateDiagnostics(plugin);
  setTimeout(() => hydrateDiagnostics(plugin), 250);
}

export function unregisterLspView(plugin: LspSyncPlugin): void {
  views.delete(plugin);
}
