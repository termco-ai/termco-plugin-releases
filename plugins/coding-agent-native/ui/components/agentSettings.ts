/** Source-owned by the coding-agent-native plugin.
 * Shared setting catalogs for a coding-agent run — the model choices, autonomy
 * (permission) modes, and reasoning-effort levels. Used by both the new-run
 * form and the mid-session control row so the two never drift.
 */

import type {
  AgentBackend,
  AgentEffort,
  AgentPermissionMode,
} from "../lib/protocol";

/** Per-backend model choices. `id: undefined` preserves the CLI default.
 * Backends without a verified catalogue expose only that default. */
export const MODEL_CATALOG: Record<
  AgentBackend,
  Array<{ id?: string; label: string }>
> = {
  claude: [
    { id: undefined, label: "Default" },
    { id: "opus", label: "Opus" },
    { id: "sonnet", label: "Sonnet" },
    { id: "haiku", label: "Haiku" },
  ],
  codex: [{ id: undefined, label: "Default" }],
};

/** Autonomy levels, low → high. Colors follow the app's status language. */
export const PERMISSION_MODES: Array<{
  id: AgentPermissionMode;
  label: string;
  dot: string;
  hint: string;
}> = [
  {
    id: "plan",
    label: "Plan",
    dot: "bg-primary",
    hint: "Read-only — analyze & propose, no changes",
  },
  {
    id: "default",
    label: "Ask",
    dot: "bg-amber-500",
    hint: "Prompt for approval on each tool",
  },
  {
    id: "acceptEdits",
    label: "Auto-edit",
    dot: "bg-emerald-500",
    hint: "Auto-approve file edits",
  },
  {
    id: "bypass",
    label: "Full auto",
    dot: "bg-orange-500",
    hint: "Auto-approve everything (careful)",
  },
];

/** Reasoning-effort levels. `id: undefined` = the model's default effort. */
export const EFFORT_LEVELS: Array<{ id?: AgentEffort; label: string }> = [
  { id: undefined, label: "Auto" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

/** Human label for a permission mode. */
export function permissionModeLabel(mode: AgentPermissionMode): string {
  return PERMISSION_MODES.find((m) => m.id === mode)?.label ?? mode;
}
