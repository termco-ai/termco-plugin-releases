import type { SessionId, SessionSeq } from "@termco/session-base";

export type AiSessionRunStatus =
  | "idle"
  | "thinking"
  | "streaming"
  | "awaiting-approval"
  | "awaiting-input"
  | "error";

/** Small public read model for the application-wide chat/session provider.
 * Messages, tool calls, compaction, persistence, and model SDK objects remain
 * private to the provider plugin. */
export interface AiSessionsSnapshot {
  revision: number;
  panelOpen: boolean;
  miniOpen: boolean;
  selectedModelId: string;
  activeSessionId: string | null;
  agent: {
    status: AiSessionRunStatus;
    step: string | null;
    error: string | null;
  };
}

export interface BrowserPageElementContext {
  url: string;
  title: string;
  tag: string;
  role?: string;
  accessibleName?: string;
  text?: string;
}

/** Application-wide AI session controller. Consumers can navigate or attach
 * context without importing the selected provider's renderer stores. */
export interface AiSessionsCapability {
  snapshot(): AiSessionsSnapshot;
  subscribe(listener: () => void): () => void;
  openPanel(): void;
  closePanel(): void;
  togglePanel(): void;
  openMini(): void;
  closeMini(): void;
  focusInput(prefill?: string | null): void;
  attachSelection(text: string, source: "terminal" | "editor"): void;
  attachFile(path: string): void;
  attachImage(input: {
    dataUrl: string;
    name: string;
    text?: string;
    pageElement?: BrowserPageElementContext;
  }): void;
  openSession(sessionId: SessionId): Promise<void>;
  rerunFrom(input: {
    readonly sessionId: SessionId;
    readonly eventSeq: SessionSeq;
  }): Promise<{ readonly childSessionId: SessionId }>;
  sessionContext(sessionId: string): { rigId: string } | null;
  sendMessage(sessionId: string, text: string): Promise<void>;
  respondToApproval(approvalId: string, approved: boolean): void;
}

/** Provider-side binding seam used by the stable session-state owner. Chat or
 * another execution host may attach without replacing the public service. */
export interface AiSessionsHostControl {
  bind(delegate: AiSessionsCapability): () => void;
}
