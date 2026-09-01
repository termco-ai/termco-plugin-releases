export function workingDiffKey(
  repoRoot: string,
  path: string,
  mode: "+" | "-",
): string {
  return `${repoRoot}\0${path}\0${mode}`;
}

export function invalidateDiff(key: string): void {
  window.dispatchEvent(
    new CustomEvent("termco:git-diff-invalidated", { detail: { key } }),
  );
}

export function invalidateRepoDiffs(repoRoot: string): void {
  window.dispatchEvent(
    new CustomEvent("termco:git-diff-invalidated", {
      detail: { repoRoot },
    }),
  );
}
