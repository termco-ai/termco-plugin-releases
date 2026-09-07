import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { ForgeRepository, ForgeReviewSummary } from "@termco/forge-reviews-base";

export const REVIEWER_AGENT_ID = "builtin:reviewer";

/**
 * Start a clean reviewer conversation from trusted review identity fields.
 * The forge title/body are deliberately excluded because they are untrusted
 * repository content; the agent reads them through the review tools instead.
 */
export function startReviewConversation(
  ai: AiSessionsCapability,
  input: {
    repository: ForgeRepository;
    review: ForgeReviewSummary;
    rigId: string;
    exactHeadSha?: string | null;
  },
): void {
  const { repository, review, rigId, exactHeadSha = review.headSha } = input;
  const reference = `${repository.providerLabel} ${repository.host}/${repository.slug}#${review.number}`;
  ai.startConversation({
    agentId: REVIEWER_AGENT_ID,
    prefill: `Review ${reference}${exactHeadSha ? ` at exact head ${exactHeadSha}` : ""}. Use the forge review tools to inspect its current head, diff, checks, and discussions before drafting feedback. Create local draft comments for actionable findings; never publish them. The user will review and publish drafts from the review tab.`,
    workspace: { rigId, root: repository.repoRoot },
  });
}
