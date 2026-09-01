import type { SshDetectedPort, SshForwardInfo } from "@termco/ssh-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export const FORWARD_REFRESH_MS = 1_000;
export const BADGE_REFRESH_MS = 2_000;
export const PORT_SCAN_REFRESH_MS = 5_000;

export function connectionIdFor(workspace: WorkspaceEnv): string | null {
  return workspace?.kind === "ssh" ? workspace.connectionId : null;
}

export function sshdPortFor(workspace: WorkspaceEnv): number {
  return workspace?.kind === "ssh" ? (workspace.port ?? 22) : 22;
}

export function activeForwardCount(forwards: SshForwardInfo[]): number {
  return forwards.filter((forward) => forward.state === "active").length;
}

export function parsePort(value: string): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : null;
}

export function sortDetectedPorts(
  ports: SshDetectedPort[],
  sshdPort: number,
): SshDetectedPort[] {
  return [...ports].sort((a, b) => {
    const aSshd = a.port === sshdPort ? 1 : 0;
    const bSshd = b.port === sshdPort ? 1 : 0;
    return aSshd - bSshd || a.port - b.port;
  });
}
