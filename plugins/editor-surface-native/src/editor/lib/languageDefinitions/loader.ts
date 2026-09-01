import type { StreamParser } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

/**
 * Helper for wrapping a CodeMirror legacy stream parser into an `Extension`.
 * Extracted from the former single `languageDefinitions.ts`.
 */

/** Wrap a legacy-mode `StreamParser` into a CodeMirror `Extension`, loading the
 *  `@codemirror/language` `StreamLanguage` helper lazily alongside the parser. */
export async function defineLanguage(
  parser: Promise<StreamParser<unknown>>,
): Promise<Extension> {
  const [{ StreamLanguage }, resolvedParser] = await Promise.all([
    import("@codemirror/language"),
    parser,
  ]);
  return StreamLanguage.define(resolvedParser);
}
