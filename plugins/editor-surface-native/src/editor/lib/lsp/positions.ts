/**
 * CodeMirror offset ↔ LSP {line, character} mapping. CM offsets are UTF-16
 * code units — identical to LSP's default utf-16 position encoding, so the
 * mapping is exact; we only clamp defensively (servers occasionally return
 * past-EOL/past-EOF positions).
 */
import type { Text } from "@codemirror/state";

export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };

export function offsetToLsp(doc: Text, pos: number): LspPosition {
  const clamped = Math.max(0, Math.min(pos, doc.length));
  const line = doc.lineAt(clamped);
  return { line: line.number - 1, character: clamped - line.from };
}

export function lspToOffset(doc: Text, pos: LspPosition): number {
  const lineNumber = Math.max(1, Math.min(pos.line + 1, doc.lines));
  const line = doc.line(lineNumber);
  return Math.min(line.from + Math.max(0, pos.character), line.to);
}

export function lspRangeToCm(
  doc: Text,
  range: LspRange,
): { from: number; to: number } {
  const from = lspToOffset(doc, range.start);
  const to = Math.max(from, lspToOffset(doc, range.end));
  return { from, to };
}

/** djb2 — must match electron/main/lsp/types.ts `contentChecksum`. */
export function contentChecksum(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
