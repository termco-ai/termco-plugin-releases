/**
 * Per-window go-to-definition jump-back stack (Ctrl+-). Module scope = one
 * stack per renderer window, which is exactly the VS Code semantic. Plain
 * module state — consumed from CodeMirror extensions and the global shortcut,
 * no React reactivity needed.
 */

export type JumpLocation = {
  path: string;
  /** 0-based, LSP-style. */
  line: number;
  character: number;
};

const MAX_STACK = 50;
const stack: JumpLocation[] = [];

export function pushJump(location: JumpLocation): void {
  stack.push(location);
  if (stack.length > MAX_STACK) stack.shift();
}

export function popJump(): JumpLocation | null {
  return stack.pop() ?? null;
}


/** Test seam. */
export function _clearJumpStack(): void {
  stack.length = 0;
}
