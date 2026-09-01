import type {
  AiBrowserPolicyCapability,
  AiToolContribution,
  AiToolDefinition,
  AiToolRuntime,
} from "@termco/ai-tools-base";
import type { BrowserAutomationCapability } from "@termco/browser-base";

const EMPTY = { type: "object", properties: {}, additionalProperties: false };
const allowlist = new Map<string, Set<string>>();
const BROWSER_VIEW_READY_POLL_MS = 25;
const BROWSER_VIEW_READY_ATTEMPTS = 81;
const NO_BROWSER_TAB = "no browser tab open";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

function definition(
  description: string,
  inputSchema: Record<string, unknown>,
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>,
  needsApproval?: AiToolDefinition["needsApproval"],
  toModelOutput?: AiToolDefinition["toModelOutput"],
): AiToolDefinition {
  return { description, inputSchema, execute: (input) => execute(values(input)), ...(needsApproval !== undefined ? { needsApproval } : {}), ...(toModelOutput ? { toModelOutput } : {}) };
}

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]" || host === "::1" || host.endsWith(".localhost");
}

export function safeOrigin(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

export function originNeedsApproval(sessionId: string | null, origin: string | null): boolean {
  if (!origin) return true;
  try {
    if (isLoopbackHost(new URL(origin).hostname)) return false;
  } catch { return true; }
  return !sessionId || !(allowlist.get(sessionId)?.has(origin) ?? false);
}

export class BrowserToolSet {
  constructor(private readonly browser: BrowserAutomationCapability) {}

  contribution(): AiToolContribution {
    return { id: "browser", group: "browser", order: 190, build: (runtime) => this.tools(runtime) };
  }

  policy(): AiBrowserPolicyCapability {
    return {
      allowCurrentOrigin: async (sessionId, tabId) => {
        const status = await this.call("browser_ai_status", { tabId });
        const origin = typeof status.url === "string" ? safeOrigin(status.url) : null;
        if (!origin) return null;
        const origins = allowlist.get(sessionId) ?? new Set<string>();
        origins.add(origin);
        allowlist.set(sessionId, origins);
        return origin;
      },
    };
  }

  private async call(command: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.browser.invoke(command, payload);
    return result && typeof result === "object" ? result as Record<string, unknown> : { value: result };
  }

  private async waitForBrowserView(tabId: number): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < BROWSER_VIEW_READY_ATTEMPTS; attempt += 1) {
      const status = await this.call("browser_ai_status", { tabId });
      const waitingForView = status.error === NO_BROWSER_TAB;
      const waitingForNavigation = status.error === undefined &&
        (typeof status.url !== "string" || status.url.length === 0);
      if (!waitingForView && !waitingForNavigation) return status;
      if (attempt < BROWSER_VIEW_READY_ATTEMPTS - 1) {
        await delay(BROWSER_VIEW_READY_POLL_MS);
      }
    }
    return { error: "browser tab did not become ready" };
  }

  tools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    const tab = (): number | { error: string } => {
      const id = runtime.getBrowserTabId?.();
      return id == null ? { error: "no browser tab open — call browser_navigate first" } : id;
    };
    const sessionId = () => runtime.getSessionId?.() ?? null;
    const currentOrigin = async (): Promise<string | null> => {
      const id = runtime.getBrowserTabId?.();
      if (id == null) return null;
      const status = await this.call("browser_ai_status", { tabId: id });
      return typeof status.url === "string" ? safeOrigin(status.url) : null;
    };
    const actionApproval = async () => originNeedsApproval(sessionId(), await currentOrigin());
    const invokeTab = async (command: string, payload: Record<string, unknown> = {}) => {
      const id = tab();
      return typeof id === "number" ? this.call(command, { tabId: id, ...payload }) : id;
    };
    const openReadyBrowser = async (target: string) => {
      if (!runtime.openBrowser) return { error: "browser surface unavailable" };
      const id = runtime.openBrowser(target);
      if (!Number.isInteger(id) || id < 0) {
        return { error: "browser surface unavailable" };
      }
      const status = await this.waitForBrowserView(id);
      if ("error" in status) {
        runtime.closeBrowserTab?.(id);
        return { ...status, tabId: id, url: target };
      }
      return { ...status, ok: true, tabId: id };
    };

    return {
      browser_navigate: definition(
        "Navigate the shared embedded browser, opening a browser tab if necessary. Existing logins and page state are preserved.",
        { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
        async ({ url }) => {
          const target = String(url ?? "");
          if (!safeOrigin(target)) return { error: "invalid URL", url: target };
          let id = runtime.getBrowserTabId?.() ?? null;
          if (id == null) {
            return openReadyBrowser(target);
          } else {
            let result = await this.call("browser_ai_navigate", { tabId: id, url: target });
            if (result.error === NO_BROWSER_TAB) {
              const ready = await this.waitForBrowserView(id);
              if ("error" in ready) return { ...ready, tabId: id, url: target };
              result = await this.call("browser_ai_navigate", { tabId: id, url: target });
            }
            if ("error" in result) return result;
          }
          const status = await this.call("browser_ai_status", { tabId: id });
          return "error" in status ? status : { ...status, ok: true, tabId: id };
        },
        (input) => originNeedsApproval(sessionId(), safeOrigin(String(values(input).url ?? ""))),
      ),
      browser_read_page: definition(
        "Read a compact numbered-ref snapshot of the current page. Use returned refs for click, type, hover, and selection.",
        { type: "object", properties: { filter: { type: "string", enum: ["viewport", "full"] } }, additionalProperties: false },
        async ({ filter }) => {
          const snapshot = await invokeTab("browser_ai_snapshot", { ...(typeof filter === "string" ? { filter } : {}) });
          if ("error" in snapshot) return snapshot;
          const docH = Number(snapshot.docH ?? 0);
          const viewportH = Number(snapshot.viewportH ?? 0);
          const scrollY = Number(snapshot.scrollY ?? 0);
          const scrollNote = docH > viewportH ? `\nViewport: showing ${scrollY}–${Math.min(scrollY + viewportH, docH)} of ${docH}px (browser_scroll for more)` : "";
          return { page: `Page: ${String(snapshot.title ?? "")}\nURL: ${String(snapshot.url ?? "")}${scrollNote}\n\n${String(snapshot.text ?? "")}${snapshot.truncated ? "\n… (truncated; use filter:'full' or scroll)" : ""}` };
        },
      ),
      browser_screenshot: definition(
        "Capture the visible page, the whole page, or one element as an image for a vision-capable model.",
        { type: "object", properties: { ref: { type: "string" }, fullPage: { type: "boolean" } }, additionalProperties: false },
        async ({ ref, fullPage }) => {
          if (runtime.modelSupportsVision?.() === false) return { error: "the current model has no vision support — use browser_read_page instead" };
          const shot = await invokeTab("browser_ai_screenshot", { ...(typeof ref === "string" ? { ref } : {}), ...(fullPage === true ? { fullPage: true } : {}) });
          return "error" in shot ? shot : { ok: true, url: shot.url, png: shot.png, mediaType: shot.mediaType };
        },
        undefined,
        ({ output }) => {
          const result = values(output);
          if ("error" in result) return { type: "json", value: result };
          return { type: "content", value: [
            { type: "text", text: `Screenshot of ${String(result.url ?? "")}` },
            { type: "image-data", data: String(result.png ?? ""), mediaType: String(result.mediaType ?? "image/png") },
          ] };
        },
      ),
      browser_scroll: definition("Scroll the current page, then call browser_read_page again.", { type: "object", properties: { direction: { type: "string", enum: ["down", "up"] }, amount: { type: "string", enum: ["page", "half"] } }, required: ["direction"], additionalProperties: false }, ({ direction, amount }) => invokeTab("browser_ai_scroll", { direction, ...(amount ? { amount } : {}) })),
      browser_back: definition("Go back in browser history.", EMPTY, () => invokeTab("browser_ai_back")),
      browser_forward: definition("Go forward in browser history.", EMPTY, () => invokeTab("browser_ai_forward")),
      browser_reload: definition("Reload the current browser page.", EMPTY, () => invokeTab("browser_ai_reload")),
      browser_click: definition("Click an element by ref from browser_read_page.", { type: "object", properties: { ref: { type: "string" }, button: { type: "string", enum: ["left", "right"] }, double: { type: "boolean" } }, required: ["ref"], additionalProperties: false }, ({ ref, button, double }) => invokeTab("browser_ai_click", { ref, ...(button ? { button } : {}), ...(double === true ? { double: true } : {}) }), actionApproval),
      browser_type: definition(
        "Type into a field by ref. Password fields always require confirmation.",
        { type: "object", properties: { ref: { type: "string" }, text: { type: "string", maxLength: 2000 }, submit: { type: "boolean" }, clear: { type: "boolean" } }, required: ["ref", "text"], additionalProperties: false },
        ({ ref, text, submit, clear }) => invokeTab("browser_ai_type", { ref, text, ...(submit === true ? { submit: true } : {}), ...(clear === true ? { clear: true } : {}) }),
        async (input) => {
          const id = runtime.getBrowserTabId?.();
          if (id == null) return false;
          const info = await this.call("browser_ai_field_info", { tabId: id, ref: String(values(input).ref ?? "") });
          return info.isPassword === true || actionApproval();
        },
      ),
      browser_press_key: definition("Press a navigational key in the current page.", { type: "object", properties: { key: { type: "string", enum: ["Return", "Tab", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Backspace"] } }, required: ["key"], additionalProperties: false }, ({ key }) => invokeTab("browser_ai_press_key", { key }), actionApproval),
      browser_console: definition("Read browser console output and uncaught exceptions.", { type: "object", properties: { level: { type: "string", enum: ["log", "info", "warn", "error", "debug"] }, limit: { type: "integer", minimum: 1, maximum: 500 } }, additionalProperties: false }, (input) => invokeTab("browser_ai_console", input)),
      browser_network: definition("List recent browser network requests for debugging.", { type: "object", properties: { status: { type: "string", enum: ["all", "error"] }, type: { type: "string" }, urlContains: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500 } }, additionalProperties: false }, (input) => invokeTab("browser_ai_network", input)),
      browser_network_body: definition("Read a captured network response body by request id.", { type: "object", properties: { requestId: { type: "string" } }, required: ["requestId"], additionalProperties: false }, ({ requestId }) => invokeTab("browser_ai_network_body", { requestId }), actionApproval),
      browser_evaluate: definition("Evaluate a JavaScript expression in the current page for inspection and debugging.", { type: "object", properties: { expression: { type: "string", maxLength: 4000 } }, required: ["expression"], additionalProperties: false }, ({ expression }) => invokeTab("browser_ai_evaluate", { expression }), actionApproval),
      browser_wait_for: definition("Wait for text, disappearance, or network idle after an asynchronous page action.", { type: "object", properties: { text: { type: "string" }, textGone: { type: "string" }, networkIdle: { type: "boolean" }, timeoutMs: { type: "integer", minimum: 100, maximum: 15000 } }, additionalProperties: false }, (input) => invokeTab("browser_ai_wait_for", input)),
      browser_hover: definition("Hover an element by ref, then re-read the page.", { type: "object", properties: { ref: { type: "string" } }, required: ["ref"], additionalProperties: false }, ({ ref }) => invokeTab("browser_ai_hover", { ref })),
      browser_select_option: definition("Select values in a native select element.", { type: "object", properties: { ref: { type: "string" }, values: { type: "array", minItems: 1, items: { type: "string" } } }, required: ["ref", "values"], additionalProperties: false }, ({ ref, values: selected }) => invokeTab("browser_ai_select", { ref, values: selected }), actionApproval),
      browser_file_upload: definition("Upload local files through a file input. Always asks for approval.", { type: "object", properties: { ref: { type: "string" }, paths: { type: "array", minItems: 1, items: { type: "string" } } }, required: ["ref", "paths"], additionalProperties: false }, ({ ref, paths }) => invokeTab("browser_ai_upload", { ref, paths }), async () => true),
      browser_handle_dialog: definition("Accept or dismiss an open JavaScript dialog.", { type: "object", properties: { accept: { type: "boolean" }, promptText: { type: "string" } }, required: ["accept"], additionalProperties: false }, ({ accept, promptText }) => invokeTab("browser_ai_dialog", { accept, ...(typeof promptText === "string" ? { promptText } : {}) })),
      browser_list_tabs: definition("List shared embedded browser tabs.", EMPTY, () => ({ tabs: runtime.listBrowserTabs?.() ?? [] })),
      browser_open_tab: definition("Open a URL in a new shared browser tab and wait until it is ready for browser tools.", { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false }, async ({ url }) => {
        const target = String(url ?? "");
        if (!safeOrigin(target)) return { error: "invalid URL", url: target };
        return openReadyBrowser(target);
      }, (input) => originNeedsApproval(sessionId(), safeOrigin(String(values(input).url ?? "")))),
      browser_switch_tab: definition("Activate a browser tab by id.", { type: "object", properties: { tabId: { type: "integer" } }, required: ["tabId"], additionalProperties: false }, ({ tabId }) => runtime.switchBrowserTab?.(Number(tabId)) ? { ok: true } : { error: "not a browser tab" }),
      browser_close_tab: definition("Close a browser tab by id.", { type: "object", properties: { tabId: { type: "integer" } }, required: ["tabId"], additionalProperties: false }, ({ tabId }) => runtime.closeBrowserTab?.(Number(tabId)) ? { ok: true } : { error: "not a browser tab" }),
    };
  }
}
