import { terminalRuntime } from "../../runtime";

type AgentSignal = { id: number; kind: string };

const active = new Set<number>();
let onExited: ((ptyId: number) => void) | null = null;
let bound = false;

// Covers shells without an OSC 133 C preexec hook (pwsh): the backend detector
// arms via the coding-agent OSC 777 marker and reports per-pty lifecycle.
export function ensureAgentActivityListener(
  exited: (ptyId: number) => void,
): void {
  onExited = exited;
}

export function startAgentActivityListener(): () => void {
  if (bound || typeof window === "undefined") return () => {};
  bound = true;
  const unsubscribe = terminalRuntime().events.subscribe("termco:agent-signal", (payload) => {
    const signal = payload as AgentSignal;
    if (signal.kind === "started") {
      active.add(signal.id);
    } else if (signal.kind === "exited") {
      active.delete(signal.id);
      onExited?.(signal.id);
    }
  });
  return () => {
    unsubscribe();
    active.clear();
    bound = false;
  };
}

export function isAgentActivePty(ptyId: number): boolean {
  return active.has(ptyId);
}
