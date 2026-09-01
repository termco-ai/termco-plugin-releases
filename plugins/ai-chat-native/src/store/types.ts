/**
 * Shared types for the chat store: the live AI capability, agent-run status
 * enum + metadata, transient UI state shapes, and the full Zustand store shape.
 */

import type { AiLiveCapability } from "@termco/ai-live-base";
import type { AiProviderId as ProviderId } from "@termco/ai-models-base";
import type { ForkBoundaryIntent } from "@termco/session-base";
import type { UIMessage } from "@ai-sdk/react";
import type { SessionMeta } from "../sessions";

export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type ProviderKeys = Record<ProviderId, string | null>;
export type CustomEndpointKeys = Record<string, string | null>;

export type AgentRunStatus =
  | "idle"
  | "thinking"
  | "streaming"
  | "awaiting-approval"
  | "awaiting-input"
  | "error";

export type AgentMeta = {
  status: AgentRunStatus;
  step: string | null;
  approvalsPending: number;
  error: string | null;
  tokens: AgentUsage;
  lastInputTokens: number;
  lastCachedTokens: number;
  /** Output tokens/second of the latest step (0 = not yet measured). */
  lastTokensPerSecond: number;
  /** Time to the run's first output chunk in ms (0 = not yet measured). */
  timeToFirstOutputMs: number;
  hitStepCap: boolean;
  /**
   * A compaction is running right now. It blocks the composer and shows a
   * cancel affordance — compaction is an operation the user watches, not a
   * flag consumed by some later request.
   */
  /**
   * A compaction in flight, and WHICH session it belongs to. Without the id a
   * compaction running in a background rig froze the composer app-wide.
   */
  compacting: { startedAt: number; sessionId: string } | null;
  compactionNotice: {
    droppedCount: number;
    at: number;
    tier: "summary" | "persisted" | "elided" | "clamped";
  } | null;
};

export type MiniState = {
  open: boolean;
};

export type PendingSelection = {
  id: string;
  text: string;
  source: "terminal" | "editor";
};

export type ApprovalResponder = (approvalId: string, approved: boolean) => void;

export type StoreState = {
  live: AiLiveCapability;
  setLive: (live: AiLiveCapability) => void;

  /**
   * Set by AgentRunBridge each render. Lets surfaces outside the chat hook
   * tree (e.g. the AI diff tab in the editor area) resolve a pending tool
   * approval through the active session's `addToolApprovalResponse`.
   */
  approvalResponder: ApprovalResponder | null;
  setApprovalResponder: (fn: ApprovalResponder | null) => void;
  respondToApproval: (approvalId: string, approved: boolean) => void;

  apiKeys: ProviderKeys;
  setApiKeys: (keys: ProviderKeys) => void;
  setApiKey: (provider: ProviderId, key: string | null) => void;

  /** The initial keyring load finished (ai plugin bootstrap) — gates surfaces
   * that must not flash the "connect" state while keys are still loading. */
  keysLoaded: boolean;
  setKeysLoaded: (v: boolean) => void;

  customEndpointKeys: CustomEndpointKeys;
  setCustomEndpointKeys: (keys: CustomEndpointKeys) => void;

  selectedModelId: string;
  setSelectedModelId: (id: string) => void;

  mini: MiniState;
  openMini: () => void;
  closeMini: () => void;
  toggleMini: () => void;

  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  focusSignal: number;
  pendingPrefill: string | null;
  focusInput: (prefill?: string | null) => void;
  consumePrefill: () => string | null;

  pendingSelections: PendingSelection[];
  attachSelection: (text: string, source: "terminal" | "editor") => void;
  consumeSelections: () => PendingSelection[];

  agentMeta: AgentMeta;
  patchAgentMeta: (patch: Partial<AgentMeta>) => void;
  resetAgentMeta: () => void;

  // Sessions — a single global pool tagged per rig (see ../sessions).
  sessionsHydrated: boolean;
  sessions: SessionMeta[];
  activeSessionId: string | null;
  /** The rig whose chat is currently shown (driven by the active rig). */
  currentRigId: string;
  /** rigId → its active session id (per-rig memory). */
  activeByRig: Record<string, string | null>;
  hydrateSessions: () => Promise<void>;
  /** Point the chat at `rigId`'s active session (creating one if needed). */
  setCurrentRig: (rigId: string) => void;
  newSession: () => string;
  /** Fork the active conversation at a message into a new session (branch).
   * Returns the new session id, or null when it can't fork. */
  branchFrom: (messageId: string) => Promise<string | null>;
  /** Fork durably through the canonical session owner; the source is never modified. */
  forkSession: (input: {
    /** Which session is being forked. Defaults to the active one. */
    sourceSessionId?: string;
    boundary: ForkBoundaryIntent;
    title?: string;
    origin?: "fork" | "compaction";
    extra?: Partial<SessionMeta>;
  }) => Promise<string>;
  patchSession: (id: string, patch: Partial<SessionMeta>) => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
  /** Re-tag a deleted rig's chats onto another rig (default: Default). */
  reassignRig: (fromRigId: string, toRigId?: string) => void;
  renameSession: (id: string, title: string) => void;
  /** True when the active session has a saved workspace snapshot to restore. */
  snapshotAvailable: boolean;
  setSnapshotAvailable: (v: boolean) => void;
  /** Persist messages of a session and bump its updatedAt + auto-title. */
  persistMessages: (id: string, messages: UIMessage[]) => void;
};
