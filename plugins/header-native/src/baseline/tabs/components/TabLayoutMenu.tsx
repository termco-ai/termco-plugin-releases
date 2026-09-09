import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LayoutTwoColumnIcon } from "@hugeicons/core-free-icons";
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "../../ui";
import { DOCK_LABELS, DOCK_POSITIONS, dockLayout, type DockPosition } from "../lib/useSplitDrag";

/** A miniature workspace, with the selected tab's destination filled in. */
export function DockPreview({ position }: { position: DockPosition }) {
  const vertical = position === "top" || position === "bottom";
  const before = position === "left" || position === "top";
  return (
    <span aria-hidden className={cn("flex h-8 w-12 gap-0.5 rounded border border-current/30 p-0.5", vertical && "flex-col")}>
      <span className={cn("flex-1 rounded-[1px]", before ? "bg-primary/70" : "bg-muted-foreground/15")} />
      <span className={cn("flex-1 rounded-[1px]", before ? "bg-muted-foreground/15" : "bg-primary/70")} />
    </span>
  );
}

type Props = {
  activeId: number;
  label: string;
  canSplit: boolean;
  onSplit: (id: number, direction?: "horizontal" | "vertical", placement?: "before" | "after") => void;
};

export function TabLayoutMenu({ activeId, label, canSplit, onSplit }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-md text-muted-foreground"
          aria-label="Arrange tabs" title="Arrange tabs">
          <HugeiconsIcon icon={LayoutTwoColumnIcon} size={14} strokeWidth={2} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3" onCloseAutoFocus={(event) => event.preventDefault()}>
        <p className="text-xs font-semibold text-foreground">Arrange active tab</p>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={label}>{label}</p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {DOCK_POSITIONS.map((position) => (
            <Button key={position} variant="ghost" disabled={!canSplit}
              className="h-auto flex-col gap-1.5 rounded-md border border-border/70 py-2.5 text-xs hover:border-primary/50 hover:bg-primary/10"
              aria-label={`Place tab ${DOCK_LABELS[position].toLowerCase()}`}
              onClick={() => { onSplit(activeId, ...dockLayout(position)); setOpen(false); }}>
              <DockPreview position={position} />
              {DOCK_LABELS[position]}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {canSplit ? "Or drag a tab to an edge of the workspace." : "Open a second tab to arrange them together."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
