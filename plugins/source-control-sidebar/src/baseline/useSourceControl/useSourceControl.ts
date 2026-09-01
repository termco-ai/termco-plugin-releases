import { type GitRepoInfo, type GitStatusSnapshot } from "@termco/git-base";
import { type WorkspaceEnv } from "@termco/workspace-base";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { native, setSourceControlWorkspace } from "../../runtime";
import { getContextualAction, normalizeError, touchAutoFetch } from "./helpers";
import type {
  SourceControlRefreshMode,
  SourceControlRemoteActionMode,
  SourceControlRemoteActionResult,
  SourceControlSummary,
  SourceControlSummaryState,
} from "./types";

const AUTO_FETCH_THROTTLE_MS = 5 * 60_000;
const FOCUS_REFRESH_MIN_INTERVAL_MS = 1500;
// Skip the context-change refetch when the data is this fresh and the new path
// is still inside the loaded repo (cd-within-repo produces identical status).
const SC_STATUS_TTL_MS = 2000;

export function useSourceControl(
  contextPath: string | null,
  workspaceOrEnabled: WorkspaceEnv | boolean = { kind: "local" },
  enabledArg: boolean = true,
): SourceControlSummary {
  const workspaceEnv: WorkspaceEnv =
    typeof workspaceOrEnabled === "boolean"
      ? { kind: "local" }
      : workspaceOrEnabled;
  const enabled =
    typeof workspaceOrEnabled === "boolean" ? workspaceOrEnabled : enabledArg;
  setSourceControlWorkspace(workspaceEnv);
  const workspaceKey = JSON.stringify(workspaceEnv ?? { kind: "local" });
  const [state, setState] = useState<SourceControlSummaryState>({
    repo: null,
    status: null,
    hasRepo: false,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
  });
  const stateRef = useRef(state);
  const requestIdRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const inflightModeRef = useRef<SourceControlRefreshMode>("never");
  const autoFetchByRepoRef = useRef(new Map<string, number>());
  const enabledRef = useRef(enabled);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    requestIdRef.current++;
    inflightRef.current = null;
    inflightModeRef.current = "never";
    autoFetchByRepoRef.current.clear();
    setState({
      repo: null,
      status: null,
      hasRepo: false,
      isLoading: false,
      localError: null,
      busyAction: null,
      lastRemoteError: null,
    });
  }, [workspaceKey]);

  const applyStatus = useCallback(
    (updater: (status: GitStatusSnapshot) => GitStatusSnapshot) => {
      setState((current) => {
        if (!current.status) return current;
        const next = updater(current.status);
        if (next === current.status) return current;
        return { ...current, status: next };
      });
    },
    [],
  );

  const doRefresh = useCallback(
    async (remoteMode: SourceControlRefreshMode): Promise<void> => {
      if (!enabledRef.current) return;
      const requestId = ++requestIdRef.current;

      if (!contextPath) {
        setState({
          repo: null,
          status: null,
          hasRepo: false,
          isLoading: false,
          localError: null,
          busyAction: null,
          lastRemoteError: null,
        });
        return;
      }

      const activeRoot = stateRef.current.repo?.repoRoot ?? null;
      const reusableRoot =
        activeRoot &&
        (contextPath === activeRoot || contextPath.startsWith(`${activeRoot}/`))
          ? activeRoot
          : undefined;

      setState((current) => ({
        ...current,
        isLoading: true,
        localError: null,
      }));

      try {
        let repo: GitRepoInfo | null;
        let status: GitStatusSnapshot | null;

        if (reusableRoot) {
          try {
            repo = stateRef.current.repo ?? null;
            status = await native.gitStatus(reusableRoot);
            if (requestId !== requestIdRef.current) return;
            if (!repo || repo.repoRoot !== reusableRoot) {
              repo = {
                repoRoot: reusableRoot,
                branch: status.branch,
                upstream: status.upstream,
                isDetached: status.isDetached,
              };
            }
          } catch {
            const snapshot = await native.gitPanelSnapshot(contextPath);
            if (requestId !== requestIdRef.current) return;
            if (!snapshot.repo) {
              setState((current) => ({
                ...current,
                repo: null,
                status: null,
                hasRepo: false,
                isLoading: false,
                localError: null,
              }));
              return;
            }
            repo = snapshot.repo;
            status = snapshot.status ?? null;
          }
        } else {
          const snapshot = await native.gitPanelSnapshot(contextPath);
          if (requestId !== requestIdRef.current) return;
          if (!snapshot.repo) {
            setState((current) => ({
              ...current,
              repo: null,
              status: null,
              hasRepo: false,
              isLoading: false,
              localError: null,
            }));
            return;
          }
          repo = snapshot.repo;
          status = snapshot.status ?? null;
        }

        if (!repo) {
          setState((current) => ({
            ...current,
            repo: null,
            status: null,
            hasRepo: false,
            isLoading: false,
            localError: null,
          }));
          return;
        }

        const shouldAutoFetch =
          repo.upstream &&
          remoteMode !== "never" &&
          (remoteMode === "always" ||
            Date.now() - (autoFetchByRepoRef.current.get(repo.repoRoot) ?? 0) >=
              AUTO_FETCH_THROTTLE_MS);

        // undefined = no fetch ran; keep the current error then. stateRef lags
        // a synchronous follow-up refresh (runRemoteAction), so it must not be
        // the source of truth here.
        let fetchError: string | null | undefined;
        if (shouldAutoFetch) {
          try {
            await native.gitFetch(repo.repoRoot);
            touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
            fetchError = null;
            if (requestId !== requestIdRef.current) return;
            status = await native.gitStatus(repo.repoRoot);
            if (requestId !== requestIdRef.current) return;
          } catch (error) {
            fetchError = normalizeError(error);
          }
        }

        setState((current) => ({
          ...current,
          repo,
          status,
          hasRepo: true,
          isLoading: false,
          localError: null,
          lastRemoteError:
            fetchError === undefined ? current.lastRemoteError : fetchError,
        }));
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setState((current) => ({
          ...current,
          repo: null,
          hasRepo: false,
          status: null,
          isLoading: false,
          localError: normalizeError(error),
        }));
      } finally {
        lastRefreshAtRef.current = Date.now();
      }
    },
    [contextPath, workspaceKey],
  );

  const refresh = useCallback(
    async (options?: { remote?: SourceControlRefreshMode }) => {
      const remoteMode = options?.remote ?? "never";
      const inflight = inflightRef.current;
      if (inflight) {
        const cur = inflightModeRef.current;
        const upgrade =
          (cur === "never" && remoteMode !== "never") ||
          (cur === "auto" && remoteMode === "always");
        if (!upgrade) return inflight;
      }
      inflightModeRef.current = remoteMode;
      const run = doRefresh(remoteMode).finally(() => {
        if (inflightRef.current === run) {
          inflightRef.current = null;
          inflightModeRef.current = "never";
        }
      });
      inflightRef.current = run;
      return run;
    },
    [doRefresh],
  );

  const runRemoteAction = useCallback(
    async (
      mode: SourceControlRemoteActionMode = "contextual",
    ): Promise<SourceControlRemoteActionResult> => {
      const { repo, status } = stateRef.current;
      if (!repo || !status) {
        return { ok: false, action: null, blocked: "no-repo" };
      }
      if (!status.upstream) {
        return { ok: false, action: null, blocked: "missing-upstream" };
      }

      const action = mode === "contextual" ? getContextualAction(status) : mode;
      if (!action) {
        return { ok: false, action: null, blocked: "diverged" };
      }

      setState((current) => ({ ...current, busyAction: action }));

      try {
        if (action === "fetch") {
          await native.gitFetch(repo.repoRoot);
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
        } else if (action === "pull") {
          await native.gitFetch(repo.repoRoot);
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
          await native.gitPullFfOnly(repo.repoRoot);
        } else {
          await native.gitPush(repo.repoRoot);
        }
        setState((current) => ({ ...current, lastRemoteError: null }));
        await refresh({ remote: "never" });
        return { ok: true, action };
      } catch (error) {
        const message = normalizeError(error);
        setState((current) => ({ ...current, lastRemoteError: message }));
        await refresh({ remote: "never" }).catch(() => {});
        return { ok: false, action, error: message };
      } finally {
        setState((current) => ({ ...current, busyAction: null }));
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current++;
      setState({
        repo: null,
        status: null,
        hasRepo: false,
        isLoading: false,
        localError: null,
        busyAction: null,
        lastRemoteError: null,
      });
      return;
    }
    setState((current) => ({ ...current, lastRemoteError: null }));
    const run = () => {
      const root = stateRef.current.repo?.repoRoot;
      const sameRepo =
        !!root &&
        !!contextPath &&
        (contextPath === root || contextPath.startsWith(`${root}/`));
      const fresh = Date.now() - lastRefreshAtRef.current < SC_STATUS_TTL_MS;
      if (fresh && sameRepo && stateRef.current.hasRepo) return;
      void refresh({ remote: "never" });
    };
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(run, { timeout: 600 })
        : (window.setTimeout(run, 0) as unknown as number);
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        try {
          window.cancelIdleCallback(idle as number);
        } catch {
          /* noop */
        }
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, [refresh, contextPath, enabled, workspaceKey]);

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        const elapsed = Date.now() - lastRefreshAtRef.current;
        if (elapsed < FOCUS_REFRESH_MIN_INTERVAL_MS) return;
        void refresh({ remote: "never" });
      }, 400);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearTimeout(timer);
    };
  }, [refresh, enabled]);

  return useMemo<SourceControlSummary>(
    () => ({
      workspace: workspaceEnv,
      repo: state.repo,
      status: state.status,
      changedCount: state.status?.changedFiles.length ?? 0,
      upstream: state.status?.upstream ?? state.repo?.upstream ?? null,
      ahead: state.status?.ahead ?? 0,
      behind: state.status?.behind ?? 0,
      hasRepo: state.hasRepo,
      isLoading: state.isLoading,
      localError: state.localError,
      busyAction: state.busyAction,
      lastRemoteError: state.lastRemoteError,
      applyStatus,
      refresh,
      runRemoteAction,
    }),
    [workspaceEnv, state, applyStatus, refresh, runRemoteAction],
  );
}
