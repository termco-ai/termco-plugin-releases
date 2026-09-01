/**
 * The detection registry — every agent-config artifact convention we recognize,
 * across the ecosystem (AGENTS.md alone is read by 28+ tools). Discovery is
 * data-driven from this list, so adding a tool later is one row, not new code.
 */

import type { Detector } from "./types";

export const DETECTORS: readonly Detector[] = [
  // ── ① memory / instructions → project context ────────────────────────────
  {
    id: "agents-md",
    tool: "AGENTS.md (standard)",
    kind: "memory",
    match: { t: "file", path: "AGENTS.md" },
    target: "project-context",
    scope: ["project", "nested", "global"],
  },
  {
    id: "claude-md",
    tool: "Claude Code",
    kind: "memory",
    match: { t: "file", path: "CLAUDE.md" },
    target: "project-context",
    scope: ["project", "nested", "global"],
  },
  {
    id: "gemini-md",
    tool: "Gemini CLI",
    kind: "memory",
    match: { t: "file", path: "GEMINI.md" },
    target: "project-context",
    scope: ["project", "nested", "global"],
  },
  {
    id: "agent-md",
    tool: "Amp",
    kind: "memory",
    match: { t: "file", path: "AGENT.md" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "cursorrules",
    tool: "Cursor (legacy)",
    kind: "memory",
    match: { t: "file", path: ".cursorrules" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "windsurfrules",
    tool: "Windsurf (legacy)",
    kind: "memory",
    match: { t: "file", path: ".windsurfrules" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "roorules",
    tool: "Roo Code (legacy)",
    kind: "memory",
    match: { t: "file", path: ".roorules" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "zed-rules",
    tool: "Zed",
    kind: "memory",
    match: { t: "file", path: ".rules" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "aider-conventions",
    tool: "Aider",
    kind: "memory",
    match: { t: "file", path: "CONVENTIONS.md" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "copilot-instructions",
    tool: "GitHub Copilot",
    kind: "memory",
    match: { t: "file", path: ".github/copilot-instructions.md" },
    target: "project-context",
    scope: ["project"],
  },

  // ── ② rules directories (multi-file) → project context ───────────────────
  {
    id: "cursor-rules",
    tool: "Cursor",
    kind: "rules",
    match: { t: "dirFiles", dir: ".cursor/rules", ext: "mdc" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "windsurf-rules",
    tool: "Windsurf",
    kind: "rules",
    match: { t: "dirFiles", dir: ".windsurf/rules", ext: "md" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "cline-rules",
    tool: "Cline",
    kind: "rules",
    match: { t: "dirFiles", dir: ".clinerules", ext: "md" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "continue-rules",
    tool: "Continue",
    kind: "rules",
    match: { t: "dirFiles", dir: ".continue/rules", ext: "md" },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "copilot-scoped",
    tool: "GitHub Copilot",
    kind: "rules",
    match: {
      t: "dirFiles",
      dir: ".github/instructions",
      ext: "instructions.md",
    },
    target: "project-context",
    scope: ["project"],
  },
  {
    id: "junie-guidelines",
    tool: "JetBrains Junie",
    kind: "rules",
    match: { t: "file", path: ".junie/guidelines.md" },
    target: "project-context",
    scope: ["project"],
  },

  // ── ③ skills ─────────────────────────────────────────────────────────────
  {
    id: "claude-skills",
    tool: "Claude Code",
    kind: "skill",
    match: { t: "dirChildren", dir: ".claude/skills", leaf: "SKILL.md" },
    target: "skill",
    scope: ["project", "global"],
  },
  {
    id: "dotagents-skills",
    tool: ".agents spec",
    kind: "skill",
    match: { t: "dirChildren", dir: ".agents/skills", leaf: "SKILL.md" },
    target: "skill",
    scope: ["project"],
  },

  // ── ④ subagents / agent roles → personas ─────────────────────────────────
  {
    id: "claude-agents",
    tool: "Claude Code",
    kind: "agent",
    match: { t: "dirFiles", dir: ".claude/agents", ext: "md" },
    target: "persona",
    scope: ["project", "nested"],
  },
  {
    id: "agent-md-role",
    tool: ".agent.md",
    kind: "agent",
    match: { t: "file", path: ".agent.md" },
    target: "persona",
    scope: ["project"],
  },

  // ── ⑤ commands / prompts → slash ─────────────────────────────────────────
  {
    id: "claude-commands",
    tool: "Claude Code",
    kind: "command",
    match: { t: "dirFiles", dir: ".claude/commands", ext: "md" },
    target: "slash",
    scope: ["project"],
  },
  {
    id: "copilot-prompts",
    tool: "GitHub Copilot",
    kind: "command",
    match: { t: "dirFiles", dir: ".github/prompts", ext: "prompt.md" },
    target: "slash",
    scope: ["project"],
  },

  // ── ⑥ MCP servers ────────────────────────────────────────────────────────
  {
    id: "mcp-claude",
    tool: "Claude Code",
    kind: "mcp",
    match: { t: "file", path: ".mcp.json" },
    target: "mcp",
    scope: ["project"],
  },
  {
    id: "mcp-cursor",
    tool: "Cursor",
    kind: "mcp",
    match: { t: "file", path: ".cursor/mcp.json" },
    target: "mcp",
    scope: ["project"],
  },
  {
    id: "mcp-vscode",
    tool: "VS Code",
    kind: "mcp",
    match: { t: "file", path: ".vscode/mcp.json" },
    target: "mcp",
    scope: ["project"],
  },

  // ── ⑦ settings / hooks → surfaced only ───────────────────────────────────
  {
    id: "claude-settings",
    tool: "Claude Code",
    kind: "settings",
    match: { t: "file", path: ".claude/settings.json" },
    target: "info",
    scope: ["project"],
  },
];
