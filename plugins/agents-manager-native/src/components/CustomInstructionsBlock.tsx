import ui from "@termco/ui";
import { actions } from "../runtime";
import { useEffect, useRef, useState } from "react";

const { Button, Textarea } = ui;

/**
 * Free-form "custom instructions" editor appended to the AI system prompt.
 * Seeds its draft from `value` exactly once (guarded by `hadFirstSync`) so
 * later store updates don't clobber in-progress edits; commits on Save.
 */
export function CustomInstructionsBlock({ value }: { value: string }) {
  const [draft, setDraft] = useState(value);
  const hadFirstSync = useRef(false);

  useEffect(() => {
    if (!hadFirstSync.current) {
      hadFirstSync.current = true;
      setDraft(value);
    }
  }, [value]);

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Custom instructions
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Appended to every agent's system prompt in this workspace.
          </div>
        </div>
        {draft !== value && (
          <Button size="xs" onClick={() => void actions.setCustomInstructions(draft)}>
            Save
          </Button>
        )}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. Prefer pnpm. Never touch the migrations folder without asking."
        className="mt-3 min-h-[84px] resize-y rounded-lg border border-border/50 bg-background px-3 py-2.5 font-sans text-xs leading-normal"
      />
    </div>
  );
}
