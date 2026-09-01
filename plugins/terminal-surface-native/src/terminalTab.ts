import type { UiTabDescriptor, UiTabsRuntime } from "@termco/ui-tabs-base";
import type { TerminalTab } from "./tabTypes";

/**
 * Convert the public tab read model into the terminal plugin's model. The
 * workspace is resolved from the tab's rig, never from the globally active
 * rig: all terminal surfaces stay mounted, so global state can belong to a
 * different rig by the time a pane creates its PTY.
 */
export function toTerminalTab(
  tab: UiTabDescriptor,
  runtime: Pick<UiTabsRuntime, "workspaceForRig">,
): TerminalTab | null {
  if (tab.kind !== "terminal") return null;
  const data = tab.data ?? {};
  const paneTree = data.paneTree;
  const activeLeafId = data.activeLeafId;
  if (!paneTree || typeof paneTree !== "object" || typeof activeLeafId !== "number") {
    return null;
  }
  return {
    id: tab.id,
    rigId: tab.rigId,
    workspace: runtime.workspaceForRig(tab.rigId),
    kind: "terminal",
    title: tab.title,
    cold: tab.cold,
    paneTree: paneTree as TerminalTab["paneTree"],
    activeLeafId,
    ...(typeof data.cwd === "string" ? { cwd: data.cwd } : {}),
    ...(typeof data.blocks === "boolean" ? { blocks: data.blocks } : {}),
    ...(typeof data.private === "boolean" ? { private: data.private } : {}),
    ...(typeof data.customTitle === "string" ? { customTitle: data.customTitle } : {}),
  };
}
