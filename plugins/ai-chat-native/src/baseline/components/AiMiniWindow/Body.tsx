/**
 * Mini-window content: wires the active session's `Chat` to the transcript,
 * the plan-mode strip, the todo strip, and the empty state. `EmptyShell`
 * renders the same chrome while sessions are still hydrating.
 */

import { type UIMessage, useChat } from "@ai-sdk/react";
import { useMemo } from "react";
import { getOrCreateChat } from "../../store/chatRuntime";
import { useChatStore } from "../../store/chatStore";
import { usePlanStore } from "../../store/planStore";
import { AiChatView } from "../AiChat";
import { AiComposer } from "../AiComposer";
import { GrillingStrip } from "../GrillingStrip";
import { TodoStrip } from "../TodoStrip";
import { EmptyState } from "./EmptyState";
import { Header } from "./Header";

export function Body({
  sessionId,
  onClose,
  onExpand,
  onHeaderPointerDown,
}: {
  sessionId: string;
  onClose: () => void;
  onExpand: () => void;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
}) {
  const focusInput = useChatStore((s) => s.focusInput);
  const step = useChatStore((s) => s.agentMeta.step);
  // A compacted chat opens with no messages but is NOT empty: its summary card
  // must be there from the start, not only once the user types something.
  const compaction = useChatStore(
    (s) => s.sessions.find((x) => x.id === sessionId)?.compaction,
  );

  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat, throttle: 16 });
  const isBusy =
    helpers.status === "submitted" || helpers.status === "streaming";

  return (
    <>
      <Header
        step={step}
        isBusy={isBusy}
        onClose={onClose}
        onExpand={onExpand}
        messages={helpers.messages}
        onHeaderPointerDown={onHeaderPointerDown}
      />

      <PlanModeStrip />

      <div className="flex min-h-0 flex-1 flex-col">
        {helpers.messages.length === 0 && !compaction ? (
          <EmptyState onPick={focusInput} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [&_.text-sm]:text-xs [&_p]:leading-relaxed">
            <AiChatView
              // Remount per session → instant landing at the bottom on open.
              key={sessionId}
              messages={helpers.messages}
              status={helpers.status}
              error={helpers.error}
              clearError={helpers.clearError}
              addToolApprovalResponse={helpers.addToolApprovalResponse}
              addToolOutput={helpers.addToolOutput}
              stop={helpers.stop}
            />
          </div>
        )}
      </div>

      <GrillingStrip messages={helpers.messages} />
      <TodoStrip sessionId={sessionId} />

      {/* The single self-contained composer (WorkspaceInputBar yields it while
          the popup is open) — gives the floating chat its own input. */}
      <AiComposer />
    </>
  );
}

export function PlanModeStrip() {
  const active = usePlanStore((s) => s.active);
  const queueLen = usePlanStore((s) => s.queue.length);
  const disable = usePlanStore((s) => s.disable);
  if (!active) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/40 px-3 py-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="text-xs font-medium text-foreground">Plan mode</span>
      <span className="text-xs text-muted-foreground">
        {queueLen > 0 ? `· ${queueLen} queued` : "· no edits queued"}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => disable()}
        className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Exit
      </button>
    </div>
  );
}

export function EmptyShell({
  onClose,
  onExpand,
  onHeaderPointerDown,
}: {
  onClose: () => void;
  onExpand: () => void;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <>
      <Header
        step={null}
        isBusy={false}
        onClose={onClose}
        onExpand={onExpand}
        onHeaderPointerDown={onHeaderPointerDown}
      />
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading sessions…
      </div>
    </>
  );
}
