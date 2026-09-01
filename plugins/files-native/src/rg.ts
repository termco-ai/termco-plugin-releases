/**
 * ripgrep access. Shells out to the vendored ripgrep binary
 * (`@vscode/ripgrep`) for gitignore-aware traversal + its regex engine.
 */
import { spawn } from "node:child_process";
import * as ripgrep from "@vscode/ripgrep";

const ripgrepModule = ripgrep as typeof ripgrep & {
  default?: { rgPath?: string };
};
export const rgPath: string =
  ripgrepModule.rgPath ?? (ripgrepModule.default?.rgPath as string);

export interface RgResult {
  stdout: string;
  code: number | null;
}

/** Run rg with args in `cwd`; resolves with captured stdout (never rejects). */
export function runRg(
  args: string[],
  cwd: string,
  maxBytes = 16 * 1024 * 1024,
): Promise<RgResult> {
  return new Promise((resolve) => {
    const child = spawn(rgPath, args, { cwd });
    let stdout = "";
    let total = 0;
    let killed = false;
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        if (!killed) {
          killed = true;
          child.kill();
        }
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => resolve({ stdout, code: null }));
    child.on("close", (code) => resolve({ stdout, code }));
  });
}
