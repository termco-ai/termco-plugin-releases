/**
 * The singleton LSP SessionManager. The lsp_* command handlers live in the
 * `lsp` main plugin (`electron/main/plugins/lsp`); this module keeps the
 * manager and its lifecycle helpers at their historical path.
 */
import { SessionManager } from "./sessions";
import { lspRuntime } from "./runtime";

let manager: SessionManager | null = null;

export function lspManagerActive(): boolean {
  return manager !== null;
}

export function lspManager(): SessionManager {
  if (!manager) {
    manager = new SessionManager(
      (payload) => lspRuntime().events.emit("lsp:diagnostics", payload),
      (sessions) => lspRuntime().events.emit("lsp:status", { sessions }),
    );
  }
  return manager;
}

export async function shutdownAllLsp(): Promise<void> {
  await manager?.shutdownAll();
}

/** Quit path: kill every language-server child NOW (sync). A surviving child
 * with piped stdio keeps the Electron main process alive past app.quit(). */
export function killAllLspSync(): void {
  manager?.killAllSync();
}

/** Plugin-deactivation path: kill sessions and release manager listeners. */
export function disposeLspManagerSync(): void {
  manager?.disposeSync();
  manager = null;
}
