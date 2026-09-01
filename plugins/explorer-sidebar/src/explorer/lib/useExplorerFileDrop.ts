import type { WorkspaceEnv } from "@termco/workspace-base";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { explorerRuntime } from "../../runtime";

type Options = {
  rootPath: string | null;
  /** The env owning `rootPath` (the active rig's) — not the global env. */
  env: WorkspaceEnv;
  isDir: (path: string) => boolean | undefined;
  onCopied: (destDir: string) => void;
};

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : path;
}

// The drop point may arrive in physical pixels on some platforms; scale down
// only when it overflows the logical viewport (mirrors the terminal drop).
function dirAt(
  x: number,
  y: number,
  rootPath: string | null,
  isDir: (p: string) => boolean | undefined,
): string | null {
  let lx = x;
  let ly = y;
  if (x > window.innerWidth || y > window.innerHeight) {
    const dpr = window.devicePixelRatio || 1;
    lx = x / dpr;
    ly = y / dpr;
  }
  const el = document.elementFromPoint(lx, ly) as HTMLElement | null;
  if (!el) return null;
  const row = el.closest<HTMLElement>("[data-fs-path]");
  if (row) {
    const p = row.getAttribute("data-fs-path") as string;
    return isDir(p) ? p : parentDir(p);
  }
  if (el.closest("[data-explorer-drop]")) return rootPath;
  return null;
}

// Accepts files dropped from the OS onto an explorer folder (copy, not move),
// via the native drag-drop bridge. One webview-level listener; ignores drops that
// land outside the explorer (the terminal handles its own).
export function useExplorerFileDrop({
  rootPath,
  env,
  isDir,
  onCopied,
}: Options) {
  const [targetDir, setTargetDir] = useState<string | null>(null);
  const optsRef = useRef({ rootPath, env, isDir, onCopied });
  optsRef.current = { rootPath, env, isDir, onCopied };

  useEffect(() => {
    let unlisten = () => {};
    try {
      unlisten = explorerRuntime().desktop.subscribeDragDrop((p) => {
        const { rootPath, isDir, onCopied } = optsRef.current;
        if (p.type === "enter" || p.type === "over") {
          setTargetDir(dirAt(p.position.x, p.position.y, rootPath, isDir));
          return;
        }
        if (p.type === "leave") {
          setTargetDir(null);
          return;
        }
        if (p.type === "drop") {
          const dir = dirAt(p.position.x, p.position.y, rootPath, isDir);
          setTargetDir(null);
          if (!dir || p.paths.length === 0) return;
          void explorerRuntime()
            .files.copy(p.paths, dir, optsRef.current.env)
            .then(() => onCopied(dir))
            .catch((err) => toast.error(`Copy failed: ${String(err)}`));
        }
      });
    } catch (error) {
      console.error("[termco] explorer drop listen failed:", error);
    }

    return () => {
      setTargetDir(null);
      unlisten();
    };
  }, []);

  return { externalTargetDir: targetDir };
}
