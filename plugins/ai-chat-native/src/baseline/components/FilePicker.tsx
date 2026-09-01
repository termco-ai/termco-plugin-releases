import { PopoverContent } from "@termco/ui";
import { Spinner } from "@termco/ui";
import { cn } from "@termco/ui";
import { fileIconUrl } from "../runtime/fileIcons";
import { useEffect, useRef } from "react";

type Props = {
  files: readonly string[];
  activeIndex: number;
  indexing: boolean;
  truncated: boolean;
  hasWorkspace: boolean;
  onPick: (file: string) => void;
  onHover: (index: number) => void;
};

export function FilePickerContent({
  files,
  activeIndex,
  indexing,
  truncated,
  hasWorkspace,
  onPick,
  onHover,
}: Props) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="w-96 gap-0 overflow-hidden p-0"
    >
      <div className="border-b border-border/70 px-3.5 py-3">
        <p className="text-xs font-semibold text-foreground">
          Attach workspace file
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Keep typing after @ to narrow the index.
        </p>
      </div>
      {!hasWorkspace ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          No workspace open
        </div>
      ) : indexing && files.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          <span>Indexing workspace…</span>
        </div>
      ) : files.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          No matching files
        </div>
      ) : (
        <>
          <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
            {files.map((path, idx) => {
              const slash = path.lastIndexOf("/");
              const name = slash === -1 ? path : path.slice(slash + 1);
              const dir = slash === -1 ? "" : path.slice(0, slash);
              return (
                <button
                  key={path}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => onPick(path)}
                  onMouseEnter={() => onHover(idx)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-xs",
                    idx === activeIndex
                      ? "border-primary/25 bg-[var(--signal-soft)]"
                      : "border-transparent hover:border-border hover:bg-muted/30",
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background">
                    <img src={fileIconUrl(name)} alt="" className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-foreground">
                      {name}
                    </span>
                    {dir && (
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {dir}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {truncated && (
            <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
              Showing the first matches. Keep typing to narrow a large
              workspace.
            </div>
          )}
        </>
      )}
    </PopoverContent>
  );
}
