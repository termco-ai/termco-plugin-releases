/**
 * Pure container-runtime operations (list / adapter resolution / id validation),
 * shared by the local command registration (index.ts) and the remote Termco
 * Server. Kept free of any ssh/electron imports so it bundles into the server.
 */
import { appleAdapter } from "./apple";
import { dockerAdapter } from "./docker";
import { podmanAdapter } from "./podman";
import type { ContainerRuntime, ContainersListResult, RuntimeAdapter } from "./types";

const ADAPTERS: Record<ContainerRuntime, RuntimeAdapter> = {
  docker: dockerAdapter,
  podman: podmanAdapter,
  apple: appleAdapter,
};

const RUNTIMES: ContainerRuntime[] = ["docker", "podman", "apple"];

// Container ids/names are alphanumerics plus these separators — anything else is
// rejected before it reaches a spawn argument list.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function resolveAdapter(value: unknown): RuntimeAdapter {
  if (typeof value !== "string" || !(value in ADAPTERS)) {
    throw new Error(`unknown container runtime: ${String(value)}`);
  }
  return ADAPTERS[value as ContainerRuntime];
}

export function resolveId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new Error("invalid container id");
  }
  return value;
}

export async function listAll(): Promise<ContainersListResult> {
  // Probe availability and list in parallel; a runtime that is absent or whose
  // daemon is down resolves to `false` / `[]` without blanking the others.
  const results = await Promise.all(
    RUNTIMES.map(async (runtime) => {
      const adapter = ADAPTERS[runtime];
      const available = await adapter.isAvailable();
      if (!available) return { runtime, available, containers: [] };
      try {
        return { runtime, available, containers: await adapter.list() };
      } catch {
        return { runtime, available, containers: [] };
      }
    }),
  );

  const availability = { docker: false, podman: false, apple: false };
  const containers = [];
  for (const r of results) {
    availability[r.runtime] = r.available;
    containers.push(...r.containers);
  }
  return { containers, availability };
}
