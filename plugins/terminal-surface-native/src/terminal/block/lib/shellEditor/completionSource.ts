import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { historyOpen } from "../historyPopover";
import { pathCompletions } from "../pathComplete";
import { SHELL_COMMANDS, SHELL_KEYWORDS } from "./commandData";

const WORD_RE = /[\w./+-]*/;
const DOC_WORD_RE = /[A-Za-z_][\w./-]+/g;
const VALID_FOR = /^[\w./+-]*$/;
// Command position = start of a command segment: line start, or right after a
// separator (; & | newline ( { ), so the 2nd command in `a; b` completes too.
const SEGMENT_START = /(^|[\n;&|(){}])\s*$/;

function commandOptions(
  prefix: string,
  getCommands: () => string[],
): Completion[] {
  const names = getCommands();
  const src = names.length ? names : SHELL_COMMANDS;
  const out: Completion[] = [];
  for (const label of src) {
    if (label.startsWith(prefix)) {
      out.push({ label, type: "function" });
      if (out.length >= 50) break;
    }
  }
  for (const k of SHELL_KEYWORDS) {
    if (k.startsWith(prefix)) out.push({ label: k, type: "keyword" });
  }
  return out;
}

function docWordOptions(ctx: CompletionContext, current: string): Completion[] {
  const seen = new Set<string>([current]);
  const out: Completion[] = [];
  for (const m of ctx.state.doc.toString().matchAll(DOC_WORD_RE)) {
    const w = m[0];
    if (seen.has(w)) continue;
    seen.add(w);
    out.push({ label: w, type: "text" });
    if (out.length >= 50) break;
  }
  return out;
}

const PATH_VALID_FOR = /^[^/]*$/;

export function makeCompletionSource(
  getCommands: () => string[],
  getCwd: () => string | null,
) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    if (historyOpen(ctx.state)) return null;
    const word = ctx.matchBefore(WORD_RE);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    const line = ctx.state.doc.lineAt(word.from);
    const before = ctx.state.doc.sliceString(line.from, word.from);
    if (SEGMENT_START.test(before)) {
      return {
        from: word.from,
        options: commandOptions(word.text, getCommands),
        validFor: VALID_FOR,
      };
    }
    const cwd = getCwd();
    if (cwd) {
      const res = await pathCompletions(word.text, cwd);
      if (res?.options.length) {
        return {
          from: word.from + res.fromOffset,
          options: res.options,
          validFor: PATH_VALID_FOR,
        };
      }
    }
    return {
      from: word.from,
      options: docWordOptions(ctx, word.text),
      validFor: VALID_FOR,
    };
  };
}
