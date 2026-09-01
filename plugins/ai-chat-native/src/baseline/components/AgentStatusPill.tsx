import { Spinner } from "@termco/ui";
import { cn } from "@termco/ui";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type AgentMeta, useChatStore } from "../store/chatStore";

type Props = {
  onClick: () => void;
};

export function AgentStatusPill({ onClick }: Props) {
  const meta = useChatStore((s) => s.agentMeta);

  // Human-input waits are surfaced by their transcript card + auto-opened mini window.
  if (meta.status === "awaiting-approval" || meta.status === "awaiting-input") return null;
  if (meta.status === "idle" && !meta.error) return null;

  const { tone, icon, label } = describe(meta);

  return (
    <button
      key={`${meta.status}:${label}`}
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-md border px-1.5 text-xs transition-colors",
        "animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out",
        tone,
      )}
      title="Open AI log"
    >
      {icon}
      <span className="max-w-[180px] truncate">{label}</span>
    </button>
  );
}

function describe(meta: AgentMeta): {
  tone: string;
  icon: React.ReactNode;
  label: string;
} {
  if (meta.status === "error" || (meta.status === "idle" && meta.error)) {
    return {
      tone: "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
      icon: (
        <HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={1.75} />
      ),
      label: meta.error ?? "Error",
    };
  }
  // thinking | streaming
  return {
    tone: "border-border/60 bg-card text-muted-foreground hover:text-foreground",
    icon: <Spinner className="size-3" />,
    label: meta.step ?? "Thinking…",
  };
}
