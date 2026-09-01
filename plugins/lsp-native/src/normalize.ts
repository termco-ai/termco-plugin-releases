/**
 * Pure protocol-shape normalizers: collapse the LSP's polymorphic result types
 * into the single shapes the renderer consumes. No electron imports — unit
 * tested directly.
 */
import type * as lsp from "vscode-languageserver-protocol";
import { uriToPath } from "./uri";

/** Location | Location[] | LocationLink[] → flat [{path, line, character}]. */
export function normalizeDefinition(
  result: lsp.Definition | lsp.LocationLink[] | null,
): Array<{ path: string; line: number; character: number }> {
  if (!result) return [];
  const list = Array.isArray(result) ? result : [result];
  return list.map((loc) => {
    if ("targetUri" in loc) {
      const range = loc.targetSelectionRange ?? loc.targetRange;
      return {
        path: uriToPath(loc.targetUri),
        line: range.start.line,
        character: range.start.character,
      };
    }
    return {
      path: uriToPath(loc.uri),
      line: loc.range.start.line,
      character: loc.range.start.character,
    };
  });
}

/** Hover contents (all three protocol shapes) → one markdown string. */
export function hoverToMarkdown(hover: lsp.Hover): string {
  const { contents } = hover;
  const parts = Array.isArray(contents) ? contents : [contents];
  return parts
    .map((part) => {
      if (typeof part === "string") return part;
      if ("kind" in part) return part.value;
      return `\`\`\`${part.language}\n${part.value}\n\`\`\``;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/** Completion result → normalized list with itemDefaults folded in. */
export function normalizeCompletion(
  result: lsp.CompletionList | lsp.CompletionItem[] | null,
): { isIncomplete: boolean; items: lsp.CompletionItem[] } {
  if (!result) return { isIncomplete: false, items: [] };
  if (Array.isArray(result)) return { isIncomplete: false, items: result };
  const defaults = result.itemDefaults;
  const items = defaults
    ? result.items.map((item) => ({
        insertTextFormat: defaults.insertTextFormat,
        insertTextMode: defaults.insertTextMode,
        commitCharacters: defaults.commitCharacters,
        data: defaults.data,
        ...(defaults.editRange && item.textEditText
          ? {
              textEdit:
                "start" in defaults.editRange
                  ? { range: defaults.editRange, newText: item.textEditText }
                  : {
                      insert: defaults.editRange.insert,
                      replace: defaults.editRange.replace,
                      newText: item.textEditText,
                    },
            }
          : {}),
        ...item,
      }))
    : result.items;
  return { isIncomplete: result.isIncomplete, items };
}
