import type { PresenceState } from "@termco/ui";
import { lazy, Suspense } from "react";
import type { AgentRunBridgeProps } from "./AgentRunBridge";

const AgentRunBridgeInner = lazy(() =>
  import("./AgentRunBridge").then((m) => ({ default: m.AgentRunBridge })),
);

const AiMiniWindowInner = lazy(() =>
  import("./AiMiniWindow").then((m) => ({ default: m.AiMiniWindow })),
);

const AiDockPanelInner = lazy(() =>
  import("./AiDockPanel").then((m) => ({ default: m.AiDockPanel })),
);

const AiInputBarConnectInner = lazy(() =>
  import("./AiInputBar").then((m) => ({ default: m.AiInputBarConnect })),
);

export function AgentRunBridge(props: AgentRunBridgeProps) {
  return (
    <Suspense fallback={null}>
      <AgentRunBridgeInner {...props} />
    </Suspense>
  );
}

export function AiMiniWindow({ state }: { state: PresenceState }) {
  return (
    <Suspense fallback={null}>
      <AiMiniWindowInner state={state} />
    </Suspense>
  );
}

export function AiDockPanel(props: {
  onClose: () => void;
  onFloat: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <AiDockPanelInner {...props} />
    </Suspense>
  );
}

export function AiInputBarConnect({ onAdd }: { onAdd: () => void }) {
  return (
    <Suspense fallback={null}>
      <AiInputBarConnectInner onAdd={onAdd} />
    </Suspense>
  );
}
