import type { ForgeRepository, ForgeReviewSummary } from "@termco/forge-reviews-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";

type ReviewTabLike = {
  kind: string;
  data?: unknown;
};

export const FORGE_REVIEW_TAB_KIND = "plugin:forge-review";

export interface ForgeReviewTabData {
  repository: ForgeRepository;
  review: ForgeReviewSummary;
}

export interface ForgeReviewTabLocation {
  id: number;
  rigId: string;
}

function reviewTabData(value: unknown): ForgeReviewTabData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<ForgeReviewTabData>;
  if (!data.repository || !data.review) return null;
  if (
    typeof data.repository.repoRoot !== "string" ||
    typeof data.repository.slug !== "string" ||
    typeof data.review.number !== "number" ||
    typeof data.review.title !== "string"
  )
    return null;
  return data as ForgeReviewTabData;
}

export function forgeReviewTabData(tab: ReviewTabLike): ForgeReviewTabData | null {
  if (tab.kind !== FORGE_REVIEW_TAB_KIND) return null;
  return reviewTabData(tab.data);
}

export function openForgeReviewTab(
  tabs: WorkspaceTabsCapability,
  repository: ForgeRepository,
  review: ForgeReviewSummary,
): ForgeReviewTabLocation {
  const snapshot = tabs.snapshot();
  const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeId);
  const rigId = active?.rigId ?? snapshot.activeRigIdForNewTabs;
  const existing = snapshot.tabs.find((tab) => {
    const data = forgeReviewTabData(tab);
    return (
      tab.rigId === rigId &&
      data?.repository.host === repository.host &&
      data.repository.slug === repository.slug &&
      data.review.number === review.number
    );
  });
  const title = `${repository.reviewNoun === "merge request" ? "MR" : "PR"} #${review.number}`;
  const data = { repository, review } satisfies ForgeReviewTabData;
  if (existing) {
    tabs.transition({
      tabs: snapshot.tabs.map((tab) =>
        tab.id === existing.id ? { ...tab, title, data, restoreOnRestart: false } : tab,
      ),
      activeId: existing.id,
    });
    return { id: existing.id, rigId };
  }
  const [id] = tabs.allocate(1);
  tabs.transition({
    tabs: [
      ...snapshot.tabs,
      {
        id,
        rigId,
        kind: FORGE_REVIEW_TAB_KIND,
        title,
        restoreOnRestart: false,
        data,
      },
    ],
    activeId: id,
  });
  return { id, rigId };
}

/** Remove review tabs restored by builds that persisted plugin tabs before
 * review tabs became explicitly non-restorable. Current live review tabs carry
 * an explicit false marker and are never touched, even after plugin reloads. */
export function discardRestoredForgeReviewTabs(tabs: WorkspaceTabsCapability): boolean {
  const snapshot = tabs.snapshot();
  if (!snapshot.initialized) return false;
  const stale = snapshot.tabs.filter(
    (tab) => tab.kind === FORGE_REVIEW_TAB_KIND && tab.restoreOnRestart !== false,
  );
  if (stale.length === 0) return false;
  const staleIds = new Set(stale.map((tab) => tab.id));
  const remaining = snapshot.tabs.filter((tab) => !staleIds.has(tab.id));
  const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeId);
  const fallback = active
    ? ([...remaining].reverse().find((tab) => tab.rigId === active.rigId)?.id ??
      remaining[0]?.id ??
      0)
    : snapshot.activeId;
  tabs.transition({
    tabs: remaining,
    ...(staleIds.has(snapshot.activeId) ? { activeId: fallback } : {}),
    ...(staleIds.has(snapshot.splitTabId) ? { splitTabId: 0 } : {}),
  });
  return true;
}
