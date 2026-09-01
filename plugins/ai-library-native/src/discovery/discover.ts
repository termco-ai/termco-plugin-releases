/**
 * Agent-config discovery.
 *
 * Runs the `DETECTORS` registry against a workspace root and returns every
 * recognized artifact. Workspace-agnostic: `native.readDir`/`readFile` carry the
 * given `env` (local / WSL / SSH), so a remote rig scans the remote host with
 * the same code. Uses `readDir` on explicit hidden paths (not glob) so a
 * gitignored backend configuration directory is still found. Cached briefly
 * per (scope, root).
 */

import type {
  WorkspaceDirEntry,
  WorkspaceFilesCapability,
} from "@termco/files-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { DETECTORS } from "./detectors";
import {
  fmDescription,
  fmName,
  fmWhenToUse,
  parseFrontmatter,
} from "./frontmatter";
import type {
  ArtifactKind,
  Detector,
  DiscoveredArtifact,
  DiscoveryResult,
} from "./types";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { result: DiscoveryResult; at: number }>();

function workspaceScopeKey(workspace: WorkspaceEnv): string {
  if (!workspace || workspace.kind === "local") return "local";
  if (workspace.kind === "wsl") return `wsl:${workspace.distro}`;
  return `ssh:${workspace.connectionId}`;
}

/** Kinds whose files we read + parse for a nicer name/description. */
const PARSED_KINDS = new Set<ArtifactKind>(["skill", "agent", "command"]);

function emptyCounts(): Record<ArtifactKind, number> {
  return {
    memory: 0,
    skill: 0,
    agent: 0,
    command: 0,
    mcp: 0,
    rules: 0,
    settings: 0,
  };
}

/** basename without a trailing extension. */
function baseName(path: string): string {
  const seg = path.split("/").pop() ?? path;
  return seg.replace(/\.[^.]+$/, "");
}

async function readText(
  files: WorkspaceFilesCapability,
  path: string,
  env: WorkspaceEnv | undefined,
): Promise<string | null> {
  try {
    const r = (await files.readFile(path, env, true)) as {
      kind?: string;
      content?: string;
    };
    return r.kind === "text" && typeof r.content === "string" ? r.content : null;
  } catch {
    return null;
  }
}

async function listDir(
  files: WorkspaceFilesCapability,
  path: string,
  env: WorkspaceEnv | undefined,
): Promise<WorkspaceDirEntry[]> {
  try {
    // `optional` → a missing directory resolves to [] without logging in main.
    return await files.readDir(path, true, false, env, true);
  } catch {
    return [];
  }
}

/** Cheap existence check — no content read (used for non-parsed file kinds). */
async function probeExists(
  files: WorkspaceFilesCapability,
  path: string,
  env: WorkspaceEnv | undefined,
): Promise<boolean> {
  try {
    // `optional` → a missing path resolves to null instead of throwing.
    return (await files.stat(path, env, true)) != null;
  } catch {
    return false;
  }
}

/** Turn a resolved file into an artifact, parsing frontmatter for rich kinds. */
async function toArtifact(
  files: WorkspaceFilesCapability,
  det: Detector,
  path: string,
  env: WorkspaceEnv | undefined,
  fallbackName: string,
): Promise<DiscoveredArtifact | null> {
  if (PARSED_KINDS.has(det.kind)) {
    const content = await readText(files, path, env);
    if (content === null) return null; // file gone / unreadable
    const fm = parseFrontmatter(content);
    return {
      detectorId: det.id,
      kind: det.kind,
      tool: det.tool,
      target: det.target,
      path,
      name: fmName(fm, fallbackName),
      description: fmDescription(fm) ?? fmWhenToUse(fm),
    };
  }
  return {
    detectorId: det.id,
    kind: det.kind,
    tool: det.tool,
    target: det.target,
    path,
    name: fallbackName,
  };
}

