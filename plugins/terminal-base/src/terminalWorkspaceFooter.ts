import type {
  UiWorkspaceComposerCapability,
  UiWorkspaceFooterContribution,
} from "@termco/ui-workspace-base";
import type { WorkspaceEnvironmentCapability } from "@termco/workspace-base";

/** Terminal-owned factory for the established block-input footer. A small
 * integration plugin supplies the selected AI composer, avoiding a dependency
 * from the shared terminal provider back into the AI product plugin. */
export interface TerminalWorkspaceFooterCapability {
  create(
    composer: UiWorkspaceComposerCapability,
    environment: WorkspaceEnvironmentCapability,
  ): UiWorkspaceFooterContribution;
}
