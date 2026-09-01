export interface AiLiveTab {
  id: number;
  kind: string;
  title: string;
  active: boolean;
}

export interface AiLiveBrowserTab {
  id: number;
  url: string;
  title: string;
}

export interface AiLiveManagedAgent {
  leafId: number;
  tabId: number;
  phase: "spawning" | "working" | "reviewing" | "done";
  rounds: number;
  maxRounds: number;
}

/** Stable application-wide facade used by AI workflows to observe and act on
 * the currently mounted workspace without owning any SSH, PTY, tab, or browser
 * runtime itself. */
export interface AiLiveCapability {
  getCwd(rigId?: string): string | null;
  getTerminalContext(rigId?: string): string | null;
  isActiveTerminalPrivate(rigId?: string): boolean;
  injectIntoActivePty(text: string, rigId?: string): boolean;
  runInActiveTerminal(
    command: string,
    rigId?: string,
    settleMs?: number,
  ): Promise<{ output: string; cwd: string | null } | { error: string }>;
  getWorkspaceRoot(): string | null;
  getActiveFile(): string | null;
  getActiveKind(): string | null;
  setAgentCwd(cwd: string | null): void;
  openPreview(url: string): boolean;
  getBrowserTabId(rigId?: string): number | null;
  openBrowser(url: string, rigId?: string): number;
  listBrowserTabs(rigId?: string): AiLiveBrowserTab[];
  switchBrowserTab(id: number): boolean;
  closeBrowserTab(id: number): boolean;
  listTabs(rigId?: string): AiLiveTab[];
  focusView(
    target: { id?: number; kind?: string },
    rigId?: string,
  ): { ok: boolean; created?: boolean };
  spawnManagedAgent(
    prompt: string,
    sessionId: string,
  ): { tabId: number; leafId: number } | null;
  /** Optional managed-agent control supplied by the selected workflow plugin. */
  getManagedAgent?(sessionId: string): AiLiveManagedAgent | null;
  sendManagedAgentInstruction?(
    sessionId: string,
    instruction: string,
  ): Promise<{ ok: boolean; round?: number; error?: string }>;
  readManagedAgentOutput?(sessionId: string): string | null;
  readLeafBuffer(leafId: number): string | null;
}

/** Narrow producer port. Feature plugins contribute only the methods backed by
 * capabilities they already consume; the selected provider owns precedence,
 * fallback, lifetime, and the stable facade. */
export interface AiLiveContributionCapability {
  contribute(partial: Partial<AiLiveCapability>): () => void;
}

export type AiLiveContribution = Partial<AiLiveCapability>;

export interface AiLiveContributionRegistry {
  register(entry: AiLiveContribution): Dispose;
  snapshot(): readonly AiLiveContribution[];
}
import type { Dispose } from "@termco/kernel";
