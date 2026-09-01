import type { PluginModule } from "@termco/kernel";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import { WorkspaceRigsStore } from "./store";

type E2EHost = {
  __termco?: { e2e?: boolean };
  __termcoE2E?: Record<string, unknown>;
};

export function installWorkspaceRigsE2E(
  host: E2EHost,
  rigs: WorkspaceRigsCapability,
): () => void {
  if (!host.__termco?.e2e) return () => {};
  const seam = (host.__termcoE2E ??= {});
  const rigCreateLocal = (name: string, root: string) =>
    rigs.create({ name, root, workspace: { kind: "local" } }).id;
  const rigCreateSsh = (connectionId: string, root: string) =>
    rigs.create({
      name: connectionId,
      root,
      workspace: { kind: "ssh", connectionId, host: connectionId },
    }).id;
  const rigSetActive = (id: string) => rigs.activate(id);
  const envGet = () => {
    const snapshot = rigs.snapshot();
    return snapshot.rigs.find((rig) => rig.id === snapshot.activeId)?.workspace;
  };
  Object.assign(seam, { rigCreateLocal, rigCreateSsh, rigSetActive, envGet });
  return () => {
    if (seam.rigCreateLocal === rigCreateLocal) delete seam.rigCreateLocal;
    if (seam.rigCreateSsh === rigCreateSsh) delete seam.rigCreateSsh;
    if (seam.rigSetActive === rigSetActive) delete seam.rigSetActive;
    if (seam.envGet === envGet) delete seam.envGet;
  };
}

const plugin: PluginModule = {
  inject: [
    SETTINGS_PREFERENCES_SERVICE,
  ],
  async activate(context) {
    const store = new WorkspaceRigsStore(
      context.get<PreferencesCapability>("settings.preferences"),
    );
    await store.hydrate();
    context.provide<WorkspaceRigsCapability>("workspace.rigs", store);
    return installWorkspaceRigsE2E(window as unknown as E2EHost, store);
  },
};

export default plugin;
