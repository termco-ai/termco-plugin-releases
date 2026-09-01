/**
 * Mini-window title bar: the draggable header hosting the agent switcher, the
 * context meter, the live step indicator, the session picker, and close.
 */

import { Button } from "@termco/ui";
import { Spinner } from "@termco/ui";
import type { UIMessage } from "@ai-sdk/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentSwitcher } from "../AgentSwitcher";
import { ContextIndicator } from "./ContextIndicator";
import { SessionPicker } from "./SessionPicker";

export function Header({
  step,
  isBusy,
  onClose,
  messages,
  onHeaderPointerDown,
}: {
  step: string | null;
  isBusy: boolean;
  onClose: () => void;
  onExpand: () => void;
  messages?: UIMessage[];
  onHeaderPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onHeaderPointerDown}
      className="relative flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-border/60 px-3 active:cursor-grabbing"
    >
      {/* Identity: agent + session title. Takes the free rig and truncates. */}
      <div className="shrink-0">
        <AgentSwitcher isMiniWindow />
      </div>
      <SessionPicker className="min-w-0 flex-1" />

      {/* Status + meta + close: fixed width, never shrink. The live step label
          is shown in the transcript body, so the header only needs a compact
          busy spinner (step on hover). */}
      <div className="flex shrink-0 items-center gap-1">
        {isBusy ? (
          <span
            className="flex items-center text-muted-foreground"
            title={step ?? "Thinking…"}
          >
            <Spinner className="size-3" aria-label={step ?? "Thinking…"} />
          </span>
        ) : null}
        {messages !== undefined ? (
          <ContextIndicator messages={messages} />
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="size-5"
          aria-label="Close"
          title="Close (Esc)"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}
