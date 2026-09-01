export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
export function isMarkdownPath(path: string): boolean {
  return /\.(?:md|mdx|markdown)$/i.test(path);
}
