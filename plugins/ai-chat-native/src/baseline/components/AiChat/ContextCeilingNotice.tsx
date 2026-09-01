/**
 * The line that gets drawn once the user has cancelled an automatic compaction
 * and the context keeps climbing past 90 %.
 *
 * Deliberately not dismissible. Below this point compaction was a suggestion;
 * above it the mechanical ladder has started throwing real content away, and
 * saying nothing would let the chat quietly get worse. Two ways out, both real.
 */

import { memo } from "react";

export const ContextCeilingNotice = memo(function ContextCeilingNotice({
  percent,
  onCompact,
  onNewChat,
}: {
  percent: number;
  onCompact: () => void;
  onNewChat: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="flex-1 text-foreground">
        {`Context is ${percent}% full — older content is being dropped. Summarise or start fresh.`}
      </span>
      <button
        type="button"
        onClick={onCompact}
        className="rounded-md border border-border/60 bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-accent"
      >
        Summarise
      </button>
      <button
        type="button"
        onClick={onNewChat}
        className="rounded-md border border-border/60 bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-accent"
      >
        New chat
      </button>
    </div>
  );
});
