/**
 * Parse the raw `docker/podman inspect <id>` JSON (an array with one object)
 * into the rich detail the per-container inspector tab renders: identity,
 * environment (secret-flagged), labels, networks, mounts, ports, health,
 * resource limits. Deliberately defensive — podman/apple shapes vary and a
 * broken payload must yield empty sections, not throw. Pure; unit-tested.
 */
import { isSecretEnv } from "./secretMask";

export type EnvVar = { key: string; value: string; secret: boolean };
type Label = { key: string; value: string };
type NetworkInfo = {
  name: string;
  ip: string;
  gateway: string;
  mac: string;
};
type MountInfo = { type: string; src: string; dst: string; rw: boolean };
type HealthInfo = {
  status: string;
  failingStreak: number;
  lastOutput: string;
};
type ContainerIdentity = {
  shortId: string;
  imageRef: string;
  imageSha: string;
  created: string;
  command: string;
  workingDir: string;
  user: string;
  platform: string;
  restartPolicy: string;
  restartCount: number;
};
export type ContainerLimits = {
  memBytes: number;
  nanoCpus: number;
  pids: number;
};

/** One port entry. `hostPort` is null for an exposed-but-unpublished port. */
type PortMapping = {
  /** Display label, e.g. "8080→80/tcp" (published) or "80/tcp" (exposed). */
  label: string;
  hostPort: number | null;
  containerPort: number;
  proto: string;
};

export type ContainerDetail = {
  identity: ContainerIdentity;
  env: EnvVar[];
  labels: Label[];
  networks: NetworkInfo[];
  mounts: MountInfo[];
  ports: PortMapping[];
  health: HealthInfo | null;
  limits: ContainerLimits;
};

export function emptyDetail(): ContainerDetail {
  return {
    identity: {
      shortId: "",
      imageRef: "",
      imageSha: "",
      created: "",
      command: "",
      workingDir: "",
      user: "",
      platform: "",
      restartPolicy: "",
      restartCount: 0,
    },
    env: [],
    labels: [],
    networks: [],
    mounts: [],
    ports: [],
    health: null,
    limits: { memBytes: 0, nanoCpus: 0, pids: 0 },
  };
}

type PortBinding = { HostIp?: string; HostPort?: string };
type NetworkEntry = {
  IPAddress?: string;
  Gateway?: string;
  MacAddress?: string;
};
type InspectObject = {
  Id?: string;
  Created?: string;
  Image?: string;
  Platform?: string;
  Os?: string;
  Architecture?: string;
  RestartCount?: number;
  Config?: {
    Image?: string;
    Cmd?: string[] | null;
    Entrypoint?: string[] | null;
    Env?: string[] | null;
    Labels?: Record<string, string> | null;
    WorkingDir?: string;
    User?: string;
  };
  HostConfig?: {
    RestartPolicy?: { Name?: string };
    PortBindings?: Record<string, PortBinding[] | null> | null;
    Memory?: number;
    NanoCpus?: number;
    NanoCPUs?: number;
    PidsLimit?: number | null;
  };
  NetworkSettings?: {
    Ports?: Record<string, PortBinding[] | null> | null;
    Networks?: Record<string, NetworkEntry> | null;
  };
  Mounts?: Array<{
    Type?: string;
    Source?: string;
    Destination?: string;
    Name?: string;
    RW?: boolean;
  }> | null;
  State?: {
    Health?: {
      Status?: string;
      FailingStreak?: number;
      Log?: Array<{ Output?: string }> | null;
    } | null;
  };
};

function shortId(id: string): string {
  return id.replace(/^sha256:/, "").slice(0, 12);
}

function formatCreated(created: string): string {
  const d = new Date(created);
  return Number.isNaN(d.getTime())
    ? created
    : d.toISOString().replace("T", " ").replace(/\..*/, "");
}

