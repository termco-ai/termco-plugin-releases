import type {
  BrowserAutomationCapability,
  BrowserConsoleEntry,
  BrowserKeyEvent,
  BrowserNetworkEntry,
  BrowserOpenUrlEvent,
  BrowserPickResult,
  BrowserRect,
  BrowserTabState,
} from "@termco/browser-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import { BROWSER_EVENTS } from "@termco/browser-base";

type Listener = () => void;
const MAX_LOGS = 500;
const EMPTY_CONSOLE: BrowserConsoleEntry[] = [];
const EMPTY_NETWORK: BrowserNetworkEntry[] = [];

export class BrowserClient {
  readonly states = new Map<number, BrowserTabState>();
  readonly console = new Map<number, BrowserConsoleEntry[]>();
  readonly network = new Map<number, BrowserNetworkEntry[]>();
  readonly #listeners = new Set<Listener>();
  readonly #disposers: Array<() => void> = [];

  constructor(
    readonly automation: BrowserAutomationCapability,
    events: ApplicationEventsCapability,
  ) {
    try {
      this.#disposers.push(events.subscribe(BROWSER_EVENTS.state, (payload) => {
        const state = payload as BrowserTabState;
        this.states.set(state.tabId, state);
        this.#notify();
      }));
      this.#disposers.push(events.subscribe(BROWSER_EVENTS.console, (payload) => {
        const { tabId, entry } = payload as { tabId: number; entry: BrowserConsoleEntry };
        this.console.set(tabId, [...(this.console.get(tabId) ?? []), entry].slice(-MAX_LOGS));
        this.#notify();
      }));
      this.#disposers.push(events.subscribe(BROWSER_EVENTS.network, (payload) => {
        const { tabId, entry } = payload as { tabId: number; entry: BrowserNetworkEntry };
        const current = this.network.get(tabId) ?? [];
        const index = current.findIndex((item) => item.requestId === entry.requestId);
        const next = index < 0 ? [...current, entry].slice(-MAX_LOGS) : current.map((item, at) => at === index ? entry : item);
        this.network.set(tabId, next);
        this.#notify();
      }));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  onOpenUrl(events: ApplicationEventsCapability, listener: (event: BrowserOpenUrlEvent) => void): () => void {
    return events.subscribe(BROWSER_EVENTS.openUrl, (payload) => listener(payload as BrowserOpenUrlEvent));
  }

  onKey(events: ApplicationEventsCapability, listener: (event: BrowserKeyEvent) => void): () => void {
    return events.subscribe(BROWSER_EVENTS.key, (payload) => listener(payload as BrowserKeyEvent));
  }

  state(tabId: number): BrowserTabState | null { return this.states.get(tabId) ?? null; }
  consoleEntries(tabId: number): BrowserConsoleEntry[] { return this.console.get(tabId) ?? EMPTY_CONSOLE; }
  networkEntries(tabId: number): BrowserNetworkEntry[] { return this.network.get(tabId) ?? EMPTY_NETWORK; }

  invoke<T = void>(command: string, payload: Record<string, unknown> = {}): Promise<T> {
    return this.automation.invoke(command, payload) as Promise<T>;
  }

  create(tabId: number, url: string, bounds: BrowserRect) { return this.invoke<BrowserTabState | null>("browser_create", { tabId, url, bounds }); }
  destroy(tabId: number) { this.states.delete(tabId); this.console.delete(tabId); this.network.delete(tabId); this.#notify(); return this.invoke("browser_destroy", { tabId }); }
  setBounds(tabId: number, bounds: BrowserRect) { return this.invoke("browser_set_bounds", { tabId, bounds }); }
  setVisible(tabId: number, visible: boolean) { return this.invoke("browser_set_visible", { tabId, visible }); }
  loadUrl(tabId: number, url: string) { return this.invoke("browser_load_url", { tabId, url }); }
  focus(tabId: number) { return this.invoke("browser_focus", { tabId }); }
  focusHost() { return this.invoke("browser_focus_host"); }
  reload(tabId: number) { return this.invoke("browser_reload", { tabId }); }
  stop(tabId: number) { return this.invoke("browser_stop", { tabId }); }
  back(tabId: number) { return this.invoke("browser_go_back", { tabId }); }
  forward(tabId: number) { return this.invoke("browser_go_forward", { tabId }); }
  pick(tabId: number) { return this.invoke<BrowserPickResult>("browser_ai_pick", { tabId }); }

  dispose(): void {
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
    this.#listeners.clear();
  }

  #notify(): void { for (const listener of [...this.#listeners]) listener(); }
}
