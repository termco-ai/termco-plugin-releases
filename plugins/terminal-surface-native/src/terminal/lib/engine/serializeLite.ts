/**
 * Interim plain-text buffer snapshot for pool slot recycling. Colors
 * and attributes are NOT preserved — Phase 5 of the migration replaces
 * this with the SGR-preserving cell-walk serializer (wtermSerialize).
 * Good enough to keep pane switching lossless for *content* until then.
 */
import type { TerminalCore } from "@wterm/core";
import { bufferLineCount, bufferLineText } from "./lineReader";

export type LiteSnapshot = {
  /** ANSI-writable payload that reproduces the buffer text. */
  data: string;
  /** Buffer lines serialized (for line-anchor rebasing on restore). */
  lines: number;
};

export function serializeLite(
  core: TerminalCore,
  maxLines: number,
): LiteSnapshot {
  const total = bufferLineCount(core);
  const start = Math.max(0, total - maxLines);
  const out: string[] = [];
  for (let i = start; i < total; i++) {
    out.push(bufferLineText(core, i));
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return { data: out.join("\r\n"), lines: out.length };
}
