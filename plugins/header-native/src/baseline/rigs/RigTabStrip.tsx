/**
 * Inline workspace (rig) tabs for the title bar. Each rig renders as a
 * chip — home icon for the launch/home rig, folder icon for project rigs,
 * tinted with the rig accent when active — plus a trailing "new rig"
 * button. Management (rename, reorder, per-rig tab lists) stays in the
 * RigSwitcher popover; this strip is the fast path for switching.
 */

import { cn } from "../ui";
import {
  Cancel01Icon,
  Folder01Icon,
  Home01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NewRigMenu } from "./components/NewRigMenu";
import { accentFor } from "./lib/rigColor";
import type { HeaderRuntime } from "../types";

type Props = {
  runtime: HeaderRuntime;
  onNewRig: () => void;
  onNewSshRig: (connectionId: string) => void;
  onDeleteRig: (id: string) => void;
  /** Fires on every tab click, even the already-active one — the shell uses
   * it to leave full-window modes (agents view) and return to the rig. */
  onActivate?: (id: string) => void;
};

export function RigTabStrip({
  runtime,
  onNewRig,
  onNewSshRig,
  onDeleteRig,
  onActivate,
}: Props) {
  const rigs = runtime.rigs;
  const activeId = runtime.activeRigId;
  const setActive = (id: string) => {
    runtime.activateRig(id);
    onActivate?.(id);
  };

  if (rigs.length === 0) return null;

  return (
    <div data-onboarding-target="header.rig-strip" className="flex min-w-0 shrink items-center gap-1 overflow-x-auto no-scrollbar">
      {rigs.map((sp) => {
        const active = sp.id === activeId;
        return (
          <div
            key={sp.id}
            role="button"
            tabIndex={0}
            onClick={() => setActive(sp.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setActive(sp.id);
            }}
            title={sp.root ?? sp.name}
            className={cn(
              "group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1.5 pl-2 text-xs font-medium whitespace-nowrap transition-colors select-none max-[480px]:px-1.5",
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={sp.root === null ? Home01Icon : Folder01Icon}
              size={13}
              strokeWidth={1.75}
              className="shrink-0"
              style={active ? undefined : { color: accentFor(sp) }}
            />
            <span className="max-w-36 truncate max-[480px]:hidden">
              {sp.name}
            </span>
            {rigs.length > 1 ? (
              <button
                type="button"
                aria-label={`Close rig ${sp.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRig(sp.id);
                }}
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground",
                  "group-hover:opacity-100",
                  active && "opacity-100",
                )}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
              </button>
            ) : (
              <span className="w-0.5" />
            )}
          </div>
        );
      })}
      <NewRigMenu onNewRig={onNewRig} onNewSshRig={onNewSshRig}>
        <button
          data-onboarding-target="header.new-rig"
          type="button"
          title="New rig"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.75} />
        </button>
      </NewRigMenu>
    </div>
  );
}
