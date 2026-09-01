/**
 * Editor-side formatting glue: sends the CURRENT buffer to the main process
 * (`format_document` — project CLI like biome/prettier first, LSP formatting
 * as fallback) and applies the result as a MINIMAL edit (common prefix/suffix
 * stripped) so the cursor and scroll position survive. Fail-open: any error
 * leaves the buffer untouched.
 */
import type { WorkspaceEnv } from "../../workspace";
import { invoke } from "../../platform";
import type { EditorView } from "@codemirror/view";

export type FormatOutcome =
  | { changed: boolean; formatter: string }
  | { skipped: string };

/** Replace the doc with `next` touching only the differing middle span. */
export function applyMinimalEdit(view: EditorView, next: string): boolean {
  const current = view.state.doc.toString();
  if (current === next) return false;
  let start = 0;
  const minLength = Math.min(current.length, next.length);
  while (start < minLength && current[start] === next[start]) start++;
  let currentEnd = current.length;
  let nextEnd = next.length;
  while (
    currentEnd > start &&
    nextEnd > start &&
    current[currentEnd - 1] === next[nextEnd - 1]
  ) {
    currentEnd--;
    nextEnd--;
  }
  view.dispatch({
    changes: {
      from: start,
      to: currentEnd,
      insert: next.slice(start, nextEnd),
    },
  });
  return true;
}

export async function formatEditor(
  view: EditorView,
  env: WorkspaceEnv,
  rigRoot: string | null,
  path: string,
): Promise<FormatOutcome> {
  const text = view.state.doc.toString();
  let result: { formatted: string | null; formatter?: string; reason?: string };
  try {
    result = (await invoke("format_document", {
      workspace: env,
      rigRoot,
      path,
      text,
    })) as typeof result;
  } catch (e) {
    return { skipped: String(e) };
  }
  if (result.formatted == null) {
    return { skipped: result.reason ?? "no formatter" };
  }
  // The user kept typing while the formatter ran — don't clobber their edits.
  if (view.state.doc.toString() !== text) {
    return { skipped: "buffer changed during formatting" };
  }
  const changed = applyMinimalEdit(view, result.formatted);
  return { changed, formatter: result.formatter ?? "formatter" };
}
