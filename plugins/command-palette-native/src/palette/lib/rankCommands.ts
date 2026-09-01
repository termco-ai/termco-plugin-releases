// Ranking for the in-memory command list: fuzzy relevance first, then
// most-recently-used order as the tiebreaker (and the sole order when the
// query is empty). Multi-word queries may match across the title,
// description, group, and keywords so users can search in natural language.

import type { PaletteItem } from "../types";
import { fuzzyBest } from "./fuzzy";
import { mruRank } from "./mru";

/**
 * Order `items` for display in the commands view.
 *
 * With an empty `term`, explicit product order wins and MRU breaks ties. With a term,
 * items are fuzzy-scored against their title, explanation, group, and
 * keywords. Each word may match a different field; non-matches are dropped,
 * and ties are broken by MRU recency.
 *
 * @param items Full command list to rank.
 * @param term Trimmed search term (may be empty).
 * @param mru Snapshot of usage timestamps keyed by command id.
 * @returns The matching items in display order.
 */
export function rankCommands(
  items: PaletteItem[],
  term: string,
  mru: Record<string, number>,
): PaletteItem[] {
  if (!term) {
    return [...items].sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        mruRank(mru, b.id) - mruRank(mru, a.id),
    );
  }
  const scored: { item: PaletteItem; s: number }[] = [];
  for (const item of items) {
    const candidates = [
      item.title,
      item.description ?? "",
      item.group,
      ...(item.keywords ?? []),
    ];
    const exact = fuzzyBest(term, candidates);
    const tokenScores = term
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => fuzzyBest(token, candidates));
    const tokenScore = tokenScores.every((score) => score !== null)
      ? tokenScores.reduce<number>((total, score) => total + (score ?? 0), 0)
      : null;
    const s = exact === null
      ? tokenScore
      : tokenScore === null
        ? exact
        : Math.max(exact, tokenScore);
    if (s !== null) scored.push({ item, s });
  }
  scored.sort(
    (a, b) =>
      b.s - a.s ||
      (a.item.order ?? 0) - (b.item.order ?? 0) ||
      mruRank(mru, b.item.id) - mruRank(mru, a.item.id),
  );
  return scored.map((x) => x.item);
}
