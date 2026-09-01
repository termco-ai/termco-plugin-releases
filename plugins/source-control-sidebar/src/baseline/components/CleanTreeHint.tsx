import { CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function CleanTreeHint({ repoLabel }: { repoLabel: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-4 text-center">
      <div className="flex size-8 items-center justify-center rounded-full border border-border/55 text-muted-foreground">
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          size={16}
          strokeWidth={1.6}
        />
      </div>
      <div className="text-xs font-medium text-foreground">
        Working tree clean
      </div>
      <div className="text-xs leading-snug text-muted-foreground">
        on <span className="font-mono text-foreground/80">{repoLabel}</span>
      </div>
    </div>
  );
}
