import type { WorkspaceRig } from "@termco/workspace-base";

export function mcpRigs(
  rigs: readonly Pick<WorkspaceRig, "id" | "name" | "root" | "workspace">[],
): Array<{
  id: string;
  name: string;
  root: string;
}> {
  return rigs.flatMap((rig) => rig.root
    ? [{ id: rig.id, name: rig.name, root: rig.root }]
    : []);
}
