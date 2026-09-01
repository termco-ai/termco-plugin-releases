/**
 * Parse the human-formatted docker/podman `ps` ports column into a
 * host-port → container mapping, so detected listening ports can be labeled
 * with the container that owns them. Pure text → struct; never throws.
 *
 * Observed shapes (comma-separated):
 *   "0.0.0.0:8080->80/tcp"      published on all v4 interfaces
 *   ":::8080->80/tcp"           published on all v6 interfaces
 *   "127.0.0.1:5432->5432/tcp"  loopback-published
 *   "80/tcp"                    exposed but unpublished (no host port — skip)
 *   "0.0.0.0:7000-7002->7000-7002/tcp"  ranges (skipped, rare)
 */

export type ContainerPortOwner = {
  container: string;
  containerPort: number;
};

type RawPort = {
  port: number;
  addresses: string[];
  loopbackOnly: boolean;
  process: string | null;
};

type ContainerLike = { name: string; ports: string };

export type DetectedPort = RawPort & {
  container: ContainerPortOwner | null;
};

/**
 * Label each listening port with the docker/podman container publishing it,
 * where one can be matched by host port. Pure — shared by the one-shot scan
 * command (over RPC results) and the server-side state hub (local results).
 */
export function joinDetectedPorts(
  ports: RawPort[],
  containers: ContainerLike[],
): DetectedPort[] {
  const owners = new Map<number, ContainerPortOwner>();
  for (const c of containers) parseDockerPorts(c.ports, c.name, owners);
  return ports.map((p) => ({ ...p, container: owners.get(p.port) ?? null }));
}

export function parseDockerPorts(
  ports: string,
  containerName: string,
  into: Map<number, ContainerPortOwner> = new Map(),
): Map<number, ContainerPortOwner> {
  for (const piece of ports.split(",")) {
    const spec = piece.trim();
    if (!spec || !spec.includes("->")) continue; // unpublished / empty
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
    if (!into.has(hostPort)) {
      into.set(hostPort, { container: containerName, containerPort });
    }
  }
  return into;
}
