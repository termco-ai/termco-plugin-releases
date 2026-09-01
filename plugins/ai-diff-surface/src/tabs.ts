import type { UiTabDescriptor } from "@termco/ui-tabs-base";
import type { AiDiffStatus, AiDiffTab } from "./tabTypes";

function text(
  data: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string {
  const value = data?.[key];
  return typeof value === "string" ? value : "";
}

function status(
  data: Readonly<Record<string, unknown>> | undefined,
): AiDiffStatus {
  const value = data?.status;
  return value === "approved" || value === "rejected" ? value : "pending";
}

export function toAiDiffTab(tab: UiTabDescriptor): AiDiffTab | null {
  if (tab.kind !== "ai-diff" || tab.cold) return null;
  const path = tab.path ?? text(tab.data, "path");
  const approvalId = text(tab.data, "approvalId");
  if (!path || !approvalId) return null;
  return {
    id: tab.id,
    rigId: tab.rigId,
    kind: "ai-diff",
    title: tab.title,
    path,
    originalContent: text(tab.data, "originalContent"),
    proposedContent: text(tab.data, "proposedContent"),
    approvalId,
    status: status(tab.data),
    isNewFile: tab.data?.isNewFile === true,
  };
}
