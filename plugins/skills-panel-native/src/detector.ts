import type { AiLibraryCapability, AiLibraryDiscoveryResult } from "@termco/ai-library-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import ui from "@termco/ui";

export type SkillsDetector = {
  count: number;
  result: AiLibraryDiscoveryResult | null;
  loading: boolean;
  refresh(): void;
};

let library: AiLibraryCapability | null = null;
export function detectorRuntimeActive(): boolean {
  return library !== null;
}
export function configureDetector(capability: AiLibraryCapability): () => void {
  library = capability;
  return () => {
    if (library === capability) library = null;
  };
}

export function useSkillsDetector(
  root: string | null,
  workspace: WorkspaceEnv,
): SkillsDetector {
  const [result, setResult] = ui.React.useState<AiLibraryDiscoveryResult | null>(null);
  const [loading, setLoading] = ui.React.useState(false);
  const request = ui.React.useRef(0);
  const workspaceKey = JSON.stringify(workspace ?? { kind: "local" });
  const scan = ui.React.useCallback((refresh = false) => {
    const selected = library;
    const id = ++request.current;
    if (!selected || !root) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void selected.discover(root, workspace, refresh).then((next) => {
      if (request.current === id) {
        setResult(next);
        setLoading(false);
      }
    }).catch(() => {
      if (request.current === id) setLoading(false);
    });
  }, [root, workspaceKey]);
  ui.React.useEffect(() => {
    setResult(null);
    scan();
  }, [scan]);
  ui.React.useEffect(() => {
    const focused = () => scan(true);
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, [scan]);
  return {
    count: result?.artifacts.length ?? 0,
    result,
    loading,
    refresh: () => scan(true),
  };
}
