/**
 * Parsing of the `<selection>` / `<file>` / `<snippet>` context blocks that the
 * composer injects into a user message. Splits the visible prompt text from the
 * attached-context "chips" so the transcript can render them separately. Pure.
 */

export type ContextChip =
  | { kind: "selection"; source: "terminal" | "editor"; lines: number }
  | { kind: "file"; name: string; lines: number }
  | { kind: "snippet"; name: string };

const SELECTION_RE =
  /<selection\s+source="(terminal|editor)">\n?([\s\S]*?)\n?<\/selection>/g;
const FILE_RE = /<file\s+name="([^"]+)"[^>]*>\n?([\s\S]*?)\n?<\/file>/g;
const SNIPPET_RE = /<snippet\s+name="([^"]+)">\n?[\s\S]*?\n?<\/snippet>/g;
// Grabbed page elements ride as a `<page-element>` text block for the model, but
// the transcript shows them as the attached image thumbnail — strip the block.
const PAGE_ELEMENT_RE =
  /<page-element\s+name="[^"]*">\n?[\s\S]*?\n?<\/page-element>/g;
const BROWSER_PAGE_ELEMENT_RE =
  /<browser-page-element>\n?[\s\S]*?\n?<\/browser-page-element>/g;

function countLines(s: string): number {
  if (!s) return 0;
  const trimmed = s.replace(/\n+$/, "");
  if (!trimmed) return 0;
  return trimmed.split("\n").length;
}

export function stripUserContextBlocks(text: string): {
  text: string;
  chips: ContextChip[];
} {
  const chips: ContextChip[] = [];
  let out = text;
  out = out.replace(SELECTION_RE, (_m, source: string, body: string) => {
    chips.push({
      kind: "selection",
      source: source === "editor" ? "editor" : "terminal",
      lines: countLines(body),
    });
    return "";
  });
  out = out.replace(FILE_RE, (_m, name: string, body: string) => {
    chips.push({ kind: "file", name, lines: countLines(body) });
    return "";
  });
  out = out.replace(SNIPPET_RE, (_m, name: string) => {
    chips.push({ kind: "snippet", name });
    return "";
  });
  out = out.replace(PAGE_ELEMENT_RE, () => "");
  out = out.replace(BROWSER_PAGE_ELEMENT_RE, () => "");
  return { text: out.trim(), chips };
}
