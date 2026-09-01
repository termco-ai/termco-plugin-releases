/**
 * ForkDialog — the confirmation for "Fork from here" / "Re-run as fork"
 * Chat sessions get the "forks the conversation, not the world" hint;
 * adapter sessions can optionally restore an owned workspace checkpoint.
 */
import ui from "@termco/ui";
import { useState } from "react";
import type { ForkPrompt } from "./uiStore";

const { Button, Checkbox, Dialog, DialogContent, DialogFooter, DialogTitle } = ui;

type Props = {
  prompt: ForkPrompt | null;
  onCancel: () => void;
  onConfirm: (prompt: ForkPrompt, restoreWorkingTree: boolean) => void;
};

export function ForkDialog({ prompt, onCancel, onConfirm }: Props) {
  const [restore, setRestore] = useState(false);
  if (!prompt) return null;
  const isChat = prompt.fidelity === "full";
  const isRerun = prompt.mode === "rerun";
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md gap-3" data-testid="trajectory-fork-dialog">
        <DialogTitle className="text-sm">
          {isRerun ? "Re-run as fork" : "Fork from here"}
        </DialogTitle>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>
            The session owner will resolve a safe boundary at or before <span className="font-mono">#{prompt.eventSeq}</span> and create a child session
            {isRerun ? ", then the last prompt is sent again" : ""}.
          </p>
          {isChat ? (
            <p data-testid="trajectory-fork-hint">
              This forks the <strong>conversation</strong>, not the world —
              files, terminals and other side effects keep their current state.
            </p>
          ) : (
            <p>
              This creates a child session; no agent process is started.
            </p>
          )}
          {isRerun && (
            <p>
              The child records an explicit approval policy before it runs:
              every mutating tool call will ask for confirmation.
            </p>
          )}
          {!isChat && prompt.checkpoint && (
            <label className="mt-1 flex items-center gap-2 text-foreground">
              <Checkbox
                checked={restore}
                onCheckedChange={(v) => setRestore(v === true)}
                data-testid="trajectory-fork-restore"
              />
              Restore the working tree to checkpoint&nbsp;
              <span className="font-mono">
                {prompt.checkpoint.checkpointId}
              </span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            data-testid="trajectory-fork-confirm"
            onClick={() => {
              onConfirm(prompt, restore);
              setRestore(false);
            }}
          >
            {isRerun ? "Fork & re-run" : "Fork"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
