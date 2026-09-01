/**
 * The head of a compacted chat.
 *
 * A compacted conversation is a NEW session forked from the old one, seeded
 * with the most recent exchanges verbatim. This card stands in for everything
 * before them. It is not decoration: the link back to the source chat is the
 * promise that nothing was lost, and the transcript id is what the agent itself
 * reads through `read_transcript`.
 */

import { cn } from "@termco/ui";
import { memo, useState } from "react";
import { formatTokens } from "../AiMiniWindow/tokenFormat";
import type { SessionCompaction } from "../../../sessions";
import { useChatStore } from "../../store/chatStore";

/** Past this many rounds, a fresh chat usually beats another compaction. */
const MANY_ROUNDS = 3;

export const CompactionHeader = memo(function CompactionHeader({
  compaction,
}: {
  compaction: SessionCompaction;
}) {
  const [open, setOpen] = useState(false);
  const sessions = useChatStore((s) => s.sessions);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const source = sessions.find((s) => s.id === compaction.sourceSessionId);

  // Exchanges, not messages: one exchange is a thing the user can see, one
  // model message is not. The old card showed `uiMessages.length` — which was
  // the whole conversation, so it always claimed everything had been replaced.
  const summarized = compaction.summarizedGroups ?? 0;
  const preserved = compaction.preservedGroups ?? 0;
  const rounds = compaction.round ?? 1;

  const headline = summarized
    ? `${summarized} earlier exchange${summarized === 1 ? "" : "s"} summarised.`
    : "The earlier conversation was summarised.";
  const tail = preserved
    ? ` The last ${preserved === 1 ? "one is" : `${preserved} are`} below, word for word.`
    : "";
  const sizes =
    compaction.preTokens && compaction.preTokens > 0
      ? ` ~${formatTokens(compaction.preTokens)} before.`
      : "";

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-amber-500/80" />
        <span className="flex-1 font-medium text-foreground">
          Conversation compacted
        </span>
        {source && (
          <button
            type="button"
            onClick={() => switchSession(source.id)}
            className="rounded-md border border-border/60 bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-accent"
          >
            Open the original chat
          </button>
        )}
      </div>
      <p className="mt-1 pl-3.5 text-muted-foreground">
        {`${headline}${tail}${sizes} The full history is kept — the agent can read it back.`}
      </p>
      {rounds >= MANY_ROUNDS && (
        <p className="mt-1 flex items-center gap-2 pl-3.5 text-muted-foreground">
          <span className="flex-1">
            {`This chat has been compacted ${rounds} times. Repeated compaction makes the model less accurate — a fresh chat is often better.`}
          </span>
          <button
            type="button"
            onClick={() => newSession()}
            className="shrink-0 rounded-md border border-border/60 bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-accent"
          >
            New chat
          </button>
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 pl-3.5 text-muted-foreground underline opacity-70 hover:opacity-100"
      >
        {open ? "Hide the summary" : "Show the summary"}
      </button>
      <div
        className={cn(
          "mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/40 bg-background/60 p-2 text-muted-foreground",
          !open && "hidden",
        )}
      >
        {compaction.blocks.join("\n\n")}
      </div>
    </div>
  );
});
