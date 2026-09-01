/**
 * `NewEditorDialog` — modal prompt for creating a new file in the workspace.
 *
 * Validates a workspace-relative filename (rejecting `..` traversal and absolute
 * escapes), invokes `fs_create_file`, and reports the created path back to the
 * caller. Pre-selects the basename on open so the extension stays visible.
 */
import { Button } from "../../ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui";
import { Input } from "../../ui";
import { currentWorkspaceEnv } from "../../workspace";
import { File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "../../platform";
import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string | null;
  onCreated: (path: string) => void;
};

function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

export function NewEditorDialog({
  open,
  onOpenChange,
  rootPath,
  onCreated,
}: Props) {
  const [name, setName] = useState("untitled.txt");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewPath = rootPath
    ? joinPath(rootPath, name.trim() || "…")
    : "—";

  useEffect(() => {
    if (!open) return;
    setName("untitled.txt");
    setError(null);
    // Pre-select the basename so the user can quickly retype the filename
    // while keeping the extension handy.
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const dot = el.value.lastIndexOf(".");
      el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
    }, 0);
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    if (trimmed.includes("..")) {
      setError("Path must be relative");
      return;
    }
    if (!rootPath) {
      setError("No workspace root");
      return;
    }
    const path = trimmed.startsWith("/")
      ? trimmed
      : joinPath(rootPath, trimmed);
    try {
      await invoke("fs_create_file", {
        path,
        workspace: currentWorkspaceEnv(),
      });
      onCreated(path);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 grid-cols-[minmax(0,1fr)] overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--signal-soft)] text-primary">
              <HugeiconsIcon icon={File02Icon} size={15} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <DialogTitle>New workspace file</DialogTitle>
              <DialogDescription className="mt-1">
                Use a path relative to the workspace root. The extension sets
                the editor language.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-foreground">
          File path
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="src/example.ts"
          />
        </label>
        {error ? (
          <div className="text-xs text-destructive">{error}</div>
        ) : (
          <div className="min-w-0 rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Will create
            </p>
            <p
              role="region"
              aria-label="Full file path"
              tabIndex={0}
              title={previewPath}
              className="mt-0.5 min-w-0 overflow-x-auto overscroll-x-contain whitespace-nowrap pb-1 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              {previewPath}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
