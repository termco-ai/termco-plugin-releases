/**
 * Git error classification (`ensureSuccess` / auth-error detection).
 */
import type { GitOutput } from "./runner";

export type GitErrorKind =
  | "authRequired"
  | "hostKeyUnverified"
  | "timedOut"
  | "commandFailed"
  | "spawn"
  | "pathOutsideWorkspace";

export class GitError extends Error {
  constructor(
    readonly kind: GitErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GitError";
  }

  static command(context: string, detail: string): GitError {
    return new GitError("commandFailed", detail ? `${context}: ${detail}` : context);
  }
}

export function classifyAuthError(stderr: string): GitError | null {
  const lower = stderr.toLowerCase();
  if (
    lower.includes("could not read username") ||
    lower.includes("could not read password") ||
    lower.includes("authentication failed") ||
    lower.includes("permission denied (publickey)") ||
    lower.includes("invalid credentials")
  ) {
    return new GitError("authRequired", stderr.split("\n")[0] || stderr);
  }
  if (lower.includes("host key verification failed")) {
    return new GitError("hostKeyUnverified", "host key verification failed");
  }
  return null;
}

export function ensureSuccess(output: GitOutput, context: string): void {
  if (output.timedOut) {
    throw new GitError("timedOut", `${context} timed out`);
  }
  if (output.exitCode === 0) return;
  const stderr = output.stderr.toString("utf8").trim();
  const stdout = output.stdout.toString("utf8").trim();
  const auth = classifyAuthError(stderr);
  if (auth) throw auth;
  const detail = stderr || stdout || "unknown git error";
  throw GitError.command(context, detail);
}
