import type { PluginModule } from "@termco/kernel";
import { SSH_CLIENT_SERVICE, type SshClientCapability } from "@termco/ssh-base";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import {
  UI_BACKGROUND_TASKS_SERVICE,
  type UiBackgroundContribution,
  type UiBackgroundRegistry,
} from "@termco/ui-shell-base";
import { WORKSPACE_RIGS_SERVICE, type WorkspaceRigsCapability } from "@termco/workspace-base";
import ui from "@termco/ui";
import { orderedConnectionIds } from "./order";

const { useEffect, useRef, useSyncExternalStore } = ui.React;
const PREWARM_STAGGER_MS = 400;

function createBackground(
  preferences: PreferencesCapability,
  ssh: SshClientCapability,
  workspaceRigs: WorkspaceRigsCapability,
) {
  return function SshAutoConnect() {
    const snapshot = useSyncExternalStore(
      (listener) => workspaceRigs.subscribe(listener),
      () => workspaceRigs.snapshot(),
      () => workspaceRigs.snapshot(),
    );
    const snapshotRef = useRef(snapshot);
    snapshotRef.current = snapshot;
    const doneRef = useRef(false);

    useEffect(() => {
      if (!snapshot.hydrated || doneRef.current) return;
      doneRef.current = true;
      let cancelled = false;
      const timers: number[] = [];
      void preferences.get<boolean>("reconnectSshOnStartup").then((enabled) => {
        if (cancelled || enabled === false) return;
        const current = snapshotRef.current;
        orderedConnectionIds(current.rigs, current.activeId).forEach((connectionId, index) => {
          const connect = () => void ssh.connectId(connectionId).catch(() => {});
          if (index === 0) connect();
          else timers.push(window.setTimeout(connect, index * PREWARM_STAGGER_MS));
        });
      }).catch(() => {});
      return () => {
        cancelled = true;
        for (const timer of timers) window.clearTimeout(timer);
      };
    }, [snapshot.hydrated]);
    return null;
  };
}

const plugin: PluginModule = {
  inject: [
    SETTINGS_PREFERENCES_SERVICE,
    SSH_CLIENT_SERVICE,
    WORKSPACE_RIGS_SERVICE,
    UI_BACKGROUND_TASKS_SERVICE,
  ],
  async activate(context) {
    const contribution: UiBackgroundContribution = {
      id: "ssh-auto-connect",
      label: "SSH startup resume",
      description: "Reconnects restored SSH rigs through the shared SSH provider.",
      Component: createBackground(
        context.get<PreferencesCapability>("settings.preferences"),
        context.get<SshClientCapability>("ssh.client"),
        context.get<WorkspaceRigsCapability>("workspace.rigs"),
      ),
    };
    await context.effect(() =>
      context.get<UiBackgroundRegistry>(UI_BACKGROUND_TASKS_SERVICE).register(
        contribution,
        { pluginId: "ssh-auto-connect", generation: context.generation, key: contribution.id },
      ),
    );
    const host = window as unknown as {
      __termco?: { e2e?: boolean };
      __termcoE2E?: Record<string, unknown>;
    };
    if (!host.__termco?.e2e) return;
    const description = () => contribution.description;
    const seam = (host.__termcoE2E ??= {});
    seam.sshAutoConnectDescription = description;
    return () => {
      if (seam.sshAutoConnectDescription === description) {
        delete seam.sshAutoConnectDescription;
      }
    };
  },
};

export default plugin;