async function runDetector(
  files: WorkspaceFilesCapability,
  det: Detector,
  root: string,
  env: WorkspaceEnv | undefined,
): Promise<DiscoveredArtifact[]> {
  const out: DiscoveredArtifact[] = [];
  if (det.match.t === "file") {
    const path = `${root}/${det.match.path}`;
    if (PARSED_KINDS.has(det.kind)) {
      // Parsed kinds need the content (name/description from frontmatter).
      const a = await toArtifact(files, det, path, env, baseName(det.match.path));
      if (a) out.push(a);
    } else if (await probeExists(files, path, env)) {
      // Everything else only needs to exist — stat, don't read the whole file.
      out.push({
        detectorId: det.id,
        kind: det.kind,
        tool: det.tool,
        target: det.target,
        path,
        name: det.match.path.split("/").pop() ?? det.match.path,
      });
    }
    return out;
  }

  if (det.match.t === "dirChildren") {
    const dir = `${root}/${det.match.dir}`;
    const leaf = det.match.leaf;
    for (const e of await listDir(files, dir, env)) {
      if (e.kind !== "dir") continue;
      const path = leaf ? `${dir}/${e.name}/${leaf}` : `${dir}/${e.name}`;
      if (leaf) {
        const a = await toArtifact(files, det, path, env, e.name);
        if (a) out.push(a);
      } else {
        out.push({
          detectorId: det.id,
          kind: det.kind,
          tool: det.tool,
          target: det.target,
          path,
          name: e.name,
        });
      }
    }
    return out;
  }

  // dirFiles
  const dir = `${root}/${det.match.dir}`;
  const suffix = `.${det.match.ext}`;
  for (const e of await listDir(files, dir, env)) {
    if (e.kind !== "file" || !e.name.endsWith(suffix)) continue;
    const path = `${dir}/${e.name}`;
    const a = await toArtifact(files, det, path, env, e.name.slice(0, -suffix.length));
    if (a) out.push(a);
  }
  return out;
}

/**
 * Scan a workspace for agent-config artifacts. `env` overrides the global
 * workspace env (the sidebar passes a specific rig's env); omit for the
 * current env. Returns an empty result for a null/filesystem-root path.
 */
export async function discover(
  files: WorkspaceFilesCapability,
  root: string | null,
  env?: WorkspaceEnv,
  refresh = false,
): Promise<DiscoveryResult> {
  const scopeKey = workspaceScopeKey(env);
  const dir = (root ?? "").replace(/\/+$/, "");
  if (!dir) {
    return { root: dir, scopeKey, artifacts: [], counts: emptyCounts() };
  }

  const cacheKey = `${scopeKey}::${dir}`;
  const hit = refresh ? undefined : cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  // Detectors are independent — run them concurrently. This is the difference
  // between ~26 sequential round-trips and one batch, which matters most over
  // SSH where each probe is a network hop.
  const grouped = await Promise.all(
    DETECTORS.filter((d) => d.scope.includes("project")).map((det) =>
      runDetector(files, det, dir, env),
    ),
  );
  const artifacts = grouped.flat();

  const counts = emptyCounts();
  for (const a of artifacts) counts[a.kind] += 1;
  const result: DiscoveryResult = { root: dir, scopeKey, artifacts, counts };
  cache.set(cacheKey, { result, at: Date.now() });
  return result;
}

/** Test/refresh helper — drops the cache so the next scan re-reads disk. */
export function clearDiscoveryCache(): void {
  cache.clear();
}

/**
 * Synchronous read of the last scan for a root — used at send time to build the
 * skills menu without awaiting a scan (the sidebar detector warms the cache).
 * Returns null when the folder hasn't been scanned (or is empty/root).
 */
export function peekDiscovery(
  root: string | null,
  env?: WorkspaceEnv,
): DiscoveryResult | null {
  const scopeKey = workspaceScopeKey(env);
  const dir = (root ?? "").replace(/\/+$/, "");
  if (!dir) return null;
  return cache.get(`${scopeKey}::${dir}`)?.result ?? null;
}
