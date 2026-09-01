export const CONTENT_SEARCH_MIN_QUERY = 2;
export const CONTENT_SEARCH_LIMIT = 80;
export const CONTENT_SEARCH_DEBOUNCE_MS = 140;

export interface ContentHit {
  path: string;
  rel: string;
  line: number;
  text: string;
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function contentHits(value: unknown): ContentHit[] {
  if (!value || typeof value !== "object") return [];
  const hits = (value as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  return hits.filter((hit): hit is ContentHit => Boolean(
    hit &&
      typeof hit === "object" &&
      typeof (hit as ContentHit).path === "string" &&
      typeof (hit as ContentHit).rel === "string" &&
      typeof (hit as ContentHit).line === "number" &&
      typeof (hit as ContentHit).text === "string",
  ));
}
