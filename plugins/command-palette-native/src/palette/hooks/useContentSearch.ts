import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { useCallback } from "react";
import { type AsyncQueryState, useAsyncQuery } from "./useAsyncQuery";

export const CONTENT_SEARCH_MIN_QUERY = 2;
const LIMIT = 80;
const DEBOUNCE_MS = 140;

export type ContentHit = {
  path: string;
  rel: string;
  line: number;
  text: string;
};

type GrepResponse = {
  hits: ContentHit[];
  truncated: boolean;
  files_scanned: number;
};

export function useContentSearch(
  root: string | null,
  term: string,
  enabled: boolean,
  files: WorkspaceFilesCapability,
  workspace: WorkspaceEnv,
  // The env owning `root`. Omitted by the command palette (a focused surface
  // where the global env is correct); the explorer/search sidebar passes the
  // rig-owned env so a stale `root` never hits the wrong backend.
): AsyncQueryState<ContentHit> {
  const run = useCallback(
    async (q: string): Promise<ContentHit[]> => {
      if (!root) return [];
      const res = (await files.grepInteractive(
        { pattern: q, root, maxResults: LIMIT },
        workspace,
      )) as GrepResponse;
      return res.hits;
    },
    [root, files, workspace],
  );

  return useAsyncQuery({
    enabled: enabled && !!root,
    term,
    minLength: CONTENT_SEARCH_MIN_QUERY,
    debounceMs: DEBOUNCE_MS,
    run,
  });
}
