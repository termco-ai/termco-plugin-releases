import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { WorkspaceEnv } from "@termco/workspace-base";
import type { ComponentType } from "react";

export interface SourceControlSectionProps {
  repoRoot: string;
  workspace: WorkspaceEnv;
  runInNewTerminal(command: string, cwd?: string): Promise<void>;
}

/** Optional section contributed into the selected Source Control sidebar. */
export interface SourceControlSectionContribution {
  id: string;
  label: string;
  order?: number;
  /** Full-height views receive a prominent switch beside Changes. Inline
   * sections keep the legacy placement above the commit composer. */
  placement?: "inline" | "view";
  Component: ComponentType<SourceControlSectionProps>;
}

export interface SourceControlSectionRegistry {
  register(entry: SourceControlSectionContribution, owner: ContributionOwner): Dispose;
  snapshot(): readonly SourceControlSectionContribution[];
  records(): readonly ContributionRecord<SourceControlSectionContribution>[];
  subscribe(listener: () => void): Dispose;
}
