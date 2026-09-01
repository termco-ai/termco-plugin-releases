import type { Dispose } from "@termco/kernel";

const mounted = new Map<string, Promise<void>>();
const waiting = new Map<string, Set<(painted: Promise<void>) => void>>();

function afterCommittedPaint(): Promise<void> {
  if (
    typeof requestAnimationFrame === "function" &&
    (typeof document === "undefined" || document.visibilityState !== "hidden")
  ) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Register the actual transcript row commit for one canonical tool call. */
export function markToolPresentationMounted(
  toolCallId: string,
  element?: HTMLElement,
): Dispose {
  if (!toolCallId) return () => {};
  const painted = afterCommittedPaint().then(() => {
    if (element?.isConnected) {
      element.dataset.toolPresentedAt = String(Date.now());
    }
  });
  mounted.set(toolCallId, painted);
  for (const resolve of waiting.get(toolCallId) ?? []) resolve(painted);
  waiting.delete(toolCallId);
  return () => {
    if (mounted.get(toolCallId) === painted) mounted.delete(toolCallId);
    if (element) delete element.dataset.toolPresentedAt;
  };
}

/** Wait for the real tool row to commit and cross a paint boundary. Closed or
 * headless chat surfaces use a bounded fallback so background runs cannot
 * deadlock indefinitely. */
export async function waitForToolPresentation(
  toolCallId: string,
  signal?: AbortSignal,
  timeoutMs = 1_000,
): Promise<void> {
  const current = mounted.get(toolCallId);
  if (current) {
    await current;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      listeners.delete(accept);
      if (listeners.size === 0) waiting.delete(toolCallId);
      if (error) reject(error);
      else resolve();
    };
    const accept = (painted: Promise<void>) => {
      void painted.then(() => finish(), finish);
    };
    const abort = () => finish(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    const listeners = waiting.get(toolCallId) ?? new Set();
    listeners.add(accept);
    waiting.set(toolCallId, listeners);
    timer = setTimeout(() => finish(), timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
