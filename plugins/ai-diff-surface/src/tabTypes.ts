export type AiDiffStatus = "pending" | "approved" | "rejected";

type TabBase = {
  id: number;
  rigId: string;
  title: string;
  cold?: boolean;
};

export type AiDiffTab = TabBase & {
  kind: "ai-diff";
  path: string;
  originalContent: string;
  proposedContent: string;
  approvalId: string;
  status: AiDiffStatus;
  isNewFile: boolean;
};

export type OtherTab = TabBase & { kind: string };
export type Tab = AiDiffTab | OtherTab;
