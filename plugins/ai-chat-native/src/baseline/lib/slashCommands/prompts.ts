/**
 * Slash-command prompt templates: the LLM directive strings emitted by the
 * delegation, initialization, and interview commands.
 */

/**
 * Every built-in skill reachable as a slash command. The prompt just activates
 * the skill; the skill body carries the actual method, so this table stays a
 * one-liner per command.
 */
export const SKILL_COMMANDS = {
  review: {
    skill: "code-review",
    label: "Review the changes",
    noArg:
      "Review the working changes. Establish the comparison point yourself with git, and say which one you used.",
  },
  tdd: {
    skill: "tdd",
    label: "Build it test-first",
    noArg:
      "No target was given — ask what should be built or fixed before writing a test.",
  },
  debug: {
    skill: "diagnosing-bugs",
    label: "Diagnose a bug",
    noArg:
      "No symptom was given — ask what is broken, and what the user last saw, before hunting.",
  },
  handoff: {
    skill: "handoff",
    label: "Write a handoff doc",
    noArg: "Cover this whole session.",
  },
  research: {
    skill: "research",
    label: "Research a question",
    noArg: "No question was given — ask what should be researched.",
  },
  glossary: {
    skill: "domain-modeling",
    label: "Sharpen the domain language",
    noArg:
      "No term was given — read the existing glossary and propose what is missing or ambiguous.",
  },
} as const;

export type SkillCommandName = keyof typeof SKILL_COMMANDS;

/** Activate a built-in skill and hand it the user's argument. */
export function skillDirective(name: SkillCommandName, tail: string): string {
  const { skill, noArg } = SKILL_COMMANDS[name];
  const subject = tail.trim() ? `<request>\n${tail.trim()}\n</request>` : noArg;
  return `Activate the \`${skill}\` skill with the \`skill\` tool right now, before anything else, then follow it for this:

${subject}`;
}

/** `/grill [topic]` — hands the run straight to the built-in grilling skill. */
export function grillDirective(topic: string): string {
  const subject = topic.trim()
    ? `<topic>\n${topic.trim()}\n</topic>`
    : "No topic was given — grill me about what we have been discussing in this conversation. If that is unclear, make your FIRST question the one that establishes what we are grilling.";
  return `Activate the \`grilling\` skill with the \`skill\` tool right now, before anything else, then run the session on this:

${subject}

Read whatever you need from the workspace to ground your questions. Do not change anything until we agree we share an understanding.`;
}
export function claudeCodeDirective(request: string): string {
  return `The user wants to drive a Claude Code agent through you. Their request:

<request>
${request}
</request>

You are the orchestrator, not the implementer. Do not write the code yourself.
1. Call read_agent_output to see whether a Claude Code agent is already active in this session.
2. If none is active: turn the request into one clear, complete, self-contained prompt (state the concrete goal, relevant constraints, and what "done" looks like) and call spawn_coding_agent with it.
3. If one is active: read its latest output, then craft a precise follow-up and call send_to_agent.
Sharpen vague requests into precise engineering instructions; keep each agent prompt focused on one coherent unit of work.`;
}

export const INIT_PROMPT = `Scan this workspace and produce AGENTS.md at the workspace root — the portable agent-context file every coding tool reads — with:

- One-paragraph project description.
- Build / test / dev commands.
- Architecture overview (subsystems, data flow, key dirs).
- Conventions worth knowing (naming, patterns, gotchas).
- Paths to entry points.

Use grep/glob/list_directory/read_file to explore. If AGENTS.md already exists, read it first and update it in place rather than overwriting. Cap it under 200 lines. Use write_file (or edit for an update) — it goes through normal approval.`;
