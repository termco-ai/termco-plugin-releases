/** Inline pill rendering a recognised `/slash` command inside a user message. */

import { HugeiconsIcon } from "@hugeicons/react";
import { SLASH_COMMANDS } from "../../lib/slashCommands";

export function CommandSnippet({ name }: { name: string }) {
  const meta = SLASH_COMMANDS[name];
  if (!meta) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2 py-1 font-mono text-xs">
        /{name}
      </div>
    );
  }
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2 py-1">
      <HugeiconsIcon
        icon={meta.icon}
        size={12}
        strokeWidth={1.75}
        className="shrink-0 text-foreground"
      />
      <span className="font-mono text-xs text-foreground">
        {meta.invocation}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {meta.label}
      </span>
    </div>
  );
}
