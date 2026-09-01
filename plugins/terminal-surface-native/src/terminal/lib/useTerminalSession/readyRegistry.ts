// Per-leaf "session ready" tracking: a leaf is marked ready once its shell
// integration first reports a cwd. Awaiters (whenSessionReady) resolve on that
// signal or after a timeout so callers never hang on a shell without OSC 7.

const readyLeaves = new Set<number>();
const readyWaiters = new Map<
  number,
  { resolve: () => void; timer: ReturnType<typeof setTimeout> }[]
>();

export function markSessionReady(leafId: number): void {
  if (readyLeaves.has(leafId)) return;
  readyLeaves.add(leafId);
  const waiters = readyWaiters.get(leafId);
  if (!waiters) return;
  readyWaiters.delete(leafId);
  for (const w of waiters) {
    clearTimeout(w.timer);
    w.resolve();
  }
}

export function whenSessionReady(
  leafId: number,
  timeoutMs = 4000,
): Promise<void> {
  if (readyLeaves.has(leafId)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const arr = readyWaiters.get(leafId);
      const i = arr?.findIndex((w) => w.timer === timer) ?? -1;
      if (arr && i >= 0) arr.splice(i, 1);
      resolve();
    }, timeoutMs);
    const arr = readyWaiters.get(leafId) ?? [];
    arr.push({ resolve, timer });
    readyWaiters.set(leafId, arr);
  });
}

// Called on session disposal: drop the ready flag and resolve any pending
// awaiters so they don't leak a timer or hang forever.
export function disposeReadyWaiters(leafId: number): void {
  readyLeaves.delete(leafId);
  const waiters = readyWaiters.get(leafId);
  if (waiters) {
    readyWaiters.delete(leafId);
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.resolve();
    }
  }
}
