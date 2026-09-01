/**
 * Docker adapter. Uses the Docker CLI (`docker ps -a --format '{{json .}}'`),
 * which emits one JSON object per line. The parser is exported separately so it
 * can be unit-tested against captured fixtures without spawning docker.
 */
import type {
  ContainerAction,
  ContainerStats,
  ContainerSummary,
  RuntimeAdapter,
} from "./types";
import { LOG_MAX_BYTES, ok, runCli, searchCli } from "./runner";

const BIN = "docker";

interface DockerPsLine {
  ID?: string;
  Names?: string;
  Image?: string;
  State?: string;
  Status?: string;
  Ports?: string;
  CreatedAt?: string;
}

/** Parse `docker ps` line-delimited JSON into normalized summaries. */
export function parseDockerList(stdout: string): ContainerSummary[] {
  const out: ContainerSummary[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: DockerPsLine;
    try {
      row = JSON.parse(trimmed) as DockerPsLine;
    } catch {
      continue; // skip malformed lines rather than failing the whole list
    }
    const id = (row.ID ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      runtime: "docker",
      // `Names` can be a comma-separated list; show the first.
      name: (row.Names ?? "").split(",")[0]?.trim() || id,
      image: (row.Image ?? "").trim(),
      state: (row.State ?? "").trim().toLowerCase(),
      status: (row.Status ?? "").trim(),
      ports: (row.Ports ?? "").trim(),
      created_at: (row.CreatedAt ?? "").trim(),
    });
  }
  return out;
}

interface DockerStatsLine {
  ID?: string;
  Name?: string;
  CPUPerc?: string; // "12.34%"
  MemUsage?: string; // "25.6MiB / 7.6GiB"
  MemPerc?: string; // "0.33%"
  NetIO?: string; // "1.2MB / 3.4MB"
  BlockIO?: string; // "0B / 4.1kB"
  PIDs?: string; // "7"
}

/** Strip a trailing "%" and parse; NaN → 0. */
export function parsePercent(value: string | undefined): number {
  const n = Number.parseFloat((value ?? "").replace("%", "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Parse `docker stats --no-stream --format '{{json .}}'` line-delimited JSON. */
export function parseDockerStats(stdout: string): ContainerStats[] {
  const out: ContainerStats[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: DockerStatsLine;
    try {
      row = JSON.parse(trimmed) as DockerStatsLine;
    } catch {
      continue;
    }
    const id = (row.ID ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      name: (row.Name ?? "").trim() || id,
      cpuPerc: parsePercent(row.CPUPerc),
      memUsage: (row.MemUsage ?? "").trim(),
      memPerc: parsePercent(row.MemPerc),
      netIO: (row.NetIO ?? "").trim(),
      blockIO: (row.BlockIO ?? "").trim(),
      pids: Number.parseInt((row.PIDs ?? "").trim(), 10) || 0,
    });
  }
  return out;
}

export const dockerAdapter: RuntimeAdapter = {
  runtime: "docker",

  async isAvailable(): Promise<boolean> {
    // `docker version` talks to the daemon; a plain `--version` would pass even
    // when the daemon is down. We only want docker if we can actually query it.
    const out = await runCli(BIN, ["version", "--format", "{{.Server.Version}}"], 8);
    return ok(out) && out.stdout.trim().length > 0;
  },

  async list(): Promise<ContainerSummary[]> {
    const out = await runCli(BIN, ["ps", "-a", "--format", "{{json .}}"]);
    if (!ok(out)) return [];
    return parseDockerList(out.stdout);
  },

  async action(id: string, action: ContainerAction): Promise<void> {
    const out = await runCli(BIN, [action, id], 30);
    if (!ok(out)) {
      throw new Error(out.stderr.trim() || `docker ${action} failed`);
    }
  },

  async logs(id: string, tail: number): Promise<string> {
    // Docker sends container logs to both streams; merge them for display.
    // A large tail gets a bigger byte budget and keeps the NEWEST bytes.
    const out = await runCli(BIN, ["logs", "--tail", String(tail), id], 20, {
      maxBytes: LOG_MAX_BYTES,
      keepTail: true,
    });
    if (out.spawnError) throw new Error("docker not available");
    return [out.stdout, out.stderr].filter(Boolean).join("\n").trim();
  },

  logsSearch(id, query, opts) {
    // Stream the FULL log (no --tail) and keep only matching lines.
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
      throw new Error(out.stderr.trim() || "docker inspect failed");
    }
    return out.stdout.trim();
  },

  async stats(id: string): Promise<ContainerStats[]> {
    // --no-stream = one snapshot; fail soft so a stopped daemon degrades to [].
    const out = await runCli(
      BIN,
      ["stats", "--no-stream", "--format", "{{json .}}", id],
      12,
    );
    if (!ok(out)) return [];
    return parseDockerStats(out.stdout);
  },

  async imageInspect(image: string): Promise<string> {
    // Fail soft (return "") — the detail pane treats an empty payload as
    // "image details unavailable" rather than surfacing an error.
    const out = await runCli(BIN, ["image", "inspect", image], 20);
    return ok(out) ? out.stdout.trim() : "";
  },
};
