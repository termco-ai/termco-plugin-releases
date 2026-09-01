/**
 * Shared container types returned to the renderer. Fields are snake_case to
 * match the backend wire convention.
 */

import type { LogSearchResult } from "./runner";

export type { LogMatch, LogSearchResult } from "./runner";

/** Query options shared by the tool → IPC → adapter chain for log search. */
export interface LogSearchQueryOpts {
  maxMatches?: number;
  /** Treat the query as a JS regular expression instead of a substring. */
  regex?: boolean;
  /** Lines of context to include before and after each match (0–20). */
  context?: number;
  /** Match case-sensitively (default is case-insensitive). */
  caseSensitive?: boolean;
}

export type ContainerRuntime = "docker" | "podman" | "apple";

export type ContainerAction = "start" | "stop" | "restart";

/** One container, normalized across every runtime. */
export interface ContainerSummary {
  id: string; // short id
  runtime: ContainerRuntime;
  name: string;
  image: string;
  state: string; // running | exited | paused | created | ...
  status: string; // human text, e.g. "Up 3 hours"
  ports: string; // formatted, may be ""
  created_at: string; // raw runtime value
}

/** Live resource usage for one running container (a `docker stats` snapshot). */
export interface ContainerStats {
  id: string; // short id
  name: string;
  cpuPerc: number; // percent, e.g. 12.5
  memUsage: string; // human text, e.g. "25.6MiB / 7.6GiB"
  memPerc: number; // percent, e.g. 0.3
  netIO: string; // "1.2MB / 3.4MB" (rx / tx), may be ""
  blockIO: string; // "0B / 4.1kB", may be ""
  pids: number; // process count, 0 when unknown
}

export interface RuntimeAvailability {
  docker: boolean;
  podman: boolean;
  apple: boolean;
}

export interface ContainersListResult {
  containers: ContainerSummary[];
  availability: RuntimeAvailability;
}

/** A per-runtime adapter. `list()`/`stats()` fail soft (return [] when unavailable). */
export interface RuntimeAdapter {
  runtime: ContainerRuntime;
  isAvailable(): Promise<boolean>;
  list(): Promise<ContainerSummary[]>;
  action(id: string, action: ContainerAction): Promise<void>;
  logs(id: string, tail: number): Promise<string>;
  /** Search the FULL log (all lines, streamed) for matching lines. */
  logsSearch(
    id: string,
    query: string,
    opts?: LogSearchQueryOpts,
  ): Promise<LogSearchResult>;
  inspect(id: string): Promise<string>;
  /** Live cpu/mem snapshot for one container; [] when unavailable/unsupported. */
  stats(id: string): Promise<ContainerStats[]>;
  /** Raw `image inspect <ref>` JSON; "" when unavailable/unsupported. */
  imageInspect(image: string): Promise<string>;
}
