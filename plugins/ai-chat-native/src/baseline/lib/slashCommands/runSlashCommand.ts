/**
 * Slash-command dispatcher: parses composer input, toggles plan mode, and maps
 * commands into send-prompt outcomes.
 */
import { useChatStore } from "../../store/chatStore";
import { usePlanStore } from "../../store/planStore";
import {
  claudeCodeDirective,
  grillDirective,
  INIT_PROMPT,
  SKILL_COMMANDS,
  type SkillCommandName,
  skillDirective,
} from "./prompts";
import { SLASH_COMMANDS, type SlashOutcome } from "./registry";

export function tryRunSlashCommand(input: string): SlashOutcome {
  const trimmed = input.trim();
  const lead = trimmed[0];
  if (lead !== "/" && lead !== "#") return { kind: "none" };
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  if (lead === "#" && !SLASH_COMMANDS[head]) return { kind: "none" };
  const tail = rest.join(" ").trim();

  // Skill-backed commands all behave the same: activate the skill, hand it the
  // argument. Checked before the switch so adding one needs no new case.
  if (head in SKILL_COMMANDS) {
    return {
      kind: "send-prompt",
      prompt: skillDirective(head as SkillCommandName, tail),
      commandName: head,
    };
  }

  switch (head) {
    case "plan": {
      const store = usePlanStore.getState();
      if (tail === "off" || tail === "exit") {
        store.disable();
        return { kind: "handled", toast: "Plan mode off" };
      }
      store.toggle();
      const nowActive = usePlanStore.getState().active;
      return {
        kind: "handled",
        toast: nowActive ? "Plan mode on" : "Plan mode off",
      };
    }
    case "compact": {
      // Runs NOW — it is an operation the user watches, not a flag for later.
      // `/compact keep the migration details` steers what survives.
      const sessionId = useChatStore.getState().activeSessionId;
      if (!sessionId) return { kind: "handled", toast: "No active chat" };
      // Dynamic import: a static one would pull the compaction pipeline (and
      // the `ai` package) into the eager startup bundle via the composer →
      // slash-command chain (eager-budget.test.ts). User-triggered = perfect
      // lazy boundary.
      void import("../../store/chatRuntime/compaction").then(
        ({ runCompaction }) =>
          runCompaction({
            sessionId,
            mode: "manual",
            instructions: tail || undefined,
          }),
      );
      return { kind: "handled" };
    }
    case "init": {
      return {
        kind: "send-prompt",
        prompt: INIT_PROMPT,
        commandName: "init",
      };
    }
    case "grill": {
      // No argument is legitimate: the session then grills whatever the
      // conversation has been about so far.
      return {
        kind: "send-prompt",
        prompt: grillDirective(tail),
        commandName: "grill",
      };
    }
    case "claude-code": {
      if (!tail) {
        return { kind: "handled", toast: "Usage: /claude-code <request>" };
      }
      return {
        kind: "send-prompt",
        prompt: claudeCodeDirective(tail),
        commandName: "claude-code",
      };
    }
    default:
      return { kind: "none" };
  }
}
