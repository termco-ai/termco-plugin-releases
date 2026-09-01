/**
 * Parse the docker/podman `ps` Ports column (as carried on
 * ContainerSummary.ports) into short chip strings for the sidebar card. Renderer
 * copy of the pure logic in electron/main/ssh/dockerPorts.ts (that module lives
 * on the main-process side of the boundary). Only PUBLISHED host mappings become
 * chips; unpublished/exposed and ranges are skipped.
 *
 * "0.0.0.0:8080->80/tcp, :::8080->80/tcp" → ["8080→80"]  (deduped by host port)
 */
export type PublishedPort = { hostPort: number; label: string };

export function parsePublishedPorts(ports: string): PublishedPort[] {
  const byHost = new Map<number, PublishedPort>();
  for (const piece of ports.split(",")) {
    const spec = piece.trim();
    if (!spec?.includes("->")) continue;
    const [hostSide, containerSide] = spec.split("->");
    const colon = hostSide.lastIndexOf(":");
    if (colon < 0) continue;
    const hostPort = Number(hostSide.slice(colon + 1));
    const containerPort = Number.parseInt(containerSide, 10);
    if (
      !Number.isInteger(hostPort) ||
      hostPort < 1 ||
      hostPort > 65535 ||
      !Number.isInteger(containerPort)
    ) {
      continue;
    }
    if (!byHost.has(hostPort)) {
      byHost.set(hostPort, {
        hostPort,
        label: hostPort === containerPort ? `${hostPort}` : `${hostPort}→${containerPort}`,
      });
    }
  }
  return [...byHost.values()];
}
