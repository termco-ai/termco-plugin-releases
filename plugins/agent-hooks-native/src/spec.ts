/**
 * Agent registry.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export type Delivery = "terminalSequence" | "osc";

export interface AgentSpec {
  agent: string;
  dir: string;
  file: string;
  events: [event: string, marker: string][];
  matcher: boolean;
  delivery: Delivery;
}

const AGENTS: AgentSpec[] = [
  {
    agent: "claude",
    dir: ".claude",
    file: "settings.json",
    events: [
      ["UserPromptSubmit", "working"],
      ["Notification", "attention"],
      ["Stop", "finished"],
    ],
    matcher: false,
    delivery: "terminalSequence",
  },
  {
    agent: "codex",
    dir: ".codex",
    file: "hooks.json",
    events: [
      ["UserPromptSubmit", "working"],
      ["PermissionRequest", "attention"],
      ["Stop", "finished"],
    ],
    matcher: false,
    delivery: "osc",
  },
  {
    agent: "gemini",
    dir: ".gemini",
    file: "settings.json",
    events: [
      ["BeforeAgent", "working"],
      ["Notification", "attention"],
      ["AfterAgent", "finished"],
    ],
    matcher: true,
    delivery: "osc",
  },
];

export function find(agent: string): AgentSpec {
  const spec = AGENTS.find((s) => s.agent === agent);
  if (!spec) throw new Error(`unknown agent ${agent}`);
  return spec;
}

export function settingsPath(spec: AgentSpec): string {
  return join(homedir(), spec.dir, spec.file);
}
