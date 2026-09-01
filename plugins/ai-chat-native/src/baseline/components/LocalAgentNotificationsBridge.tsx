import {
  routeAgentNotification,
  setLocalAgent,
  type AgentStatus,
} from "../runtime/localAgentNotifications";
import { useEffect, useRef } from "react";
import { useChatStore } from "../store/chatStore";

const AGENT = "Termco";

type RunStatus =
  | "idle"
  | "thinking"
  | "streaming"
  | "awaiting-approval"
  | "error";

function isBusy(s: RunStatus): boolean {
  return s === "thinking" || s === "streaming" || s === "awaiting-approval";
}

function liveStatus(s: RunStatus): AgentStatus | null {
  if (s === "awaiting-approval") return "waiting";
  if (s === "thinking" || s === "streaming") return "working";
  return null;
}

export function LocalAgentNotificationsBridge() {
  const status = useChatStore((s) => s.agentMeta.status) as RunStatus;
  const error = useChatStore((s) => s.agentMeta.error);
  const visible = useChatStore((s) => s.panelOpen || s.mini.open);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const prev = useRef<RunStatus>(status);

  useEffect(() => {
    setLocalAgent(
      liveStatus(status)
        ? {
            agent: AGENT,
            status: liveStatus(status)!,
            activate: () => useChatStore.getState().openPanel(),
          }
        : null,
    );

    const was = prev.current;
    prev.current = status;
    if (was === status) return;

    const fire = (
      kind: "attention" | "finished" | "error",
      title: string,
      body?: string,
    ) =>
      routeAgentNotification({
        agent: AGENT,
        kind,
        title,
        body,
        visible: visibleRef.current,
        activate: () => useChatStore.getState().openPanel(),
      });

    if (status === "awaiting-approval") {
      fire(
        "attention",
        "Termco needs your approval",
        "Approve a tool to continue",
      );
    } else if (status === "error") {
      fire("error", "Termco run failed", error ?? undefined);
    } else if (status === "idle" && isBusy(was)) {
      fire("finished", "Termco finished", "Your task is ready");
    }
  }, [status, error]);

  useEffect(() => () => setLocalAgent(null), []);

  return null;
}
