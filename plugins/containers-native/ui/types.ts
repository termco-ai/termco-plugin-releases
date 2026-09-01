/**
 * Renderer-side container types. Mirrors the snake_case payload shapes returned
 * by the main-process `containers_*` commands (see electron/main/containers).
 */

export type ContainerRuntime = "docker" | "podman" | "apple";

export type ContainerActionKind = "start" | "stop" | "restart";

export interface ContainerSummary {
  id: string;
  runtime: ContainerRuntime;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  created_at: string;
}

/** Live cpu/mem snapshot for one running container. Mirrors the main-process type. */
export interface ContainerStats {
  id: string;
  name: string;
  cpuPerc: number;
  memUsage: string;
  memPerc: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

/** One matching log line from a full-log search. */
export interface LogMatch {
  line: number;
  text: string;
  /** Up to `context` lines before the match, when context was requested. */
  before?: string[];
  /** Up to `context` lines after the match, when context was requested. */
  after?: string[];
}

/** Result of searching a container's entire log (streamed on the host). */
export interface LogSearchResult {
  matches: LogMatch[];
  scanned: number;
  matched: number;
  truncated: boolean;
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
