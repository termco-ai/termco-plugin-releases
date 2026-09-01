import { useEffect, useState, useSyncExternalStore } from "react";
import {
  currentWorkspaceEnv,
  subscribeTerminalGit,
  terminalGitSnapshot,
  terminalRuntime,
} from "./runtime";

export function useGitBranch(cwd: string | null, nonce = 0): string | null {
  const [branch, setBranch] = useState<string | null>(null);
  const gitAvailability = useSyncExternalStore(
    subscribeTerminalGit,
    terminalGitSnapshot,
    terminalGitSnapshot,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce is an explicit refresh trigger
  useEffect(() => {
    let alive = true;
    const git = terminalRuntime().git;
    if (!cwd || !git) {
      setBranch(null);
      return;
    }
    void git.resolveRepo(cwd, currentWorkspaceEnv()).then(
      (repo) => { if (alive) setBranch(repo?.branch || null); },
      () => { if (alive) setBranch(null); },
    );
    return () => { alive = false; };
  }, [cwd, nonce, gitAvailability]);
  return branch;
}
