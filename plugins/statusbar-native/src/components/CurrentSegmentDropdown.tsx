import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import {
  ArrowDown01Icon,
  Folder01Icon,
  Home03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BreadcrumbPage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useCallback,
  useEffect,
  useState,
} from "../ui";

type ListSubdirs = (
  path: string,
  workspace: UiStatusbarRuntime["workspace"],
) => Promise<readonly string[]>;

export function CurrentSegmentDropdown({
  label,
  path,
  workspace,
  onCd,
  listSubdirs,
}: {
  label: string;
  path: string;
  workspace: UiStatusbarRuntime["workspace"];
  onCd: (path: string) => void;
  listSubdirs: ListSubdirs;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setChildren(await listSubdirs(path, workspace));
    } catch (reason) {
      setError(String(reason));
      setChildren([]);
    }
  }, [listSubdirs, path, workspace]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <BreadcrumbPage className="flex cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 text-foreground hover:bg-accent">
          {label === "~" ? (
            <>
              <HugeiconsIcon
                icon={Home03Icon}
                className="size-3"
                strokeWidth={1.75}
              />
              Home
            </>
          ) : (
            label
          )}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className="size-3 opacity-70"
            strokeWidth={2}
          />
        </BreadcrumbPage>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 overflow-hidden p-0">
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">Open subfolder</p>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {path}
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {children === null ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Loading…
            </div>
          ) : children.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {error ?? "No subfolders"}
            </div>
          ) : (
            children.map((name) => (
              <DropdownMenuItem
                key={name}
                onSelect={() =>
                  onCd(path.endsWith("/") ? `${path}${name}` : `${path}/${name}`)
                }
                className="rounded-lg px-2.5 py-2"
              >
                <HugeiconsIcon
                  icon={Folder01Icon}
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                {name}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
