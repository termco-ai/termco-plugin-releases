import type { UiCommandItem } from "@termco/ui-commands-base";
import type {
  WorkspaceRigOverviewCapability,
  WorkspaceRigWorkflowsCapability,
  WorkspaceRigsCapability,
} from "@termco/workspace-base";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";

export function rigCommands(
  workspaceRigs: WorkspaceRigsCapability,
  rigOverview: WorkspaceRigOverviewCapability,
  workflows: WorkspaceRigWorkflowsCapability,
): UiCommandItem[] {
  return [
    ...rigNavigationCommands(workspaceRigs, rigOverview),
    rigCreationCommand(workflows),
  ];
}

export function rigCreationCommand(
  workflows: WorkspaceRigWorkflowsCapability,
): UiCommandItem {
  return {
    id: "rigs.new",
    title: "New Rig",
    description: "Create a rig from the current workspace.",
    group: "Rigs",
    order: 100,
    keywords: ["rig", "session", "workspace", "group", "create"],
    icon: DashboardSquare01Icon,
    run: () => {
      workflows.createLocal();
    },
  };
}

export function rigNavigationCommands(
  workspaceRigs: WorkspaceRigsCapability,
  rigOverview: WorkspaceRigOverviewCapability,
): UiCommandItem[] {
  const { rigs, activeId } = workspaceRigs.snapshot();
  const onlyOneRig = rigs.length < 2 ? "Only one rig" : undefined;
  return [
    {
      id: "rigs.overview",
      title: "Rigs: Overview",
      description: "Open the complete workspace rig overview.",
      group: "Rigs",
      order: 0,
      keywords: ["rigs", "sessions", "overview", "organize", "manage", "move"],
      icon: DashboardSquare01Icon,
      shortcutId: "rig.overview",
      run: () => rigOverview.setOpen(true),
    },
    {
      id: "rigs.next",
      title: "Next rig",
      description: "Activate the next workspace rig.",
      group: "Rigs",
      order: 10,
      keywords: ["rig", "cycle", "switch", "next"],
      icon: DashboardSquare01Icon,
      shortcutId: "rig.next",
      disabledReason: onlyOneRig,
      run: () => workspaceRigs.cycle(1),
    },
    {
      id: "rigs.prev",
      title: "Previous rig",
      description: "Activate the previous workspace rig.",
      group: "Rigs",
      order: 20,
      keywords: ["rig", "cycle", "switch", "previous"],
      icon: DashboardSquare01Icon,
      shortcutId: "rig.prev",
      disabledReason: onlyOneRig,
      run: () => workspaceRigs.cycle(-1),
    },
    ...rigs.map((rig, index): UiCommandItem => ({
      id: `rigs.switch.${rig.id}`,
      title: `Switch to ${rig.name}`,
      description: `Activate the ${rig.name} workspace rig.`,
      group: "Rigs",
      order: 30 + index,
      keywords: ["rig", "switch", "session", rig.name],
      icon: DashboardSquare01Icon,
      disabledReason: rig.id === activeId ? "Current rig" : undefined,
      run: () => workspaceRigs.activate(rig.id),
    })),
  ];
}
