import type { SshForwardInfo } from "@termco/ssh-base";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { openContainerBrowser, containerSsh } from "./lib/integrations";
import { containersWorkspace } from "./lib/native";

export type RouteChoice = "same" | "auto" | number;
export type ForwardInfo = SshForwardInfo;

export interface ContainerPortForwardController {
  isSsh: boolean;
  forwardFor(hostPort: number): ForwardInfo | null;
  route(hostPort: number, choice: RouteChoice): Promise<void>;
  open(localPort: number): void;
  stop(id: string): void;
}

function previewUrl(port: number): string {
  return `http://localhost:${port}`;
}

export function useContainerPortForward(): ContainerPortForwardController {
  const workspace = containersWorkspace();
  const connectionId = workspace?.kind === "ssh" ? workspace.connectionId : null;
  const isSsh = connectionId !== null;
  const ssh = containerSsh();
  const [forwards, setForwards] = useState<ForwardInfo[]>([]);

  const refresh = useCallback(async () => {
    if (!connectionId) { setForwards([]); return; }
    setForwards(await ssh.forwardList(connectionId));
  }, [connectionId, ssh]);

  useEffect(() => {
    let active = true;
    if (!connectionId) { setForwards([]); return; }
    void ssh.forwardEnsure(connectionId).then((items) => {
      if (active) setForwards(items);
    }).catch(() => {});
    const timer = setInterval(() => void refresh().catch(() => {}), 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [connectionId, refresh, ssh]);

  const forwardFor = useCallback(
    (hostPort: number): ForwardInfo | null =>
      forwards.find((forward) =>
        forward.remotePort === hostPort && forward.remoteHost === "127.0.0.1") ?? null,
    [forwards],
  );

  const open = useCallback((localPort: number) => {
    openContainerBrowser(previewUrl(localPort));
  }, []);

  const route = useCallback(async (hostPort: number, choice: RouteChoice) => {
    if (!connectionId) { openContainerBrowser(previewUrl(hostPort)); return; }
    const localPort = choice === "same" ? hostPort : choice;
    try {
      const forward = await ssh.forwardAdd(connectionId, { localPort, remotePort: hostPort });
      await refresh();
      toast.success(`Forwarding :${hostPort} → localhost:${forward.localPort}`);
    } catch (error) {
      if (choice === "same" || typeof choice === "number") {
        try {
          const forward = await ssh.forwardAdd(connectionId, { localPort: "auto", remotePort: hostPort });
          await refresh();
          toast.success(`Port ${localPort} busy — forwarding :${hostPort} → localhost:${forward.localPort}`);
          return;
        } catch (fallbackError) { toast.error(errorText(fallbackError)); return; }
      }
      toast.error(errorText(error));
    }
  }, [connectionId, refresh, ssh]);

  const stop = useCallback((id: string) => {
    void ssh.forwardRemove(id).then(refresh).catch((error) => toast.error(errorText(error)));
  }, [refresh, ssh]);

  return { isSsh, forwardFor, route, open, stop };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Could not forward port";
}
