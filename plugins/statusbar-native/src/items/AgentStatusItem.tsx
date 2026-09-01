import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn, Spinner } from "../ui";

export function AgentStatusItem({ runtime }: { runtime: UiStatusbarRuntime }) {
  const meta = runtime.ai;
  if (meta.status === "awaiting-approval" || meta.status === "awaiting-input") return null;
  if (meta.status === "idle" && !meta.error) return null;
  const error = meta.status === "error" || Boolean(meta.error);
  const label = error ? (meta.error ?? "Error") : (meta.step ?? "Thinking…");
  return (
    <button
      key={`${meta.status}:${label}`}
      type="button"
      onClick={() => {
        if (!runtime.aiSurfaceOpen) runtime.openAi();
      }}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-md border px-1.5 text-xs transition-colors",
        "animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out",
        error
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
          : "border-border/60 bg-card text-muted-foreground hover:text-foreground",
      )}
      title="Open AI log"
    >
      {error ? (
        <HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={1.75} />
      ) : (
        <Spinner className="size-3" />
      )}
      <span className="max-w-[180px] truncate">{label}</span>
    </button>
  );
}
