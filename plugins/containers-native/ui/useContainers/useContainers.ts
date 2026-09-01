/**
 * Data hook for the Containers panel. Owns the container list plus loading /
 * error state, and exposes refresh + per-row lifecycle/logs/inspect actions.
 *
 * Modeled on useSourceControl: a single state object, a stale-response guard
 * (requestIdRef), in-flight de-duplication, an interval auto-poll while mounted,
 * and a throttled window-focus refresh — because container state drifts over
 * time (a container can exit or be started outside the app).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { containersNative, containersWorkspace } from "../lib/native";
import type {
  ContainerActionKind,
  ContainersListResult,
  ContainerSummary,
  RuntimeAvailability,
} from "../types";

const POLL_INTERVAL_MS = 5000;
const FOCUS_REFRESH_MIN_INTERVAL_MS = 1500;

const NO_RUNTIMES: RuntimeAvailability = {
  docker: false,
  podman: false,
  apple: false,
};

interface ContainersState {
  containers: ContainerSummary[];
  availability: RuntimeAvailability;
  isLoading: boolean;
  error: string | null;
  /** `${runtime}:${id}` of the row with a lifecycle action in flight. */
  busyKey: string | null;
  /** True once at least one list has resolved (drives first-load spinner). */
  loaded: boolean;
}

export interface ContainersController {
  containers: ContainerSummary[];
  availability: RuntimeAvailability;
  isLoading: boolean;
  error: string | null;
  busyKey: string | null;
  loaded: boolean;
  anyRuntimeAvailable: boolean;
  refresh: () => Promise<void>;
  runAction: (
    row: ContainerSummary,
    action: ContainerActionKind,
  ) => Promise<void>;
  fetchLogs: (row: ContainerSummary, tail?: number) => Promise<string>;
  fetchInspect: (row: ContainerSummary) => Promise<string>;
}

export function rowKey(row: { runtime: string; id: string }): string {
  return `${row.runtime}:${row.id}`;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export function useContainers(): ContainersController {
  const [state, setState] = useState<ContainersState>({
    containers: [],
    availability: NO_RUNTIMES,
    isLoading: false,
    error: null,
    busyKey: null,
    loaded: false,
  });

  const requestIdRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const lastFocusRefreshRef = useRef(0);

  // The list is scoped to the active rig's workspace (local vs a specific ssh
  // host). Track its key so we can drop stale rows + refetch on a rig switch.
  const environment = containersWorkspace();
  const workspaceKey = environment?.kind === "ssh"
    ? `ssh:${environment.connectionId}`
    : environment?.kind === "wsl"
      ? `wsl:${environment.distro}`
      : "local";

  const applyResult = useCallback((result: ContainersListResult) => {
    setState((c) => ({
      ...c,
      containers: result.containers,
      availability: result.availability,
      isLoading: false,
      error: null,
      loaded: true,
    }));
  }, []);

  const doRefresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState((c) => ({ ...c, isLoading: true }));
    try {
      const result = await containersNative.list();
      if (requestId !== requestIdRef.current) return; // stale response
      applyResult(result);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState((c) => ({
        ...c,
        isLoading: false,
        error: normalizeError(error),
        loaded: true,
      }));
    }
  }, [applyResult]);

  const refresh = useCallback(async () => {
    // Coalesce concurrent refreshes (poll + manual + focus) into one request.
    const inflight = inflightRef.current;
    if (inflight) return inflight;
    const run = doRefresh().finally(() => {
      if (inflightRef.current === run) inflightRef.current = null;
    });
    inflightRef.current = run;
    return run;
  }, [doRefresh]);

  // Initial load + interval auto-poll while the panel is mounted. The shared
  // provider routes each request to the selected local/WSL/SSH workspace.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // On a rig switch (workspace change), immediately drop the previous rig's
  // rows and refetch for the new one — otherwise the panel shows stale data
  // until the next poll. Skips the initial mount (handled above).
  const mountedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: workspaceKey is the change trigger, not read in the body
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    requestIdRef.current++; // invalidate any in-flight response for the old rig
    inflightRef.current = null;
    setState((c) => ({
      ...c,
      containers: [],
      availability: NO_RUNTIMES,
      error: null,
      loaded: false,
      isLoading: true,
    }));
    void refresh();
  }, [workspaceKey, refresh]);

  // Refresh when the window regains focus (throttled).
  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < FOCUS_REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      lastFocusRefreshRef.current = now;
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const runAction = useCallback(
    async (row: ContainerSummary, action: ContainerActionKind) => {
      const key = rowKey(row);
      setState((c) => ({ ...c, busyKey: key }));
      try {
        await containersNative.action(row.runtime, row.id, action);
        toast.success(`${action} ${row.name}`);
        await refresh();
      } catch (error) {
        toast.error(normalizeError(error));
      } finally {
        setState((c) => (c.busyKey === key ? { ...c, busyKey: null } : c));
      }
    },
    [refresh],
  );

  const fetchLogs = useCallback(
    (row: ContainerSummary, tail?: number) =>
      containersNative.logs(row.runtime, row.id, tail),
    [],
  );

  const fetchInspect = useCallback(
    (row: ContainerSummary) => containersNative.inspect(row.runtime, row.id),
    [],
  );

  const anyRuntimeAvailable =
    state.availability.docker ||
    state.availability.podman ||
    state.availability.apple;

  return useMemo<ContainersController>(
    () => ({
      containers: state.containers,
      availability: state.availability,
      isLoading: state.isLoading,
      error: state.error,
      busyKey: state.busyKey,
      loaded: state.loaded,
      anyRuntimeAvailable,
      refresh,
      runAction,
      fetchLogs,
      fetchInspect,
    }),
    [state, anyRuntimeAvailable, refresh, runAction, fetchLogs, fetchInspect],
  );
}
