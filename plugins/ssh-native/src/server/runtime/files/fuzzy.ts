/**
 * Path-aware fuzzy ranking used by fs_search. Smart-case
 * subsequence match with word-boundary + consecutive-run bonuses; ties break
 * toward shorter relative paths.
 */
export interface Scorable {
  rel: string;
}

const BOUNDARY = "/._- ";

function scoreOne(rel: string, query: string, caseSensitive: boolean): number | null {
  const r = caseSensitive ? rel : rel.toLowerCase();
  const q = caseSensitive ? query : query.toLowerCase();
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let prevMatch = -2;
  for (let i = 0; i < r.length && qi < q.length; i++) {
    if (r[i] !== q[qi]) continue;
    let bonus = 1;
    const prevChar = i > 0 ? rel[i - 1] : "/";
    if (BOUNDARY.includes(prevChar)) {
      bonus += 10;
    } else if (i > 0 && /[a-z]/.test(rel[i - 1]) && /[A-Z]/.test(rel[i])) {
      bonus += 10; // camelCase boundary
    }
    if (prevMatch === i - 1) {
      consecutive += 1;
      bonus += consecutive * 5;
    } else {
      consecutive = 0;
    }
    score += bonus;
    prevMatch = i;
    qi += 1;
  }
  return qi === q.length ? score : null;
}

export function rankFuzzy<T extends Scorable>(
  cands: T[],
  query: string,
  cap: number,
): T[] {
  const caseSensitive = /[A-Z]/.test(query);
  const scored: { score: number; index: number }[] = [];
  for (let i = 0; i < cands.length; i++) {
    const s = scoreOne(cands[i].rel, query, caseSensitive);
    if (s != null) scored.push({ score: s, index: i });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return cands[a.index].rel.length - cands[b.index].rel.length;
  });
  return scored.slice(0, cap).map((s) => cands[s.index]);
}
