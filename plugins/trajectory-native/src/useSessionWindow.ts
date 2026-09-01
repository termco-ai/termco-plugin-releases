import type { SessionHistoryCapability, SessionId, SessionSeq } from "@termco/session-base";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  createSessionWindowController,
  type SessionWindowControllerSnapshot,
} from "./sessionWindowController";

export interface UseSessionWindowResult extends SessionWindowControllerSnapshot {
  readonly loadEarlier: () => Promise<void>;
  readonly loadAround: (seq: SessionSeq) => Promise<void>;
  readonly refresh: () => Promise<void>;
}

export function useSessionWindow(
  history: SessionHistoryCapability,
  sessionId: SessionId,
): UseSessionWindowResult {
  const controller = useMemo(
    () => createSessionWindowController(history, sessionId),
    [history, sessionId],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  return useMemo(
    () => ({
      ...snapshot,
      loadEarlier: () => controller.loadEarlier(),
      loadAround: (seq: SessionSeq) => controller.loadAround(seq),
      refresh: () => controller.refresh(),
    }),
    [controller, snapshot],
  );
}
