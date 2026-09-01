/**
 * Agent-hook plumbing. Atomically writes OSC-777
 * completion hooks into supported agent configurations so Termco can detect agent
 * lifecycle from the terminal stream. The `agent_*` commands live in the
 * `agent` main plugin (electron/main/plugins/agent).
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { statusNeedle } from "./hooks";
import { existingConfig, mergeHooks } from "./merge";
import type { AgentSpec } from "./spec";

export function writeHooks(spec: AgentSpec, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  let content: string | null;
  try {
    content = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") content = null;
    else throw new Error(`read ${path}: ${(e as Error).message}`);
  }
  const existing = content === null ? {} : existingConfig(content, path);
  const merged = mergeHooks(existing, spec);
  const tmp = `${path}.termco-tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2));
  try {
    renameSync(tmp, path);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw new Error(`rename into ${path}: ${(e as Error).message}`);
  }
}

export function hooksStatusFor(spec: AgentSpec, content: string): boolean {
  return spec.events.every(([, marker]) => content.includes(statusNeedle(spec, marker)));
}
