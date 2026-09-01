/**
 * Compact humanized formatting for the context meter.
 *
 * The estimator that used to live here is gone. It counted text and tool
 * payloads and ignored images entirely, so a chat with two screenshots read as
 * near-empty while it was actually close to the ceiling — and it disagreed with
 * the estimator the compaction ladder used, which is how the meter and the
 * thing it predicts drifted apart. Both now go through `lib/tokens`.
 */

import type { UIMessage } from "@ai-sdk/react";
import { countUIMessages } from "../../lib/tokens";

export function estimateTokens(messages: UIMessage[]): number {
  // `fast`: this runs on render, and the meter does not need BPE precision.
  return countUIMessages(messages, { fast: true });
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
