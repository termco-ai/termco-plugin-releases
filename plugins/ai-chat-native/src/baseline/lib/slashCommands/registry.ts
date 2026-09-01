/**
 * Slash-command registry and command-marker protocol: the outcome type, the
 * command metadata table, and the `<termco-command />` regex + wrapper.
 */
import {
  ArchiveIcon,
  Bug01Icon,
  CheckListIcon,
  ClaudeIcon,
  HelpCircleIcon,
  Mortarboard01Icon,
  PencilEdit02Icon,
  SearchAreaIcon,
  SparklesIcon,
  TestTube01Icon,
} from "@hugeicons/core-free-icons";

/**
 * Outcome of intercepting a slash command from the composer.
 *
 * - `"handled"`: command ran; the composer should NOT send a chat message.
 * - `"send-prompt"`: replace the user's text with `prompt` and send normally.
 * - `"none"`: not a slash command; let the composer behave as usual.
 */
export type SlashOutcome =
  | { kind: "handled"; toast?: string }
  | { kind: "send-prompt"; prompt: string; commandName?: string }
  | { kind: "none" };

export type SlashCommandMeta = {
  name: string;
  invocation: string;
  label: string;
  icon: typeof SparklesIcon;
};

export const SLASH_COMMANDS: Record<string, SlashCommandMeta> = {
  init: {
    name: "init",
    invocation: "/init",
    label: "Initialize workspace",
    icon: SparklesIcon,
  },
  plan: {
    name: "plan",
    invocation: "/plan",
    label: "Plan mode",
    icon: CheckListIcon,
  },
  grill: {
    name: "grill",
    invocation: "/grill",
    label: "Grill me on a plan",
    icon: HelpCircleIcon,
  },
  compact: {
    name: "compact",
    invocation: "/compact",
    label: "Compact the conversation",
    icon: ArchiveIcon,
  },
  review: {
    name: "review",
    invocation: "/review",
    label: "Review the changes",
    icon: PencilEdit02Icon,
  },
  tdd: {
    name: "tdd",
    invocation: "/tdd",
    label: "Build it test-first",
    icon: TestTube01Icon,
  },
  debug: {
    name: "debug",
    invocation: "/debug",
    label: "Diagnose a bug",
    icon: Bug01Icon,
  },
  research: {
    name: "research",
    invocation: "/research",
    label: "Research a question",
    icon: SearchAreaIcon,
  },
  handoff: {
    name: "handoff",
    invocation: "/handoff",
    label: "Write a handoff doc",
    icon: CheckListIcon,
  },
  glossary: {
    name: "glossary",
    invocation: "/glossary",
    label: "Sharpen the domain language",
    icon: Mortarboard01Icon,
  },
  "claude-code": {
    name: "claude-code",
    invocation: "/claude-code",
    label: "Delegate to Claude Code",
    icon: ClaudeIcon,
  },
};

export const TERMCO_CMD_RE =
  /^<termco-command\s+name="([a-z0-9-]+)"(?:\s+state="([a-z]+)")?\s*\/>(?:\n+|$)/;

export function wrapWithCommandMarker(prompt: string, name: string): string {
  return `<termco-command name="${name}" />\n\n${prompt}`;
}
