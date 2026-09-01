import type { WorkspaceRig } from "@termco/workspace-base";

type SshRig = Pick<WorkspaceRig, "id" | "name" | "root" | "workspace">;

export function orderedConnectionIds(
  rigs: readonly SshRig[],
  activeRigId: string | null,
): string[] {
  const active = rigs.find((rig) => rig.id === activeRigId);
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (rig: SshRig | undefined) => {
    const workspace = rig?.workspace;
    if (!workspace || workspace.kind !== "ssh" || seen.has(workspace.connectionId)) return;
    seen.add(workspace.connectionId);
    ordered.push(workspace.connectionId);
  };
  push(active);
  for (const rig of rigs) push(rig);
  return ordered;
}
