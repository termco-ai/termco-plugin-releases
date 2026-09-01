import type { TrajectoryRecord, TrajectoryRecordKind } from "@termco/session-base";

export const RECORD_GROUPS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly kinds: readonly TrajectoryRecordKind[];
}> = [
  { id: "conversation", label: "Conversation", kinds: ["turn", "user/input", "assistant/response"] },
  { id: "requests", label: "Requests", kinds: ["request", "context/injected"] },
  { id: "tools", label: "Tools", kinds: ["tool", "approval"] },
  { id: "control", label: "Control", kinds: ["retry", "compaction", "checkpoint"] },
  { id: "agents", label: "Subagents", kinds: ["subagent"] },
  { id: "metadata", label: "Metadata", kinds: ["session/header", "session/metadata", "adapter/raw"] },
];

const COLORS: Record<string, { text: string; bar: string }> = {
  "user/input": { text: "text-blue-500", bar: "bg-blue-500" },
  "assistant/response": { text: "text-emerald-500", bar: "bg-emerald-500" },
  request: { text: "text-violet-500", bar: "bg-violet-500" },
  tool: { text: "text-cyan-500", bar: "bg-cyan-500" },
  approval: { text: "text-amber-500", bar: "bg-amber-500" },
  compaction: { text: "text-fuchsia-500", bar: "bg-fuchsia-500" },
  checkpoint: { text: "text-teal-500", bar: "bg-teal-500" },
  subagent: { text: "text-orange-500", bar: "bg-orange-500" },
};

const KIND_LABELS: Readonly<Record<string, string>> = {
  "session/header": "Session",
  "session/metadata": "Metadata",
  turn: "Lifecycle",
  "user/input": "User",
  "context/injected": "Context",
  request: "Request",
  "assistant/response": "Assistant",
  tool: "Tool",
  approval: "Approval",
  retry: "Retry",
  compaction: "Compaction",
  checkpoint: "Checkpoint",
  subagent: "Subagent",
  "adapter/raw": "Adapter event",
};

export function recordColor(kind: string): { text: string; bar: string } {
  return COLORS[kind] ?? { text: "text-muted-foreground", bar: "bg-muted-foreground" };
}

export function recordGroup(kind: string): string {
  return RECORD_GROUPS.find((group) => group.kinds.includes(kind as TrajectoryRecordKind))?.id ?? "metadata";
}

export function recordKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replaceAll("-", " ");
}

export function recordPreview(record: TrajectoryRecord, max = 100): string {
  const flat = (record.searchableText || record.summary).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function formatTimeDelta(time: number, start: number): string {
  const delta = Math.max(0, time - start);
  if (delta < 1_000) return `+${delta}ms`;
  if (delta < 60_000) return `+${(delta / 1_000).toFixed(2)}s`;
  return `+${Math.floor(delta / 60_000)}:${Math.floor((delta % 60_000) / 1_000).toString().padStart(2, "0")}m`;
}

export function formatDuration(time: { readonly start: number; readonly end?: number }): string {
  if (time.end === undefined) return "—";
  const duration = Math.max(0, time.end - time.start);
  if (duration < 1_000) return `${duration}ms`;
  if (duration < 60_000) return `${(duration / 1_000).toFixed(2)}s`;
  const minutes = Math.floor(duration / 60_000);
  const seconds = Math.floor((duration % 60_000) / 1_000).toString().padStart(2, "0");
  return `${minutes}m ${seconds}s`;
}

function compactId(value: unknown): string {
  const text = String(value);
  return text.length > 9 ? `${text.slice(0, 9)}…` : text;
}

export function formatNesting(nesting: TrajectoryRecord["nesting"]): string {
  const parts: string[] = [];
  if (nesting.turn !== undefined) parts.push(`T${String(nesting.turn)}`);
  if (nesting.step !== undefined) parts.push(`S${String(nesting.step)}`);
  if (nesting.requestId !== undefined) parts.push(`req ${compactId(nesting.requestId)}`);
  if (nesting.callId !== undefined) parts.push(`call ${compactId(nesting.callId)}`);
  return parts.length > 0 ? parts.join(" · ") : "Session";
}
