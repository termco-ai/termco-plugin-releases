/**
 * The cluster of leading controls at the far-left of the header: the sidebar
 * toggle and — on non-macOS, where the traffic lights don't occupy the corner
 * — the agent notification bell. The command palette is launched from the
 * search bar in the middle of the header, not from here.
 */
import { Button } from "../../ui";
import { NotificationBell } from "../../agents/NotificationBell";
import type { HeaderRuntime } from "../../types";
import { SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  runtime: HeaderRuntime;
  onToggleSidebar: () => void;
  onActivateAgent: (tabId: number, leafId: number) => void;
  onActivateLocalAgent: () => void;
  /** Resolves a tab id to a "rig · tab" line for the activity rows. */
  locateAgent?: (tabId: number) => string | null;
};

export function HeaderLeadingControls({
  runtime,
  onToggleSidebar,
  onActivateAgent,
  onActivateLocalAgent,
  locateAgent,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        onClick={onToggleSidebar}
        title="Toggle sidebar"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <HugeiconsIcon icon={SidebarLeftIcon} size={18} strokeWidth={1.75} />
      </Button>

      {runtime.platform !== "macos" && (
        <NotificationBell
          runtime={runtime}
          onActivate={onActivateAgent}
          onActivateLocal={onActivateLocalAgent}
          locate={locateAgent}
        />
      )}
    </div>
  );
}
