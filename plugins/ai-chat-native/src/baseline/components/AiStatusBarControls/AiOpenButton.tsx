/** Compact "Open AI agent" button shown in the status bar when the panel is closed. */

import { Kbd, fmtShortcut, MOD_KEY } from "@termco/ui";
import { cn } from "@termco/ui";

export function AiOpenButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground",
        "transition-colors hover:bg-accent hover:text-foreground",
        "animate-in slide-in-from-top-2 duration-200 ease-out",
      )}
      title="Open AI agent"
    >
      <span>Open AI agent</span>
      <Kbd className="h-4 min-w-4 border-0 bg-muted px-1 font-mono text-xs text-muted-foreground">
        {fmtShortcut(MOD_KEY, "I")}
      </Kbd>
    </button>
  );
}