export function parseInspect(json: string): ContainerDetail {
  let obj: InspectObject | undefined;
  try {
    const parsed = JSON.parse(json);
    obj = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return emptyDetail();
  }
  if (!obj || typeof obj !== "object") return emptyDetail();

  const detail = emptyDetail();
  const cfg = obj.Config ?? {};

  // Identity
  detail.identity = {
    shortId: obj.Id ? shortId(obj.Id) : "",
    imageRef: (cfg.Image ?? "").trim(),
    imageSha: obj.Image ? shortId(obj.Image) : "",
    created: obj.Created ? formatCreated(obj.Created) : "",
    command: [...(cfg.Entrypoint ?? []), ...(cfg.Cmd ?? [])].join(" ").trim(),
    workingDir: (cfg.WorkingDir ?? "").trim(),
    user: (cfg.User ?? "").trim(),
    platform:
      obj.Platform?.trim() ||
      [obj.Os, obj.Architecture].filter(Boolean).join("/"),
    restartPolicy: obj.HostConfig?.RestartPolicy?.Name ?? "",
    restartCount: obj.RestartCount ?? 0,
  };

  // Environment (KEY=value → {key,value,secret})
  for (const line of cfg.Env ?? []) {
    const eq = line.indexOf("=");
    const key = eq >= 0 ? line.slice(0, eq) : line;
    const value = eq >= 0 ? line.slice(eq + 1) : "";
    detail.env.push({ key, value, secret: isSecretEnv(key, value) });
  }

  // Labels
  for (const [key, value] of Object.entries(cfg.Labels ?? {})) {
    detail.labels.push({ key, value: String(value) });
  }

  // Networks
  for (const [name, n] of Object.entries(obj.NetworkSettings?.Networks ?? {})) {
    detail.networks.push({
      name,
      ip: (n?.IPAddress ?? "").trim(),
      gateway: (n?.Gateway ?? "").trim(),
      mac: (n?.MacAddress ?? "").trim(),
    });
  }

  // Mounts
  for (const m of obj.Mounts ?? []) {
    const src = m.Source ?? m.Name ?? "";
    const dst = m.Destination ?? "";
    if (!dst) continue;
    detail.mounts.push({
      type: (m.Type ?? "").trim() || "volume",
      src: src || "(anonymous)",
      dst,
      rw: m.RW !== false,
    });
  }

  // Ports (published host→container)
  const portMap =
    obj.NetworkSettings?.Ports && Object.keys(obj.NetworkSettings.Ports).length
      ? obj.NetworkSettings.Ports
      : (obj.HostConfig?.PortBindings ?? {});
  const seen = new Set<string>();
  for (const [cpProto, bindings] of Object.entries(portMap ?? {})) {
    const [cport, proto = "tcp"] = cpProto.split("/");
    const containerPort = Number(cport) || 0;
    if (Array.isArray(bindings) && bindings.length) {
      for (const b of bindings) {
        const hp = Number(b.HostPort);
        const label = `${b.HostPort}→${cport}/${proto}`;
        if (seen.has(label)) continue;
        seen.add(label);
        detail.ports.push({
          label,
          hostPort: Number.isInteger(hp) && hp > 0 ? hp : null,
          containerPort,
          proto,
        });
      }
    } else {
      const label = `${cport}/${proto}`;
      if (!seen.has(label)) {
        seen.add(label);
        detail.ports.push({ label, hostPort: null, containerPort, proto });
      }
    }
  }

  // Health
  const h = obj.State?.Health;
  if (h?.Status) {
    const log = h.Log ?? [];
    detail.health = {
      status: h.Status,
      failingStreak: h.FailingStreak ?? 0,
      lastOutput: (log[log.length - 1]?.Output ?? "").trim(),
    };
  }

  // Limits
  detail.limits = {
    memBytes: obj.HostConfig?.Memory ?? 0,
    nanoCpus: obj.HostConfig?.NanoCpus ?? obj.HostConfig?.NanoCPUs ?? 0,
    pids: obj.HostConfig?.PidsLimit ?? 0,
  };

  return detail;
}
