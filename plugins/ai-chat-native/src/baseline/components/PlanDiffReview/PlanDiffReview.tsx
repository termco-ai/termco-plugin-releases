/**
 * PlanDiffReview — the plan-mode overlay listing all queued edits with
 * apply-all / discard-all actions. Owns the store wiring and the apply flow;
 * per-row rendering lives in `./PlanRow`.
 */

import { Button } from "@termco/ui";
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { usePlanStore } from "../../store/planStore";
import { PlanRow } from "./PlanRow";

export function PlanDiffReview() {
  const queue = usePlanStore((s) => s.queue);
  const removeOne = usePlanStore((s) => s.removeOne);
  const clear = usePlanStore((s) => s.clear);
  const applyAll = usePlanStore((s) => s.applyAll);
  const [busy, setBusy] = useState(false);

  if (queue.length === 0) return null;

  const onApply = async () => {
    setBusy(true);
    try {
      const results = await applyAll();
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        console.error("plan apply failures:", failed);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background/85 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight">
            Plan review
          </span>
          <span className="text-xs text-muted-foreground">
            {queue.length} pending change{queue.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs hover:bg-destructive/10 hover:text-destructive"
            onClick={() => clear()}
            disabled={busy}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            Discard all
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onApply}
            disabled={busy}
          >
            <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
            Apply {queue.length}
          </Button>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5 overflow-auto p-3">
        {queue.map((q) => (
          <PlanRow key={q.id} item={q} onReject={() => removeOne(q.id)} />
        ))}
      </ul>
    </div>
  );
}
