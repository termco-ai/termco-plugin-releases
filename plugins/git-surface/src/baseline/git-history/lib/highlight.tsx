/**
 * Case-insensitive substring highlighter for search matches.
 *
 * Produces a React node with the first matched span wrapped in a `<mark>`.
 * Kept in its own `.tsx` file (separate from the pure `format.ts` helpers)
 * because it returns JSX.
 */
import type { ReactNode } from "react";

/**
 * Wrap the first case-insensitive occurrence of `query` within `text` in a
 * highlight `<mark>`. Returns `text` unchanged when the query is empty or
 * has no match.
 */
export function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/25 px-0.5 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
