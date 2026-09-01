/**
 * Login-shell PATH resolution. GUI apps on macOS inherit a stripped PATH
 * (no homebrew/cargo/go bins), so `which rust-analyzer` would miss servers the
 * user's terminal sees. Resolved once per app run via `$SHELL -l -c`.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

let cachedPath: Promise<string> | null = null;

const FALLBACK_DIRS = [
  "/usr/local/bin",
  "/opt/homebrew/bin",
  join(homedir(), ".cargo", "bin"),
  join(homedir(), "go", "bin"),
  join(homedir(), ".local", "bin"),
];

function withFallbacks(base: string): string {
  const parts = base.split(delimiter).filter(Boolean);
  for (const dir of FALLBACK_DIRS) {
    if (!parts.includes(dir)) parts.push(dir);
  }
  return parts.join(delimiter);
}

export function userShellPath(): Promise<string> {
  if (cachedPath) return cachedPath;
  cachedPath = new Promise((resolve) => {
    const shell = process.env.SHELL;
    if (!shell || process.platform === "win32") {
      resolve(withFallbacks(process.env.PATH ?? ""));
      return;
    }
    const child = execFile(
      shell,
      ["-l", "-c", "echo $PATH"],
      { timeout: 3_000 },
      (err, stdout) => {
        const line = stdout?.trim().split("\n").pop() ?? "";
        resolve(withFallbacks(err || !line ? (process.env.PATH ?? "") : line));
      },
    );
    child.on("error", () => resolve(withFallbacks(process.env.PATH ?? "")));
  });
  return cachedPath;
}

/** Absolute path of `bin` on the user's shell PATH, or null. */
export async function whichOnUserPath(bin: string): Promise<string | null> {
  const path = await userShellPath();
  const exts =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, bin + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
