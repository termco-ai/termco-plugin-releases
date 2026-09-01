/**
 * LSP snippet syntax → CodeMirror snippet syntax. LSP tabstops (`$1`,
 * `${1:placeholder}`, choices, variables, `$0` exit point) map onto
 * `@codemirror/autocomplete`'s `${n:text}` fields; the differences:
 *  - choices `${1|a,b|}` collapse to their first option
 *  - variables (`$TM_FILENAME`, `${VAR:default}`) resolve to default/empty —
 *    CM would otherwise treat them as named fields
 *  - `$0` sorts LAST in LSP but numeric 0 sorts first in CM → renumbered high
 */

const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]*$/;

export function lspSnippetToCm(snippet: string): string {
  let out = "";
  let i = 0;
  // Two passes: find the max tabstop number first so $0 can be renumbered.
  const max = maxTabstop(snippet);
  const exitNumber = max + 1;

  while (i < snippet.length) {
    const ch = snippet[i];
    if (ch === "\\" && i + 1 < snippet.length) {
      const next = snippet[i + 1];
      // \$ \\ \} are escapes in LSP snippets; CM needs \ before ${ only.
      out += next === "$" || next === "\\" || next === "}" ? next : ch + next;
      i += 2;
      continue;
    }
    if (ch !== "$") {
      out += ch;
      i += 1;
      continue;
    }
    const parsed = parseDollar(snippet, i);
    if (!parsed) {
      out += ch;
      i += 1;
      continue;
    }
    i = parsed.end;
    if (parsed.kind === "tabstop") {
      const n = parsed.number === 0 ? exitNumber : parsed.number;
      out +=
        parsed.placeholder !== undefined
          ? `\${${n}:${lspSnippetToCm(parsed.placeholder)}}`
          : `\${${n}}`;
    } else {
      // Variable: substitute its default (recursively converted) or nothing.
      out +=
        parsed.placeholder !== undefined
          ? lspSnippetToCm(parsed.placeholder)
          : "";
    }
  }
  return out;
}

type Parsed = {
  kind: "tabstop" | "variable";
  number: number;
  placeholder?: string;
  end: number;
};

/** Parse a `$…` construct starting at `at` (which points at the `$`). */
function parseDollar(text: string, at: number): Parsed | null {
  let i = at + 1;
  // $1 / $0 / $NAME
  const bare = /^([0-9]+|[A-Za-z_][A-Za-z0-9_]*)/.exec(text.slice(i));
  if (text[i] !== "{") {
    if (!bare) return null;
    const token = bare[1];
    if (/^[0-9]+$/.test(token)) {
      return { kind: "tabstop", number: Number(token), end: i + token.length };
    }
    if (VARIABLE_NAME.test(token)) {
      return { kind: "variable", number: -1, end: i + token.length };
    }
    return null;
  }
  // ${...} — find the matching brace (nesting-aware, escape-aware).
  i += 1;
  const start = i;
  let depth = 1;
  while (i < text.length && depth > 0) {
    if (text[i] === "\\") i += 1;
    else if (text[i] === "{") depth += 1;
    else if (text[i] === "}") depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  const body = text.slice(start, i - 1);
  const name = /^([0-9]+|[A-Za-z_][A-Za-z0-9_]*)/.exec(body)?.[1];
  if (!name) return null;
  const rest = body.slice(name.length);
  const isNumber = /^[0-9]+$/.test(name);
  const kind: Parsed["kind"] = isNumber ? "tabstop" : "variable";
  const number = isNumber ? Number(name) : -1;
  if (rest.startsWith(":")) {
    return { kind, number, placeholder: rest.slice(1), end: i };
  }
  if (rest.startsWith("|")) {
    // ${1|a,b,c|} → first choice as the placeholder.
    const choices = rest.slice(1, rest.endsWith("|") ? -1 : undefined);
    return { kind, number, placeholder: choices.split(",")[0] ?? "", end: i };
  }
  if (rest.startsWith("/")) {
    // Variable transforms (${VAR/regex/fmt/}) — unsupported, drop to empty.
    return { kind, number, placeholder: "", end: i };
  }
  if (rest === "") return { kind, number, end: i };
  return null;
}

function maxTabstop(snippet: string): number {
  let max = 0;
  const re = /\$(?:([0-9]+)|\{([0-9]+)[:|}/]?)/g;
  let m = re.exec(snippet);
  while (m) {
    const n = Number(m[1] ?? m[2]);
    if (Number.isFinite(n)) max = Math.max(max, n);
    m = re.exec(snippet);
  }
  return max;
}
