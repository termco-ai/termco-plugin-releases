import type { UIMessage } from "@ai-sdk/react";
import { Cancel01Icon, Key01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@termco/ui";
import type { UiDockSurfaceContribution } from "@termco/ui-dock-base";
import type { UiOverlayContribution } from "@termco/ui-overlays-base";
import type {
  UiBackgroundContribution,
} from "@termco/ui-shell-base";
import type {
  WorkspaceRigsCapability,
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AgentRunBridge } from "../baseline/components/AgentRunBridge";
import type { DiffOpenInput } from "../baseline/components/AgentRunBridge";
import { AiDockPanel } from "../baseline/components/AiDockPanel/AiDockPanel";
import { AiMiniWindow } from "../baseline/components/AiMiniWindow/AiMiniWindow";
import { LocalAgentNotificationsBridge } from "../baseline/components/LocalAgentNotificationsBridge";
import { AiComposerProvider } from "../baseline/lib/composer";
import {
  completeE2EInteractiveTool,
  getOrCreateOwnedChat,
  inspectE2EEffectiveToolApproval,
  inspectE2EInferenceConfiguration,
  inspectE2EToolDefinitions,
  invokeE2ETool,
  stopOwnedChat,
} from "../chatRuntime";
import {
  activeContextLimit,
  activeThresholds,
} from "../baseline/store/chatRuntime/compaction";
import { speechConfiguration } from "../baseline/lib/stt";
import { useWorkspaceSnapshot } from "../baseline/lib/useWorkspaceSnapshot";
import { useChatStore } from "../store/store";
import { openSettingsWindow } from "../baseline/runtime/settings";

const MIN_DOCK_WIDTH = 360;
const MAX_DOCK_WIDTH = 560;
const DEFAULT_DOCK_WIDTH = 384;

function useHasComposer(): boolean {
  return useChatStore((state) =>
    [...Object.values(state.apiKeys), ...Object.values(state.customEndpointKeys)].some(
      Boolean,
    ),
  );
}

function usePresence(open: boolean, exitMs = 150) {
  const [mounted, setMounted] = useState(open);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (open) setMounted(true);
    else if (mounted) timer.current = setTimeout(() => setMounted(false), exitMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [exitMs, mounted, open]);

  return { mounted, state: open ? ("open" as const) : ("closed" as const) };
}

function AiProviderSetup({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="termco-toolbar flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <span className="text-xs font-medium text-foreground">Chat</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="size-5"
          aria-label="Close"
          title="Close (⌘I)"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-7 py-10">
        <div className="flex max-w-72 flex-col items-center text-center">
          <div className="mb-5 flex size-10 items-center justify-center rounded-lg border border-border bg-muted/35 text-muted-foreground">
            <HugeiconsIcon icon={Key01Icon} size={18} strokeWidth={1.6} />
          </div>
          <h2 className="text-sm font-medium tracking-tight text-foreground">
            Connect a provider to start
          </h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Use your own cloud key, a local runtime, or an OpenAI-compatible
            endpoint.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-5"
            onClick={() => void openSettingsWindow("models")}
          >
            Configure providers
          </Button>
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground/75">
            Credentials stay in your OS keychain.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AiDockSurface() {
  const panelOpen = useChatStore((state) => state.panelOpen);
  const keysLoaded = useChatStore((state) => state.keysLoaded);
  const hasComposer = useHasComposer();
  const closePanel = useChatStore((state) => state.closePanel);
  const openMini = useChatStore((state) => state.openMini);
  const [width, setWidth] = useState(DEFAULT_DOCK_WIDTH);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      drag.current = { startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = drag.current.startWidth - (event.clientX - drag.current.startX);
    setWidth(Math.min(MAX_DOCK_WIDTH, Math.max(MIN_DOCK_WIDTH, next)));
  }, []);
  const onFloat = useCallback(() => {
    closePanel();
    openMini();
  }, [closePanel, openMini]);

  if (!panelOpen || !keysLoaded) return null;
  return (
    <div
      data-onboarding-target="ai-chat.panel"
      className="relative flex h-full min-h-0 shrink-0 flex-col border-l border-border/70"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize AI panel"
        aria-valuenow={Math.round(width)}
        className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
      {hasComposer ? (
        <AiDockPanel onClose={closePanel} onFloat={onFloat} />
      ) : (
        <AiProviderSetup onClose={closePanel} />
      )}
    </div>
  );
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? path;
}

function approvalId(tab: WorkspaceTabRecord): string | null {
  const value = tab.data?.approvalId;
  return tab.kind === "ai-diff" && typeof value === "string" ? value : null;
}

export function openAiDiffTab(
  tabs: WorkspaceTabsCapability,
  input: DiffOpenInput,
): number | null {
  const snapshot = tabs.snapshot();
  const existing = snapshot.tabs.find((tab) => approvalId(tab) === input.approvalId);
  if (existing) {
    tabs.transition({ activeId: existing.id });
    return existing.id;
  }
  const id = tabs.allocate()[0];
  const tab: WorkspaceTabRecord = {
    id,
    kind: "ai-diff",
    rigId: snapshot.activeRigIdForNewTabs,
    title: `${basename(input.path)} (AI diff)`,
    data: { ...input, status: "pending" },
  };
  tabs.transition({ tabs: [...snapshot.tabs, tab], activeId: id });
  return id;
}

export function closeAiDiffTab(
  tabs: WorkspaceTabsCapability,
  targetApprovalId: string,
): void {
  const snapshot = tabs.snapshot();
  const target = snapshot.tabs.find((tab) => approvalId(tab) === targetApprovalId);
  if (!target) return;
  const fallback = tabs.nextActiveInRig(target.id);
  if (fallback === null) {
    tabs.transition({
      tabs: snapshot.tabs.map((tab) =>
        tab.id === target.id
          ? { ...tab, data: { ...tab.data, status: "approved" } }
          : tab,
      ),
    });
    return;
  }
  tabs.transition({
    tabs: snapshot.tabs.filter((tab) => tab.id !== target.id),
    ...(snapshot.activeId === target.id ? { activeId: fallback } : {}),
  });
}

function createAiOverlay(tabs: WorkspaceTabsCapability) {
  return function AiOverlays() {
    const hasComposer = useHasComposer();
    const miniOpen = useChatStore((state) => state.mini.open);
    const miniPresence = usePresence(miniOpen, 200);
    return (
      <>
        {hasComposer ? (
          <>
            <AgentRunBridge
              openAiDiffTab={(input) => openAiDiffTab(tabs, input)}
              closeAiDiffTab={(id) => closeAiDiffTab(tabs, id)}
            />
            <LocalAgentNotificationsBridge />
          </>
        ) : null}
        {hasComposer && miniPresence.mounted ? (
          <AiMiniWindow state={miniPresence.state} />
        ) : null}
      </>
    );
  };
}

export function AiSessionBackground({
  workspaceRigs,
  workspaceTabs,
}: {
  workspaceRigs: WorkspaceRigsCapability;
  workspaceTabs: WorkspaceTabsCapability;
}) {
  const rigs = useSyncExternalStore(
    (listener) => workspaceRigs.subscribe(listener),
    () => workspaceRigs.snapshot(),
    () => workspaceRigs.snapshot(),
  );
  const previousRigs = useRef<Set<string>>(new Set());
  const tabs = useSyncExternalStore(
    (listener) => workspaceTabs.subscribe(listener),
    () => workspaceTabs.snapshot(),
    () => workspaceTabs.snapshot(),
  );
  const activeSessionId = useChatStore((state) => state.activeSessionId);

  useEffect(() => {
    if (!rigs.hydrated) return;
    const current = new Set(rigs.rigs.map((rig) => rig.id));
    for (const rigId of previousRigs.current) {
      if (!current.has(rigId)) useChatStore.getState().reassignRig(rigId);
    }
    previousRigs.current = current;
    if (rigs.activeId) useChatStore.getState().setCurrentRig(rigs.activeId);
  }, [rigs]);

  useWorkspaceSnapshot({
    tabs: tabs.tabs,
    activeRigId: rigs.activeId ?? "default",
    activeSessionId,
    enabled: rigs.hydrated && tabs.initialized,
    allocId: () => workspaceTabs.allocate(1)[0],
    replaceTabs: (next, nextActiveId) =>
      workspaceTabs.transition({ tabs: next, activeId: nextActiveId }),
  });

  useEffect(() => {
    const host = window as unknown as {
      __termco?: { e2e?: boolean };
      __termcoE2E?: Record<string, unknown>;
    };
    if (!host.__termco?.e2e) return;
    const aiSessionState = () => {
      const state = useChatStore.getState();
      return {
        activeSessionId: state.activeSessionId,
        panelOpen: state.panelOpen,
        miniOpen: state.mini.open,
        keysLoaded: state.keysLoaded,
        hasProviderKey: [...Object.values(state.apiKeys), ...Object.values(state.customEndpointKeys)].some(Boolean),
        currentRigId: state.currentRigId,
        sessions: state.sessions.map((session) => ({
          id: session.id,
          rigId: session.rigId,
        })),
      };
    };
    const aiSeedMessages = (messages: unknown[]) => {
      const sessionId = useChatStore.getState().activeSessionId;
      if (!sessionId) return false;
      getOrCreateOwnedChat(sessionId).messages = messages as UIMessage[];
      return true;
    };
    const aiToolDefinitions = () => inspectE2EToolDefinitions();
    const aiInferenceConfiguration = () => inspectE2EInferenceConfiguration();
    const aiInvokeTool = (name: string, input: unknown) =>
      invokeE2ETool(name, input);
    const aiCompleteInteractiveTool = (name: string, input: unknown, output: unknown) =>
      completeE2EInteractiveTool(name, input as never, output as never);
    const aiEffectiveToolApproval = (name: string, input: unknown) =>
      inspectE2EEffectiveToolApproval(name, input);
    const aiContextState = () => ({
      modelId: useChatStore.getState().selectedModelId,
      contextLimit: activeContextLimit(),
      thresholds: activeThresholds(),
    });
    const aiSpeechConfiguration = () => speechConfiguration();
    const aiLiveKind = () => useChatStore.getState().live.getActiveKind();
    const aiSpawnManagedAgent = (prompt: string, sessionId: string) =>
      useChatStore.getState().live.spawnManagedAgent(prompt, sessionId);
    const aiStopChat = (sessionId: string) => stopOwnedChat(sessionId);
    const seam = (host.__termcoE2E ??= {});
    seam.aiSessionState = aiSessionState;
    seam.aiSeedMessages = aiSeedMessages;
    seam.aiToolDefinitions = aiToolDefinitions;
    seam.aiInferenceConfiguration = aiInferenceConfiguration;
    seam.aiInvokeTool = aiInvokeTool;
    seam.aiCompleteInteractiveTool = aiCompleteInteractiveTool;
    seam.aiEffectiveToolApproval = aiEffectiveToolApproval;
    seam.aiContextState = aiContextState;
    seam.aiSpeechConfiguration = aiSpeechConfiguration;
    seam.aiLiveKind = aiLiveKind;
    seam.aiSpawnManagedAgent = aiSpawnManagedAgent;
    seam.aiStopChat = aiStopChat;
    return () => {
      if (seam.aiSessionState === aiSessionState) delete seam.aiSessionState;
      if (seam.aiSeedMessages === aiSeedMessages) delete seam.aiSeedMessages;
      if (seam.aiToolDefinitions === aiToolDefinitions) delete seam.aiToolDefinitions;
      if (seam.aiInferenceConfiguration === aiInferenceConfiguration) {
        delete seam.aiInferenceConfiguration;
      }
      if (seam.aiInvokeTool === aiInvokeTool) delete seam.aiInvokeTool;
      if (seam.aiCompleteInteractiveTool === aiCompleteInteractiveTool) {
        delete seam.aiCompleteInteractiveTool;
      }
      if (seam.aiEffectiveToolApproval === aiEffectiveToolApproval) {
        delete seam.aiEffectiveToolApproval;
      }
      if (seam.aiStopChat === aiStopChat) delete seam.aiStopChat;
      if (seam.aiContextState === aiContextState) delete seam.aiContextState;
      if (seam.aiSpeechConfiguration === aiSpeechConfiguration) {
        delete seam.aiSpeechConfiguration;
      }
      if (seam.aiLiveKind === aiLiveKind) delete seam.aiLiveKind;
      if (seam.aiSpawnManagedAgent === aiSpawnManagedAgent) {
        delete seam.aiSpawnManagedAgent;
      }
    };
  }, []);

  return null;
}

export const aiDockContribution: UiDockSurfaceContribution = {
  id: "ai-chat",
  order: 0,
  Component: AiDockSurface,
};

export function createAiOverlayContribution(
  tabs: WorkspaceTabsCapability,
): UiOverlayContribution {
  return {
    id: "ai-chat-overlays",
    label: "AI chat overlays",
    description: "Floating application-wide AI conversation and approvals.",
    order: 30,
    Component: createAiOverlay(tabs),
  };
}

export function createAiBackgroundContribution(
  workspaceRigs: WorkspaceRigsCapability,
  workspaceTabs: WorkspaceTabsCapability,
): UiBackgroundContribution {
  return {
    id: "ai-session-binding",
    label: "AI session binding",
    description:
      "Keeps the application-wide conversation pool aligned with the active workspace rig.",
    order: 20,
    Component: () => (
      <AiComposerProvider>
        <AiSessionBackground
          workspaceRigs={workspaceRigs}
          workspaceTabs={workspaceTabs}
        />
      </AiComposerProvider>
    ),
  };
}

export function visibleMessageText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
}
