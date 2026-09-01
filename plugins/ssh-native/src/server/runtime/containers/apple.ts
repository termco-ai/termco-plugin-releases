/**
 * Apple `container` adapter (Apple's open-source container runtime, macOS 26+).
 * `container ls -a --format json` returns a JSON array whose shape is
 * container-object based: `{ status, configuration: { id, image: { reference }
 * } }`. The schema is younger and less documented than docker/podman, so the
 * parser is deliberately defensive. Exported for unit testing.
 */
import type {
  ContainerAction,
  ContainerStats,
  ContainerSummary,
  RuntimeAdapter,
} from "./types";
import { LOG_MAX_BYTES, ok, runCli, searchCli } from "./runner";

const BIN = "container";

interface AppleEntry {
  status?: string;
  configuration?: {
    id?: string;
    image?: { reference?: string } | string;
    createdAt?: string;
  };
}

function imageRef(image: AppleEntry["configuration"]): string {
  const img = image?.image;
  if (!img) return "";
  if (typeof img === "string") return img;
  return (img.reference ?? "").trim();
}

/** Parse `container ls` JSON-array output into normalized summaries. */
export function parseAppleList(stdout: string): ContainerSummary[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let rows: AppleEntry[];
  try {
    const parsed = JSON.parse(trimmed);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
  const out: ContainerSummary[] = [];
  for (const row of rows) {
    const id = (row.configuration?.id ?? "").trim();
    if (!id) continue;
    const state = (row.status ?? "").trim().toLowerCase();
    out.push({
      id,
      runtime: "apple",
      name: id, // Apple containers are addressed by their id/name
      image: imageRef(row.configuration),
      state,
      status: state ? state.charAt(0).toUpperCase() + state.slice(1) : "",
      ports: "", // Apple exposes networking per-container; not surfaced in ls
      created_at: (row.configuration?.createdAt ?? "").trim(),
    });
  }
  return out;
}

async function run(args: string[], timeout = 20) {
  return runCli(BIN, args, timeout);
}

export const appleAdapter: RuntimeAdapter = {
  runtime: "apple",

  async isAvailable(): Promise<boolean> {
    const out = await run(["--version"], 8);
    return ok(out);
  },

  async list(): Promise<ContainerSummary[]> {
    const out = await run(["ls", "-a", "--format", "json"]);
    if (!ok(out)) return [];
    return parseAppleList(out.stdout);
  },

  async action(id: string, action: ContainerAction): Promise<void> {
    // Apple's CLI has no `restart`; emulate it as stop-then-start.
    const verbs = action === "restart" ? ["stop", "start"] : [action];
    for (const verb of verbs) {
      const out = await run([verb, id], 30);
      if (!ok(out)) {
        throw new Error(out.stderr.trim() || `container ${verb} failed`);
      }
    }
  },

  async logs(id: string, tail: number): Promise<string> {
    // Apple `container logs` has no --tail; fetch (newest-biased, big budget)
    // and keep the last `tail` lines.
    const out = await runCli(BIN, ["logs", id], 20, {
      maxBytes: LOG_MAX_BYTES,
      keepTail: true,
    });
    if (out.spawnError) throw new Error("container not available");
    const text = [out.stdout, out.stderr].filter(Boolean).join("\n").trim();
    const lines = text.split("\n");
    return lines.length > tail ? lines.slice(-tail).join("\n") : text;
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
    const out = await run(["inspect", id], 20);
    if (!ok(out)) {
      throw new Error(out.stderr.trim() || "container inspect failed");
    }
    return out.stdout.trim();
  },

  async stats(_id: string): Promise<ContainerStats[]> {
    // Apple's `container` CLI has no stats verb — degrade to no live metrics.
    return [];
  },

  async imageInspect(_image: string): Promise<string> {
    // Apple's image-inspect shape is undocumented/divergent — skip gracefully.
    return "";
  },
};
