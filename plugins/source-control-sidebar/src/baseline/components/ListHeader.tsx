import { Checkbox } from "@termco/ui";
import { checkboxValue } from "../lib/rowHelpers";
import type { RowDescriptor, RowRendererProps } from "./types";

export function ListHeader({
  row,
  actionBusy,
  headerCheckState,
  onToggleAll,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "list-header" }>;
}) {
  return (
    <div className="flex h-7 items-center gap-2 px-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Changes
      </span>
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-xs font-semibold tabular-nums text-muted-foreground">
        {row.count}
      </span>
      <label className="ml-auto flex shrink-0 cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <span>All</span>
        <Checkbox
          aria-label="Stage all changes"
          checked={checkboxValue(headerCheckState)}
          disabled={actionBusy !== null}
          onCheckedChange={() => void onToggleAll()}
          className="size-3.5"
        />
      </label>
    </div>
  );
}
