/**
 * Allow-&-remember rule primitives, shared by the coding-agent driver (CLI
 * approvals) and the MCP approval pipeline. A remembered rule auto-approves a
 * matching future tool call with no card.
 *
 * Bash-like tools remember by their first command word (`Bash(npm:*)`) so
 * "allow npm" doesn't blanket-allow every shell command; everything else
 * remembers by the bare tool name.
 */

function firstWord(input: unknown): string | undefined {
  const cmd =
    input && typeof input === "object"
      ? (input as { command?: unknown }).command
      : undefined;
  return typeof cmd === "string" ? cmd.trim().split(/\s+/)[0] : undefined;
}

function isShellLike(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === "bash" ||
    lower === "shell" ||
    lower === "bash_run" ||
    lower === "terminal_run"
  );
}

/** Build the rule string a tool call would be remembered as. */
export function makeRule(name: string, input: unknown): string {
  if (isShellLike(name)) {
    const first = firstWord(input);
    if (first) return `${name}(${first}:*)`;
  }
  return name;
}

/** Whether any remembered rule matches this tool call. */
export function matchesRule(rules: readonly string[], name: string, input: unknown): boolean {
  if (rules.includes(name)) return true;
  if (isShellLike(name)) {
    const first = firstWord(input);
    if (first && rules.includes(`${name}(${first}:*)`)) return true;
  }
  return false;
}
// Owned by the coding-agent-native provider plugin.
