function firstWord(input: unknown): string | undefined {
  const command =
    input && typeof input === "object"
      ? (input as { command?: unknown }).command
      : undefined;
  return typeof command === "string" ? command.trim().split(/\s+/)[0] : undefined;
}

function isShellLike(name: string): boolean {
  return ["bash", "shell", "bash_run", "terminal_run"].includes(name.toLowerCase());
}

export function makeRule(name: string, input: unknown): string {
  if (isShellLike(name)) {
    const first = firstWord(input);
    if (first) return `${name}(${first}:*)`;
  }
  return name;
}

export function matchesRule(
  rules: readonly string[],
  name: string,
  input: unknown,
): boolean {
  if (rules.includes(name)) return true;
  const first = isShellLike(name) ? firstWord(input) : undefined;
  return Boolean(first && rules.includes(`${name}(${first}:*)`));
}
