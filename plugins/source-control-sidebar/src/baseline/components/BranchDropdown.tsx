import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@termco/ui";
import { Spinner } from "@termco/ui";
import type { GitBranchEntry } from "@termco/git-base";
import {
  CloudIcon,
  Folder01Icon,
  FolderGitTwoIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { native } from "../../runtime";

export function BranchDropdown({
  repoRoot,
  repoLabel,
  onNavigateToPath,
  onRefresh,
}: {
  repoRoot: string | null;
  repoLabel: string;
  onNavigateToPath?: (path: string) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [query, setQuery] = useState("");
  const requestRef = useRef(0);
  const checkoutInFlight = useRef(false);

  const loadBranches = useCallback(async () => {
    const id = ++requestRef.current;
    if (!repoRoot) {
      setBranches([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await native.gitListBranches(repoRoot);
      if (id !== requestRef.current) return;
      setBranches(result.branches);
    } catch (e) {
      if (id !== requestRef.current) return;
      setError(String(e));
      setBranches([]);
    } finally {
      if (id === requestRef.current) {
        setLoading(false);
      }
    }
  }, [repoRoot]);

  useEffect(() => {
    if (open) {
      void loadBranches();
    }
  }, [open, loadBranches]);

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!repoRoot || checkoutInFlight.current) return;
      checkoutInFlight.current = true;
      setCheckingOut(true);
      try {
        await native.gitCheckoutBranch(repoRoot, branch);
        setBranches([]);
        setOpen(false);
        onRefresh();
      } catch (e) {
        toast.error(String(e));
      } finally {
        checkoutInFlight.current = false;
        setCheckingOut(false);
      }
    },
    [repoRoot, onRefresh],
  );

  const localBranches = useMemo(
    () =>
      branches.filter(
        (branch) =>
          branch.kind === "local" &&
          branch.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [branches, query],
  );
  const worktrees = useMemo(
    () =>
      branches.filter(
        (branch) =>
          branch.kind === "worktree" &&
          (branch.name.toLowerCase().includes(query.trim().toLowerCase()) ||
            (branch.worktreePath
              ?.toLowerCase()
              .includes(query.trim().toLowerCase()) ??
              false)),
      ),
    [branches, query],
  );
  // Remote-tracking branches. The backend already drops those that have a local
  // counterpart, so anything here is genuinely only on the remote.
  const remoteBranches = useMemo(
    () =>
      branches.filter(
        (branch) =>
          branch.kind === "remote" &&
          branch.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [branches, query],
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={checkingOut}
          className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1 text-xs font-medium leading-none text-foreground transition-colors hover:bg-foreground/10 disabled:cursor-default disabled:opacity-70"
        >
          <HugeiconsIcon
            icon={FolderGitTwoIcon}
            size={12}
            strokeWidth={1.9}
            className="shrink-0 text-muted-foreground"
          />
          <span className="max-w-35 truncate">{repoLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 overflow-hidden p-0">
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">Switch branch</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Current repository · {repoLabel}
          </p>
        </div>
        <div className="border-b border-border/70 p-2">
          <div className="flex items-center gap-2 rounded-md border border-border px-2.5">
            <HugeiconsIcon
              icon={Search01Icon}
              size={13}
              strokeWidth={1.7}
              className="text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Find branch, remote or worktree"
              className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              Loading branches…
            </div>
          ) : error ? (
            <div className="px-3 py-3 text-xs leading-snug text-destructive">
              {error}
            </div>
          ) : (
            <>
              {localBranches.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                    Local Branches
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {localBranches.map((b) => (
                      <DropdownMenuItem
                        key={b.name}
                        onSelect={() => void handleCheckout(b.name)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs"
                      >
                        {b.isHead ? (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            size={14}
                            strokeWidth={1.8}
                            className="shrink-0"
                          />
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {b.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
              {worktrees.length > 0 && (
                <>
                  {localBranches.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                    Worktrees
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {worktrees.map((b) => (
                      <DropdownMenuItem
                        key={b.worktreePath ?? b.name}
                        onSelect={() => {
                          if (b.worktreePath && onNavigateToPath) {
                            onNavigateToPath(b.worktreePath);
                          }
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs"
                      >
                        <HugeiconsIcon
                          icon={Folder01Icon}
                          size={14}
                          strokeWidth={1.5}
                          className="shrink-0 text-muted-foreground"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{b.name}</span>
                          {b.worktreePath && (
                            <span className="truncate text-xs text-muted-foreground">
                              {b.worktreePath}
                            </span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
              {remoteBranches.length > 0 && (
                <>
                  {(localBranches.length > 0 || worktrees.length > 0) && (
                    <DropdownMenuSeparator />
                  )}
                  <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                    Remote Branches
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {remoteBranches.map((b) => (
                      <DropdownMenuItem
                        key={b.name}
                        onSelect={() => void handleCheckout(b.name)}
                        title={`Check out ${b.name} as a local tracking branch`}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs"
                      >
                        <HugeiconsIcon
                          icon={CloudIcon}
                          size={14}
                          strokeWidth={1.5}
                          className="shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {b.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
              {(branches.length === 0 ||
                (localBranches.length === 0 &&
                  worktrees.length === 0 &&
                  remoteBranches.length === 0)) && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  {query
                    ? `No branch matches “${query}”.`
                    : "No branches found."}
                </div>
              )}
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
