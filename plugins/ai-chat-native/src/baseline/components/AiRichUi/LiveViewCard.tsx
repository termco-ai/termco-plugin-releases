/**
 * LiveViewCard — the card behind a `data-view` part.
 *
 * Same views as `RichUiCard`, different lifecycle: this one belongs to a tool
 * that is still running and rewrites the part as it goes. So the header carries
 * a live status line and a pulse until the emitter sets `done`.
 */

import { cn } from "@termco/ui";
import { PulseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { toolsService } from "../../runtime/toolContributions";
import { RichView } from "./RichView";
import type { ViewSpec } from "./types";

type LiveViewData = {
  view?: unknown;
  label?: unknown;
  done?: unknown;
};

function LiveViewCardImpl({ part }: { part: { data?: unknown } }) {
  const data = (part.data ?? {}) as LiveViewData;
  const presentation = toolsService.presentationForRenderer(
    "structured-ui",
    false,
  );
  const parsedInput = presentation?.parseInput({ view: data.view });
  const view = parsedInput && typeof parsedInput === "object"
    ? (parsedInput as { view?: ViewSpec }).view
    : undefined;
  if (!view) return null;

  const done = data.done === true;
  const label = typeof data.label === "string" ? data.label : undefined;

  return (
    <div
      data-testid="live-view-card"
      data-done={String(done)}
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        done ? "border-border/60" : "border-primary/25",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-2.5 py-1.5 text-xs",
          done
            ? "border-border/40 bg-muted/30"
            : "border-border/60 bg-[var(--signal-soft)]",
        )}
      >
        <HugeiconsIcon
          icon={PulseIcon}
          size={13}
          strokeWidth={1.75}
          className={cn(
            "shrink-0",
            done ? "text-muted-foreground" : "animate-pulse text-primary",
          )}
        />
        <span className="shrink-0 font-medium text-foreground">
          {view.title ?? "Working"}
        </span>
        {label ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {label}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {done ? null : (
          <span className="shrink-0 text-muted-foreground">live</span>
        )}
      </div>
      <RichView view={view} />
    </div>
  );
}

export const LiveViewCard = memo(LiveViewCardImpl);
