/**
 * Podman adapter. `podman ps -a --format json` emits a single JSON array whose
 * schema differs from docker's (Names is an array, Ports is a structured
 * array). The parser is exported for unit testing against fixtures.
 */
import type {
  ContainerAction,
  ContainerStats,
  ContainerSummary,
  RuntimeAdapter,
} from "./types";
import { LOG_MAX_BYTES, ok, runCli, searchCli } from "./runner";
import { parsePercent } from "./docker";

const BIN = "podman";

interface PodmanPort {
  host_ip?: string;
  container_port?: number;
  host_port?: number;
  protocol?: string;
}

interface PodmanPsEntry {
  Id?: string;
  Names?: string[] | string;
  Image?: string;
  State?: string;
  Status?: string;
  Ports?: PodmanPort[] | null;
  Created?: number | string;
  CreatedAt?: string;
}

function formatPorts(ports: PodmanPort[] | null | undefined): string {
  if (!Array.isArray(ports) || ports.length === 0) return "";
  return ports
    .map((p) => {
      const proto = p.protocol ?? "tcp";
      const cport = p.container_port ?? "";
      if (p.host_port) {
        const host = p.host_ip && p.host_ip !== "" ? p.host_ip : "0.0.0.0";
        return `${host}:${p.host_port}->${cport}/${proto}`;
      }
      return `${cport}/${proto}`;
    })
    .join(", ");
}

/** Parse `podman ps` JSON-array output into normalized summaries. */
export function parsePodmanList(stdout: string): ContainerSummary[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let rows: PodmanPsEntry[];
  try {
    const parsed = JSON.parse(trimmed);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  const out: ContainerSummary[] = [];
  for (const row of rows) {
    const fullId = (row.Id ?? "").trim();
    if (!fullId) continue;
    const name = Array.isArray(row.Names)
      ? (row.Names[0] ?? "").trim()
      : (row.Names ?? "").trim();
    out.push({
      id: fullId.slice(0, 12),
      runtime: "podman",
      name: name || fullId.slice(0, 12),
      image: (row.Image ?? "").trim(),
      state: (row.State ?? "").trim().toLowerCase(),
      status: (row.Status ?? "").trim(),
      ports: formatPorts(row.Ports),
      created_at: (row.CreatedAt ?? String(row.Created ?? "")).trim(),
    });
  }
  return out;
}

interface PodmanStatsEntry {
  // podman stats --format json uses these keys (strings with "%"/units).
  ContainerID?: string;
  Id?: string;
  Name?: string;
  CPU?: string; // "12.34%"
  CPUPerc?: string;
  MemUsage?: string; // "25.6MB / 7.6GB"
  MemPerc?: string; // "0.33%"
  NetIO?: string;
  BlockIO?: string;
  PIDS?: string | number;
  PIDs?: string | number;
}

/** Parse `podman stats --no-stream --format json` (a JSON array). */
export function parsePodmanStats(stdout: string): ContainerStats[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let rows: PodmanStatsEntry[];
  try {
    const parsed = JSON.parse(trimmed);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  const out: ContainerStats[] = [];
  for (const row of rows) {
    const fullId = (row.ContainerID ?? row.Id ?? "").trim();
    if (!fullId) continue;
    out.push({
      id: fullId.slice(0, 12),
      name: (row.Name ?? "").trim() || fullId.slice(0, 12),
      cpuPerc: parsePercent(row.CPU ?? row.CPUPerc),
      memUsage: (row.MemUsage ?? "").trim(),
      memPerc: parsePercent(row.MemPerc),
      netIO: (row.NetIO ?? "").trim(),
      blockIO: (row.BlockIO ?? "").trim(),
      pids: Number.parseInt(String(row.PIDS ?? row.PIDs ?? ""), 10) || 0,
    });
  }
  return out;
}

export const podmanAdapter: RuntimeAdapter = {
  runtime: "podman",

  async isAvailable(): Promise<boolean> {
    const out = await runCli(BIN, ["version", "--format", "{{.Server.Version}}"], 8);
    // Podman is daemonless; even without a running service `version` returns the
    // client, so a zero exit is a sufficient availability signal.
    return ok(out);
  },

  async list(): Promise<ContainerSummary[]> {
    const out = await runCli(BIN, ["ps", "-a", "--format", "json"]);
    if (!ok(out)) return [];
    return parsePodmanList(out.stdout);
  },

  async action(id: string, action: ContainerAction): Promise<void> {
    const out = await runCli(BIN, [action, id], 30);
    if (!ok(out)) {
      throw new Error(out.stderr.trim() || `podman ${action} failed`);
    }
  },

  async logs(id: string, tail: number): Promise<string> {
    const out = await runCli(BIN, ["logs", "--tail", String(tail), id], 20, {
      maxBytes: LOG_MAX_BYTES,
      keepTail: true,
    });
    if (out.spawnError) throw new Error("podman not available");
    return [out.stdout, out.stderr].filter(Boolean).join("\n").trim();
  },

  logsSearch(id, query, opts) {
    return searchCli(BIN, ["logs", id], {
      query,
      ignoreCase: !opts?.caseSensitive,
      regex: opts?.regex,
      context: opts?.context,
      maxMatches: opts?.maxMatches,
      timeoutSecs: 30,
    });
  },

  async inspect(id: string): Promise<string> {
    const out = await runCli(BIN, ["inspect", id], 20);
    if (!ok(out)) {
      throw new Error(out.stderr.trim() || "podman inspect failed");
    }
    return out.stdout.trim();
  },

  async stats(id: string): Promise<ContainerStats[]> {
    const out = await runCli(
      BIN,
      ["stats", "--no-stream", "--format", "json", id],
      12,
    );
    if (!ok(out)) return [];
    return parsePodmanStats(out.stdout);
  },

  async imageInspect(image: string): Promise<string> {
    const out = await runCli(BIN, ["image", "inspect", image], 20);
    return ok(out) ? out.stdout.trim() : "";
  },
};
