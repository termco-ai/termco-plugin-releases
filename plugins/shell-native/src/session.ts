/**
 * Persistent shell sessions. A session tracks a
 * working directory that persists across runs (so `cd` in one tool-call is seen
 * by the next), executing each command through the one-shot path.
 */
import { runCommand, type CommandOutput } from "./oneshot";
import type { WorkspaceEnv } from "@termco/workspace-base";

interface Session {
  id: number;
  cwd: string | undefined;
  workspace: WorkspaceEnv;
}

const sessions = new Map<number, Session>();
let nextId = 1;

const CWD_MARK = "__TERMCO_CWD__";

export function sessionOpen(cwd: string | undefined, workspace: WorkspaceEnv): number {
  const id = nextId++;
  sessions.set(id, { id, cwd: cwd?.trim() || undefined, workspace });
  return id;
}

export async function sessionRun(
  id: number,
  command: string,
  cwd: string | undefined,
  timeoutSecs: number | undefined,
  workspace: WorkspaceEnv,
): Promise<CommandOutput> {
  const session = sessions.get(id);
  const effectiveCwd = cwd?.trim() || session?.cwd;
  // Append a pwd marker so a `cd` inside the command persists to the next run.
  // `$?` is preserved so the reported exit code is the user command's, not pwd's.
  const wrapped =
    `${command}\n__termco_ec=$?\nprintf '%s%s%s' "${CWD_MARK}" "$(pwd 2>/dev/null)" "${CWD_MARK}"\nexit $__termco_ec`;
  const out = await runCommand(wrapped, effectiveCwd, timeoutSecs, workspace ?? session?.workspace);

  const start = out.stdout.lastIndexOf(CWD_MARK);
  if (start >= 0) {
    const end = out.stdout.indexOf(CWD_MARK, start + CWD_MARK.length);
    if (end > start) {
      const newCwd = out.stdout.slice(start + CWD_MARK.length, end);
      if (session && newCwd) session.cwd = newCwd;
      out.stdout = out.stdout.slice(0, start);
    }
  }
  return out;
}

export function sessionClose(id: number): void {
  sessions.delete(id);
}

export function sessionCloseAll(): void {
  sessions.clear();
}

export function liveSessions(): Array<{ id: string; label: string }> {
  return [...sessions.values()].map((session) => ({
    id: String(session.id),
    label: `shell session ${session.id}${session.cwd ? ` in ${session.cwd}` : ""}`,
  }));
}
