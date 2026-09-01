import type { WorkspaceEnv } from "@termco/workspace-base";

export type EditorTab = {
  id: number;
  rigId: string;
  kind: "editor";
  title: string;
  path: string;
  dirty: boolean;
  preview: boolean;
  cold?: boolean;
  overrideLanguage?: string | null;
  workspace: WorkspaceEnv;
  rigRoot: string | null;
};
export type AiDiffTab = {
  id: number;
  rigId: string;
  kind: "ai-diff";
  title: string;
  path: string;
  approvalId: string;
  status: "pending" | "approved" | "rejected";
};
export type Tab = EditorTab | AiDiffTab;
