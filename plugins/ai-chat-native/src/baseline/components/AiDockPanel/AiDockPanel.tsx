/**
 * The docked AI panel: a full-height right-side surface showing the active
 * session's transcript, plan-mode strip, and todo strip. It is a *view* over
 * the same chat runtime the floating mini-window renders — hiding or closing
 * either surface never interrupts a running agent, because runs are driven by
 * the always-mounted AgentRunBridge and chat state lives in chatRuntime.
 * Composing happens in the bottom workspace input bar (single composer).
 */

import { Button } from "@termco/ui";
import { Spinner } from "@termco/ui";
import { cn } from "@termco/ui";
import {
  CodingAgentsPanel,
  countUnseen,
  getLaunchDir,
  useActiveAgentContext,
  useCodingAgentsStore,
  useDockViewLabels,
  usePendingAgentRun,
  useTrajectoryService,
  WorkflowsPanel,
} from "../../runtime/dockIntegrations";
import { type UIMessage, useChat } from "@ai-sdk/react";
import {
  AppWindowIcon,
  ArrowTurnBackwardIcon,
  Cancel01Icon,
  PulseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { requestWorkspaceRestore } from "../../lib/useWorkspaceSnapshot";
import { getOrCreateChat } from "../../store/chatRuntime";
import { useChatStore } from "../../store/chatStore";
import { AgentSwitcher } from "../AgentSwitcher";
import { AiChatView } from "../AiChat";
import { AiComposer } from "../AiComposer";
import { PlanModeStrip } from "../AiMiniWindow/Body";
import { ContextIndicator } from "../AiMiniWindow/ContextIndicator";
import { EmptyState } from "../AiMiniWindow/EmptyState";
import { SessionPicker } from "../AiMiniWindow/SessionPicker";
import { GrillingStrip } from "../GrillingStrip";
import { PlanDiffReview } from "../PlanDiffReview";
import { TodoStrip } from "../TodoStrip";

type Props = {
  onClose: () => void;
  /** Pop the transcript out into the floating mini-window. */
  onFloat: () => void;
};

export const DOCK_MODES = [
  { id: "chat", label: "chat" },
  { id: "agents", label: "agents" },
  { id: "workflows", label: "workflows" },
] as const;

export function resolvedDockModes(labels: {
  agents: string;
  workflows: string;
}) {
  return DOCK_MODES.map((mode) => {
    if (mode.id === "chat") return mode;
    const contributed = labels[mode.id];
    return {
      ...mode,
      // Keep the current lowercase defaults while still exposing a copied
      // provider's genuinely different public label after live replacement.
      label:
        contributed.toLocaleLowerCase() === mode.label
          ? mode.label
          : contributed,
    };
  });
}

export function AiDockPanel({ onClose, onFloat }: Props) {
  const sessionId = useChatStore((s) => s.activeSessionId);
  const miniOpen = useChatStore((s) => s.mini.open);
  // Chat is the in-app assistant; Agents contains supervised external runs;
  // Workflows contains
  // saved, parameterized command templates. Full-window modules stay outside
  // this dock and are coordinated by the host shell.
  const [mode, setMode] = useState<"chat" | "agents" | "workflows">("chat");

  // A pending "open agent run detail" request (trajectory Jump-to-run) flips
  // the dock into agents mode; CodingAgentsPanel consumes the request itself.
  const pendingAgentRun = usePendingAgentRun((s) => s.pending);
  useEffect(() => {
    if (pendingAgentRun) setMode("agents");
  }, [pendingAgentRun]);

  return (
    <div
      className="termco-panel no-scrollbar-deep relative flex h-full min-h-0 flex-col text-xs"
      data-testid="ai-panel"
    >
      <DockModeTabs mode={mode} onMode={setMode} />
      {mode === "workflows" ? (
        <div className="min-h-0 flex-1 text-sm">
          <WorkflowsPanel />
        </div>
      ) : mode === "agents" ? (
        <AgentsMode />
      ) : sessionId ? (
        <DockBody sessionId={sessionId} onClose={onClose} onFloat={onFloat} />
      ) : (
        <>
          <DockHeader
            step={null}
            isBusy={false}
            onClose={onClose}
            onFloat={onFloat}
          />
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            Loading sessions…
          </div>
        </>
      )}
      {/* The mini-window renders its own review overlay; avoid doubling it. */}
      {!miniOpen && <PlanDiffReview />}
    </div>
  );
}

/** The Agents tab body — resolves the ACTIVE rig's cwd + env (paired) so an
 * agent started in an SSH rig runs on the remote host. */
function AgentsMode() {
  const { cwd, workspace } = useActiveAgentContext(getLaunchDir() ?? ".");
  // Opt out of the dock root's text-xs squeeze — the agents surface is its
  // own, roomier layout (the Chat tab keeps the compact base).
  return (
    <div className="min-h-0 flex-1 text-sm">
      <CodingAgentsPanel defaultCwd={cwd} workspace={workspace} />
    </div>
  );
}

/** Segmented Chat / Agents switch at the very top of the dock. */
function DockModeTabs({
  mode,
  onMode,
}: {
  mode: "chat" | "agents" | "workflows";
  onMode: (m: "chat" | "agents" | "workflows") => void;
}) {
  const unseen = useCodingAgentsStore((s) => countUnseen(s.runs));
  const labels = useDockViewLabels();
  return (
    <div className="termco-toolbar flex h-9 shrink-0 items-center gap-1 border-b border-border/70 px-2">
      {resolvedDockModes(labels).map(({ id, label }) => (
        <button
          data-onboarding-target={`ai-dock.mode.${id}`}
          key={id}
          type="button"
          onClick={() => onMode(id)}
          className={cn(
            "flex h-6 items-center gap-1 rounded-[6px] px-2 text-xs font-medium capitalize transition-colors",
            mode === id
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          {label}
          {id === "agents" && unseen > 0 && mode !== "agents" ? (
            <span
              className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-xs font-semibold leading-none text-primary-foreground"
              role="status"
              aria-label={`${unseen} run${unseen === 1 ? "" : "s"} with new activity`}
            >
              {unseen}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function DockBody({
  sessionId,
  onClose,
  onFloat,
}: {
  sessionId: string;
  onClose: () => void;
  onFloat: () => void;
}) {
  const focusInput = useChatStore((s) => s.focusInput);
  const step = useChatStore((s) => s.agentMeta.step);
  // A compacted chat opens with no messages but is NOT empty: its summary card
  // must be there from the start, not only once the user types something.
  const compaction = useChatStore(
    (s) => s.sessions.find((x) => x.id === sessionId)?.compaction,
  );

  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat, throttle: 16 });
  const isBusy =
    helpers.status === "submitted" || helpers.status === "streaming";

  return (
    <>
      <DockHeader
        step={step}
        isBusy={isBusy}
        messages={helpers.messages}
        onClose={onClose}
        onFloat={onFloat}
      />

      <PlanModeStrip />

      <div className="flex min-h-0 flex-1 flex-col">
        {helpers.messages.length === 0 && !compaction ? (
          <EmptyState onPick={focusInput} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [&_.text-sm]:text-xs [&_p]:leading-relaxed">
            <AiChatView
              // Remount per session so the transcript lands at the bottom
              // instantly on open (StickToBottom initial="instant"), instead of
              // smooth-scrolling down when swapping in another session's history.
              key={sessionId}
              messages={helpers.messages}
              status={helpers.status}
              error={helpers.error}
              clearError={helpers.clearError}
              addToolApprovalResponse={helpers.addToolApprovalResponse}
              addToolOutput={helpers.addToolOutput}
              stop={helpers.stop}
            />
          </div>
        )}
      </div>

      <GrillingStrip messages={helpers.messages} />
      <TodoStrip sessionId={sessionId} />

      {/* The single self-contained composer moves here while the dock is open
          (WorkspaceInputBar yields it); one composer, one textarea ref. */}
      <AiComposer />
    </>
  );
}

/** "Open trajectory of this chat" — rendered ONLY while the trajectory
 * plugin's ring-2 service exists (reactive via its seam store, so toggling
 * the plugin at runtime adds/removes the button). */
function TrajectoryButton() {
  const trajectory = useTrajectoryService((s) => s.service);
  const sessionId = useChatStore((s) => s.activeSessionId);
  if (!trajectory || !sessionId) return null;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={() => trajectory.openSession(sessionId as never)}
      className="size-5"
      aria-label="Open trajectory"
      title="Open this chat's trajectory"
      data-testid="chat-open-trajectory"
    >
      <HugeiconsIcon icon={PulseIcon} size={11} strokeWidth={1.75} />
    </Button>
  );
}

export function RestoreWorkspaceButton() {
  const available = useChatStore((s) => s.snapshotAvailable);
  if (!available) return null;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={() => requestWorkspaceRestore()}
      className="size-5"
      aria-label="Restore workspace"
      title="Reopen the tabs from this chat"
    >
      <HugeiconsIcon
        icon={ArrowTurnBackwardIcon}
        size={11}
        strokeWidth={1.75}
      />
    </Button>
  );
}

function DockHeader({
  step,
  isBusy,
  messages,
  onClose,
  onFloat,
}: {
  step: string | null;
  isBusy: boolean;
  messages?: UIMessage[];
  onClose: () => void;
  onFloat: () => void;
}) {
  return (
    <div className="termco-toolbar flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-3">
      {/* Identity: agent + session title. Takes the free rig and truncates. */}
      <div className="shrink-0">
        <AgentSwitcher isMiniWindow />
      </div>
      <SessionPicker className="min-w-0 flex-1" />

      {/* Status + meta + actions: fixed width, never shrink. The live step
          label is shown in the transcript below, so the header only needs a
          compact busy spinner (step on hover). */}
      <div className="flex shrink-0 items-center gap-1">
        {isBusy ? (
          <span
            className="flex items-center text-muted-foreground"
            title={step ?? "Thinking…"}
          >
            <Spinner className="size-3" aria-label={step ?? "Thinking…"} />
          </span>
        ) : null}
        {messages !== undefined ? (
          <ContextIndicator messages={messages} />
        ) : null}
        <RestoreWorkspaceButton />
        <TrajectoryButton />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onFloat}
          className="size-5"
          aria-label="Float"
          title="Pop out to floating window"
        >
          <HugeiconsIcon icon={AppWindowIcon} size={11} strokeWidth={1.75} />
        </Button>
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
    </div>
  );
}
