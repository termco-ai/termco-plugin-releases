import type { ShellHistoryCapability } from "@termco/terminal-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { useCallback } from "react";
import { type AsyncQueryState, useAsyncQuery } from "./useAsyncQuery";

const LIMIT = 60;
const DEBOUNCE_MS = 80;

export function useCommandHistory(
  term: string,
  enabled: boolean,
  history: ShellHistoryCapability,
  workspace: WorkspaceEnv,
): AsyncQueryState<string> {
  const run = useCallback(
    async (q: string) =>
      Array.from(new Set(await history.list(q, LIMIT, workspace))),
    [history, workspace],
  );

  return useAsyncQuery({
    enabled,
    term,
    minLength: 0,
    debounceMs: DEBOUNCE_MS,
    run,
  });
}
