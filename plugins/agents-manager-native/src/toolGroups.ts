import type { AiToolGroupId } from "@termco/ai-library-base";

export const TOOL_GROUP_IDS: readonly AiToolGroupId[] = [
  "files",
  "terminal",
  "git",
  "containers",
  "browser",
  "system",
  "agents",
  "ui",
  "plugin-dev",
];

export const TOOL_GROUPS: readonly {
  id: AiToolGroupId;
  label: string;
  hint: string;
}[] = [
  { id: "files", label: "Files", hint: "Read, write, edit & search" },
  { id: "terminal", label: "Terminal", hint: "Run and watch commands" },
  { id: "git", label: "Git", hint: "Status, diff, commit" },
  { id: "containers", label: "Containers", hint: "Docker, logs & ports" },
  { id: "browser", label: "Browser", hint: "Drive the embedded browser" },
  { id: "system", label: "System", hint: "Clipboard, notifications, OS" },
  { id: "agents", label: "Agents", hint: "Subagents & coding agents" },
  { id: "ui", label: "Rich views", hint: "Tables, charts & findings" },
  { id: "plugin-dev", label: "Plugin Dev", hint: "Build and manage plugins" },
];

export type ToolGroupId = AiToolGroupId;
