import type { SessionWindow } from "@termco/session-base";
import ui from "@termco/ui";

const { Button } = ui;

export function SessionHealthBanner({
  repair,
  recovering,
  recoveryError,
  onRecover,
}: {
  readonly repair: SessionWindow["repair"] | null;
  readonly recovering: boolean;
  readonly recoveryError?: string | null;
  readonly onRecover: () => void;
}) {
  if (!repair || repair.state === "healthy") {
    return recoveryError ? <div role="alert" className="border-b border-destructive/35 bg-destructive/5 px-3 py-2 text-xs text-destructive">{recoveryError}</div> : null;
  }
  if (repair.state === "waiting-input") {
    return (
      <div role="status" aria-live="polite" className="border-b border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-foreground">
        <span className="font-medium">Session is waiting for input.</span>{" "}
        <span className="text-muted-foreground">It is paused safely and can resume when input is available.</span>
      </div>
    );
  }
  if (repair.state === "corrupt") {
    return (
      <div role="alert" className="border-b border-destructive/35 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <span className="font-medium">History is corrupt.</span>{" "}
        <span className="break-words [overflow-wrap:anywhere]">{repair.message ?? "The valid prefix remains available for inspection, but this session cannot be continued safely."}</span>
      </div>
    );
  }
  if (repair.state === "repaired") {
    return (
      <div role="status" aria-live="polite" className="border-b border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-foreground">
        <span className="font-medium">Session recovered</span>
        {repair.repairedThroughSeq !== undefined && <span className="text-muted-foreground"> through event #{repair.repairedThroughSeq}</span>}
        {repair.message && <span className="text-muted-foreground"> · {repair.message}</span>}
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
      <span className="min-w-48 flex-1 break-words [overflow-wrap:anywhere]">
        <span className="font-medium text-foreground">This session ended before its active turn closed.</span>{" "}
        <span className="text-muted-foreground">{repair.message ?? "The history owner can append a canonical recovery boundary before continuation."}</span>
      </span>
      <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[10px]" disabled={recovering} onClick={onRecover} aria-label="Repair session for continuation">
        {recovering ? "Repairing…" : "Repair for continuation"}
      </Button>
      {recoveryError && <span role="alert" className="w-full text-destructive">{recoveryError}</span>}
    </div>
  );
}
