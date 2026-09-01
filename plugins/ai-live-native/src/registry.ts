import type {
  AiLiveCapability,
  AiLiveContributionCapability,
  AiLiveContributionRegistry,
} from "@termco/ai-live-base";

const FALLBACKS: AiLiveCapability = {
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
  getManagedAgent: () => null,
  sendManagedAgentInstruction: async () => ({
    ok: false,
    error: "no managed agent is active",
  }),
  readManagedAgentOutput: () => null,
  readLeafBuffer: () => null,
};

const METHOD_KEYS = Object.keys(FALLBACKS) as (keyof AiLiveCapability)[];

export class AiLiveRegistry
  implements AiLiveContributionCapability, AiLiveContributionRegistry
{
  readonly #contributions: Partial<AiLiveCapability>[] = [];
  readonly #live = Object.fromEntries(
    METHOD_KEYS.map((key) => [
      key,
      (...args: unknown[]) =>
        (this.#lookup(key) as (...values: unknown[]) => unknown)(...args),
    ]),
  ) as unknown as AiLiveCapability;

  live(): AiLiveCapability {
    return this.#live;
  }

  contribute(partial: Partial<AiLiveCapability>): () => void {
    this.#contributions.push(partial);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const index = this.#contributions.indexOf(partial);
      if (index >= 0) this.#contributions.splice(index, 1);
    };
  }

  register(partial: Partial<AiLiveCapability>): () => void {
    return this.contribute(partial);
  }

  snapshot(): readonly Partial<AiLiveCapability>[] {
    return [...this.#contributions];
  }

  #lookup<K extends keyof AiLiveCapability>(key: K): AiLiveCapability[K] {
    for (let index = this.#contributions.length - 1; index >= 0; index--) {
      const implementation = this.#contributions[index][key];
      if (implementation) return implementation as AiLiveCapability[K];
    }
    return FALLBACKS[key];
  }
}
