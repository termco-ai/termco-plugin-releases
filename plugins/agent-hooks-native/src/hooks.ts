/**
 * Hook command + status-needle construction.
 * The backslash sequences below are intentional: they are shell/JSON escapes the
 * agent's own runtime interprets, so the string must carry them literally.
 */
import type { AgentSpec } from "./spec";

function oscCommand(agent: string, event: string): string {
  if (process.platform === "win32") {
    const exe = process.execPath;
    return `"${exe}" __termco_notify ${agent} ${event}`;
  }
  // eslint-disable-next-line no-useless-concat
  return `[ -n "$TERMCO_TERMINAL" ] && printf '\\033]777;notify;Termco;${agent};${event}\\007' > /dev/tty; printf '{}'`;
}

export function hookCommand(spec: AgentSpec, event: string): string {
  if (spec.delivery === "terminalSequence") {
    return `[ -n "$TERMCO_TERMINAL" ] && printf '{"terminalSequence":"\\\\u001b]777;notify;Termco;${event}\\\\u0007"}' || true`;
  }
  return oscCommand(spec.agent, event);
}

export function statusNeedle(spec: AgentSpec, event: string): string {
  if (spec.delivery === "terminalSequence") {
    return `notify;Termco;${event}`;
  }
  if (process.platform === "win32") {
    return `__termco_notify ${spec.agent} ${event}`;
  }
  return `notify;Termco;${spec.agent};${event}`;
}

export function conoutMarker(agent: string, event: string): string {
  return `\x1b]777;notify;Termco;${agent};${event}\x07`;
}
