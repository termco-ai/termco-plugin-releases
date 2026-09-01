export const running = new Map<string, AbortController>();

export function isCompacting(sessionId?: string): boolean {
  return sessionId ? running.has(sessionId) : running.size > 0;
}

export function cancelCompaction(sessionId?: string): void {
  if (sessionId) {
    running.get(sessionId)?.abort();
    return;
  }
  for (const controller of running.values()) controller.abort();
}
