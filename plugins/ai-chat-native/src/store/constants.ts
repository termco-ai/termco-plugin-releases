/** Default/empty values used to seed and reset the chat store. */

import type { AiLiveCapability } from "@termco/ai-live-base";
import type { AgentMeta, AgentUsage, ProviderKeys } from "./types";

const ZERO_USAGE: AgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
};

export const EMPTY_PROVIDER_KEYS: ProviderKeys = {
  openai: null,
  anthropic: null,
  google: null,
  xai: null,
  cerebras: null,
  groq: null,
  deepseek: null,
  mistral: null,
  openrouter: null,
  "openai-compatible": null,
  lmstudio: null,
  mlx: null,
  ollama: null,
};

export const IDLE_META: AgentMeta = {
  status: "idle",
  step: null,
  approvalsPending: 0,
  error: null,
  tokens: ZERO_USAGE,
  lastInputTokens: 0,
  lastCachedTokens: 0,
  lastTokensPerSecond: 0,
  timeToFirstOutputMs: 0,
  hitStepCap: false,
  compacting: null,
  compactionNotice: null,
};

export const NOOP_LIVE: AiLiveCapability = {
  getCwd: () => null,
  getTerminalContext: () => null,
  isActiveTerminalPrivate: () => false,
  injectIntoActivePty: () => false,
  runInActiveTerminal: async () => ({ error: "no terminal" }),
  getWorkspaceRoot: () => null,
  getActiveFile: () => null,
  getActiveKind: () => null,
  setAgentCwd: () => {},
  openPreview: () => false,
  getBrowserTabId: () => null,
  openBrowser: () => -1,
  listBrowserTabs: () => [],
  switchBrowserTab: () => false,
  closeBrowserTab: () => false,
  listTabs: () => [],
  focusView: () => ({ ok: false }),
  spawnManagedAgent: () => null,
  readLeafBuffer: () => null,
};
