import type { TerminalCore } from "@wterm/core";
import { bufferLineCount, bufferLineText } from "../../lib/engine";

export function readRangeText(
  core: TerminalCore,
  startLine: number,
  endLine: number,
): string {
  const last = Math.min(endLine, bufferLineCount(core) - 1);
  const lines: string[] = [];
  for (let i = Math.max(0, startLine); i <= last; i++) {
    lines.push(bufferLineText(core, i));
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
