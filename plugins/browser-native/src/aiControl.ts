/**
 * AI control of embedded-browser views. Thin renderer tools call these fat
 * commands; all reading, ref resolution, trusted input dispatch, and image
 * encoding happen here, main-side, against the same WebContentsView the user
 * sees.
 *
 * Primary lane is CDP (`webContents.debugger`): Chromium's accessibility tree
 * for the snapshot, and hit-tested `Input.dispatch*` for actions — the
 * Playwright-grade path. When CDP can't attach (the user has DevTools open on
 * the view), we fall back to the isolated-world script + `sendInputEvent`, so
 * the feature degrades instead of breaking. The snapshot records which lane it
 * used; actions dispatch to the same lane.
 */
import { nativeImage, webContents, type WebContents } from "electron";
import type { BrowserCapabilityCaller } from "@termco/browser-base";
import {
  cdpClick,
  cdpHover,
  cdpSelectOption,
  cdpType,
  cdpUpload,
  isPasswordField,
} from "./actions";
import { cdpUsable, ensureCdp, send } from "./cdp";
import {
  getConsole,
  getNetwork,
  getResponseBody,
  type ConsoleLevel,
} from "./observe";
import { viewWebContents } from "./registry";
import { cdpSnapshot } from "./snapshot";
import {
  AI_WORLD_ID,
  pickerCancelSource,
  pickerSource,
  resolveRefSource,
  scrollSource,
  snapshotSource,
  type SnapshotResult,
} from "./snapshotScript";

type AiCommandContext = { sender: WebContents };
type AiCommandHandler = (
  payload: Record<string, unknown>,
  context: AiCommandContext,
) => unknown | Promise<unknown>;
type PluginContext = {
  effect(install: () => () => void): void;
};

const aiHandlers = new Map<string, AiCommandHandler>();
const labelsBySender = new Map<number, string>();

export function browserAiHandlerCount(): number {
  return aiHandlers.size;
}

function command(name: string, handler: AiCommandHandler): () => void {
  aiHandlers.set(name, handler);
  return () => aiHandlers.delete(name);
}

function labelForSender(sender: WebContents): string {
  return labelsBySender.get(sender.id) ?? "main";
}

export function installBrowserAiHandlers(): () => void {
  const disposers: Array<() => void> = [];
  registerBrowserAiCommands({
    effect(install) {
      disposers.push(install());
    },
  });
  return () => {
    for (const dispose of disposers.reverse()) dispose();
    labelsBySender.clear();
  };
}

export function browserAiCommandNames(): string[] {
  return [...aiHandlers.keys()];
}

export async function invokeBrowserAiCommand(
  name: string,
  payload: Record<string, unknown>,
  caller: BrowserCapabilityCaller,
): Promise<unknown> {
  const sender = webContents.fromId(caller.senderWebContentsId);
  if (!sender || sender.isDestroyed()) return { error: "calling window closed" };
  labelsBySender.set(sender.id, caller.windowLabel ?? "main");
  const handler = aiHandlers.get(name);
  if (!handler) throw new Error(`unknown browser AI command: ${name}`);
  return handler(payload, { sender });
}

/** Per-view snapshot epoch. Bumped on each snapshot; refs carry their epoch. */
const epochByKey = new Map<string, number>();

type Lane = "cdp" | "iso";
/** Which lane produced the current snapshot for a view. */
const laneByKey = new Map<string, Lane>();
/** CDP lane: current epoch's ref → backendDOMNodeId map, per view. */
const cdpRefsByKey = new Map<
  string,
  { epoch: number; refs: Map<string, number> }
>();

function keyOf(sender: WebContents, tabId: number): string {
  return `${labelForSender(sender)}:${tabId}`;
}

function requireWc(sender: WebContents, tabId: number): WebContents | null {
  return viewWebContents(labelForSender(sender), tabId) ?? null;
}

function nextEpoch(key: string): number {
  const next = (epochByKey.get(key) ?? 0) + 1;
  epochByKey.set(key, next);
  return next;
}

const STALE = { error: "stale ref — call browser_read_page again" } as const;

/**
 * Resolve a ref against the current CDP snapshot. Returns the backend node id,
 * or a stale/re-read error the command should return verbatim.
 */
function cdpBackendFor(
  wc: WebContents,
  key: string,
  ref: string,
): number | { error: string } {
  if (!cdpUsable(wc)) {
    // The snapshot was taken over CDP but the session is gone (DevTools opened
    // since) — the model must re-read to get fresh refs.
    return { error: "re-read the page (browser_read_page) — page context reset" };
  }
  const entry = cdpRefsByKey.get(key);
  const backendNodeId = entry?.refs.get(ref);
  if (backendNodeId == null) return STALE;
  return backendNodeId;
}

/** Wait until loading settles or a bounded timeout elapses (post-action). */
function settle(wc: WebContents, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      wc.off("did-stop-loading", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    wc.once("did-stop-loading", finish);
  });
}

interface EvalResult {
  x: number;
  y: number;
  tag: string;
  type: string;
  isPassword: boolean;
}

interface LayoutMetrics {
  cssLayoutViewport?: { clientWidth: number; clientHeight: number };
  cssContentSize?: { width: number; height: number };
}

/** CDP layout metrics (CSS px), or an empty object if the call fails. */
async function layoutMetrics(wc: WebContents): Promise<LayoutMetrics> {
  try {
    return await send<LayoutMetrics>(wc, "Page.getLayoutMetrics");
  } catch {
    return {};
  }
}

/** Longest screenshot side sent to the model. Vision models downscale to
 * ~2048 anyway; a tall full-page shot past this is wasted bytes/tokens. */
const MAX_SIDE = 1536;

/**
 * Bound a base64 PNG so screenshots don't blow up the request. Caps the LONGEST
 * side (a tall full-page shot was previously emitted up to 16384px tall) and
 * re-encodes as JPEG — screenshots compress ~5–10× vs PNG while staying
 * readable, and this base64 is re-sent to the model on every turn.
 */
function boundImage(pngB64: string): { data: string; mediaType: string } {
  const img = nativeImage.createFromBuffer(Buffer.from(pngB64, "base64"));
  if (img.isEmpty()) return { data: pngB64, mediaType: "image/png" };
  const { width, height } = img.getSize();
  const out =
    Math.max(width, height) > MAX_SIDE
      ? width >= height
        ? img.resize({ width: MAX_SIDE })
        : img.resize({ height: MAX_SIDE })
      : img;
  return { data: out.toJPEG(80).toString("base64"), mediaType: "image/jpeg" };
}

export function registerBrowserAiCommands(ctx: PluginContext): void {
  ctx.effect(() =>
    command("browser_ai_status", (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      return {
        url: wc.getURL(),
        title: wc.getTitle(),
        loading: wc.isLoading(),
      };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_navigate", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      try {
        await wc.loadURL(payload.url as string);
      } catch (e) {
        // Aborted loads (redirects, user stop) aren't real failures.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/ERR_ABORTED/.test(msg)) return { error: msg, url: payload.url };
      }
      return { ok: true, url: wc.getURL(), title: wc.getTitle() };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_back", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      if (!wc.navigationHistory.canGoBack()) return { error: "no page to go back to" };
      wc.navigationHistory.goBack();
      await settle(wc, 3000);
      return { ok: true, url: wc.getURL(), title: wc.getTitle() };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_snapshot", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      const key = keyOf(cctx.sender, payload.tabId as number);
      const epoch = nextEpoch(key);

      // Primary: CDP accessibility snapshot (Chromium-computed roles/names).
      if (await ensureCdp(wc)) {
        try {
          const { result, refs } = await cdpSnapshot(wc, epoch);
          cdpRefsByKey.set(key, { epoch, refs });
          laneByKey.set(key, "cdp");
          return result;
        } catch {
          // fall through to the isolated-world lane
        }
      }

      // Fallback: isolated-world DOM walk (DevTools open / CDP unavailable).
      const filter = (payload.filter as "viewport" | "full") ?? "viewport";
      try {
        const raw = (await wc.executeJavaScriptInIsolatedWorld(AI_WORLD_ID, [
          { code: snapshotSource(epoch, filter) },
        ])) as string;
        const snap = JSON.parse(raw) as SnapshotResult;
        laneByKey.set(key, "iso");
        cdpRefsByKey.delete(key);
        return snap;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  ctx.effect(() =>
    command("browser_ai_scroll", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      const dir = (payload.direction as "up" | "down") ?? "down";
      const fraction = (payload.amount as string) === "half" ? 0.5 : 0.9;
      const result = await wc.executeJavaScriptInIsolatedWorld(AI_WORLD_ID, [
        { code: scrollSource(dir, fraction) },
      ]);
      return { ok: true, ...(result as object) };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_screenshot", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { error: "no browser tab open" };
      const ref = payload.ref as string | undefined;
      const fullPage = payload.fullPage as boolean | undefined;

      // Preferred lane: CDP Page.captureScreenshot. It renders off the compositor,
      // so it works even when the tab is an off-screen background view the AI drove
      // to without the user ever surfacing it — `wc.capturePage()` returns a stale,
      // tiny frame for a non-visible view (the "200x100 logo crop" bug). When the
      // on-screen layout viewport is tiny (a never-surfaced tab), force a real
      // 1280x800 viewport for the capture so the page renders at a usable size,
      // then restore. A surfaced view (≥400px) is left untouched so the shot
      // matches what the user sees.
      if (await ensureCdp(wc)) {
        const m = await layoutMetrics(wc);
        const vw = m.cssLayoutViewport?.clientWidth ?? 0;
        const vh = m.cssLayoutViewport?.clientHeight ?? 0;
        const tooSmall = vw < 400 || vh < 300;
        let overrode = false;
        try {
          if (tooSmall) {
            await send(wc, "Emulation.setDeviceMetricsOverride", {
              width: 1280,
              height: 800,
              deviceScaleFactor: 1,
              mobile: false,
            });
            overrode = true;
          }
          // Re-read after any relayout: content size for fullPage, quads for a ref.
          const mm = overrode ? await layoutMetrics(wc) : m;

          let clip:
            | { x: number; y: number; width: number; height: number; scale: number }
            | undefined;
          // `fullPage` and `ref` are contradictory (whole page vs. one element).
          // An explicit fullPage wins — a stray ref must not silently clip the
          // shot down to a single button.
          if (ref && !fullPage) {
            const backend = cdpBackendFor(wc, keyOf(cctx.sender, tabId), ref);
            if (typeof backend !== "number") return backend;
            await send(wc, "DOM.scrollIntoViewIfNeeded", { backendNodeId: backend }).catch(
              () => {},
            );
            const { quads } = await send<{ quads?: number[][] }>(
              wc,
              "DOM.getContentQuads",
              { backendNodeId: backend },
            );
            const q = quads?.[0];
            if (q && q.length >= 8) {
              const xs = [q[0], q[2], q[4], q[6]];
              const ys = [q[1], q[3], q[5], q[7]];
              clip = {
                x: Math.max(0, Math.min(...xs)),
                y: Math.max(0, Math.min(...ys)),
                width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
                height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
                scale: 1,
              };
            }
          } else if (fullPage) {
            clip = {
              x: 0,
              y: 0,
              width: mm.cssContentSize?.width ?? vw ?? 1280,
              // Chromium caps a single capture near 16k px; clamp so a very long
              // page still returns instead of failing.
              height: Math.min(mm.cssContentSize?.height ?? vh ?? 800, 16384),
              scale: 1,
            };
          }

          const res = await send<{ data?: string }>(wc, "Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: Boolean(clip),
            ...(clip ? { clip } : {}),
          });
          if (res.data) {
            const b = boundImage(res.data);
            return { ok: true, url: wc.getURL(), png: b.data, mediaType: b.mediaType };
          }
        } catch {
          /* fall through to capturePage */
        } finally {
          if (overrode) {
            await send(wc, "Emulation.clearDeviceMetricsOverride").catch(() => {});
          }
        }
      }

      // Fallback (CDP unavailable — e.g. the user has DevTools open on the view):
      // capturePage only yields a real image when the view is on-screen.
      const image = await wc.capturePage();
      const b = boundImage(image.toPNG().toString("base64"));
      return { ok: true, url: wc.getURL(), png: b.data, mediaType: b.mediaType };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_click", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { error: "no browser tab open" };
      const key = keyOf(cctx.sender, tabId);
      const epoch = epochByKey.get(key) ?? 0;
      const ref = payload.ref as string;
      if (!ref.startsWith(`s${epoch}e`)) return STALE;
      const button = (payload.button as "left" | "right") ?? "left";

      if (laneByKey.get(key) === "cdp") {
        const backend = cdpBackendFor(wc, key, ref);
        if (typeof backend !== "number") return backend;
        const res = await cdpClick(wc, backend, {
          button,
          double: Boolean(payload.double),
        });
        if ("error" in res) return res;
        await settle(wc, 600);
        return { ok: true, url: wc.getURL(), title: wc.getTitle() };
      }

      // Isolated-world fallback.
      const spot = (await wc.executeJavaScriptInIsolatedWorld(AI_WORLD_ID, [
        { code: resolveRefSource(ref, epoch) },
      ])) as EvalResult | null;
      if (!spot) return { error: "ref not found (page changed?) — re-read the page" };
      const clickCount = payload.double ? 2 : 1;
      wc.focus();
      wc.sendInputEvent({ type: "mouseMove", x: spot.x, y: spot.y });
      wc.sendInputEvent({ type: "mouseDown", x: spot.x, y: spot.y, button, clickCount });
      wc.sendInputEvent({ type: "mouseUp", x: spot.x, y: spot.y, button, clickCount });
      await settle(wc, 600);
      return { ok: true, url: wc.getURL(), title: wc.getTitle() };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_type", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { error: "no browser tab open" };
      const key = keyOf(cctx.sender, tabId);
      const epoch = epochByKey.get(key) ?? 0;
      const ref = payload.ref as string;
      if (!ref.startsWith(`s${epoch}e`)) return STALE;
      const text = payload.text as string;

      if (laneByKey.get(key) === "cdp") {
        const backend = cdpBackendFor(wc, key, ref);
        if (typeof backend !== "number") return backend;
        const res = await cdpType(wc, backend, text, {
          submit: Boolean(payload.submit),
          clear: Boolean(payload.clear),
        });
        if ("error" in res) return res;
        if (payload.submit) await settle(wc, 600);
        return { ok: true, url: wc.getURL(), title: wc.getTitle() };
      }

      // Isolated-world fallback.
      const spot = (await wc.executeJavaScriptInIsolatedWorld(AI_WORLD_ID, [
        { code: resolveRefSource(ref, epoch) },
      ])) as EvalResult | null;
      if (!spot) return { error: "ref not found (page changed?) — re-read the page" };
      wc.focus();
      wc.sendInputEvent({ type: "mouseMove", x: spot.x, y: spot.y });
      wc.sendInputEvent({ type: "mouseDown", x: spot.x, y: spot.y, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseUp", x: spot.x, y: spot.y, button: "left", clickCount: 1 });
      if (payload.clear) {
        wc.selectAll();
        wc.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
      }
      wc.insertText(text);
      if (payload.submit) {
        wc.sendInputEvent({ type: "keyDown", keyCode: "Return" });
        wc.sendInputEvent({ type: "char", keyCode: "\r" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Return" });
        await settle(wc, 600);
      }
      return { ok: true, url: wc.getURL(), title: wc.getTitle() };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_press_key", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      // Electron sendInputEvent (not CDP): key events must trigger default
      // actions like Enter-to-submit, which CDP input doesn't on an embedded view.
      const keyCode = payload.key as string;
      wc.focus();
      wc.sendInputEvent({ type: "keyDown", keyCode });
      if (keyCode === "Return") wc.sendInputEvent({ type: "char", keyCode: "\r" });
      wc.sendInputEvent({ type: "keyUp", keyCode });
      await settle(wc, 400);
      return { ok: true, url: wc.getURL(), title: wc.getTitle() };
    }),
  );

  // --- observability -------------------------------------------------------

  ctx.effect(() =>
    command("browser_ai_console", (payload, cctx) => {
      const label = labelForSender(cctx.sender);
      return {
        entries: getConsole(label, payload.tabId as number, {
          level: payload.level as ConsoleLevel | undefined,
          limit: payload.limit as number | undefined,
        }),
      };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_network", (payload, cctx) => {
      const label = labelForSender(cctx.sender);
      return {
        entries: getNetwork(label, payload.tabId as number, {
          status: payload.status as "all" | "error" | undefined,
          type: payload.type as string | undefined,
          urlContains: payload.urlContains as string | undefined,
          limit: payload.limit as number | undefined,
        }),
      };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_network_body", async (payload, cctx) => {
      const label = labelForSender(cctx.sender);
      return getResponseBody(
        label,
        payload.tabId as number,
        payload.requestId as string,
      );
    }),
  );

  ctx.effect(() =>
    command("browser_ai_evaluate", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { error: "no browser tab open" };
      if (!(await ensureCdp(wc))) {
        return { error: "cannot evaluate: DevTools is open on this page" };
      }
      try {
        const res = (await send(wc, "Runtime.evaluate", {
          expression: payload.expression as string,
          returnByValue: true,
          awaitPromise: true,
          userGesture: true,
          timeout: 5000,
        })) as {
          result?: { value?: unknown; description?: string; type?: string };
          exceptionDetails?: { text?: string; exception?: { description?: string } };
        };
        if (res.exceptionDetails) {
          const ex = res.exceptionDetails;
          return {
            error: String(ex.exception?.description ?? ex.text ?? "evaluation threw"),
          };
        }
        const r = res.result;
        let value: string;
        if (r && "value" in r && r.value !== undefined) {
          value = typeof r.value === "string" ? r.value : JSON.stringify(r.value);
        } else {
          value = String(r?.description ?? r?.type ?? "undefined");
        }
        return {
          ok: true,
          result: value.length > 20_000 ? `${value.slice(0, 20_000)}\n…[truncated]` : value,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  // --- interaction / reliability ------------------------------------------

  ctx.effect(() =>
    command("browser_ai_forward", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      if (!wc.navigationHistory.canGoForward())
        return { error: "no page to go forward to" };
      wc.navigationHistory.goForward();
      await settle(wc, 3000);
      return { ok: true, url: wc.getURL(), title: wc.getTitle() };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_reload", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      wc.reload();
      await settle(wc, 4000);
      return { ok: true, url: wc.getURL(), title: wc.getTitle() };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_wait_for", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      const timeoutMs = Math.min((payload.timeoutMs as number) ?? 5000, 15000);
      const deadline = Date.now() + timeoutMs;
      const text = payload.text as string | undefined;
      const textGone = payload.textGone as string | undefined;
      const networkIdle = payload.networkIdle as boolean | undefined;

      const check = async (): Promise<boolean> => {
        if (text || textGone) {
          const has = await wc
            .executeJavaScript(
              `document.body ? document.body.innerText.includes(${JSON.stringify(
                text ?? textGone,
              )}) : false`,
            )
            .catch(() => false);
          if (text) return Boolean(has);
          return !has; // textGone
        }
        if (networkIdle) {
          const list = getNetwork(labelForSender(cctx.sender), payload.tabId as number, {
            limit: 5,
          });
          const last = list[list.length - 1];
          return !last || Date.now() - last.ts > 600;
        }
        return true;
      };

      while (Date.now() < deadline) {
        if (await check()) return { ok: true, waited: true };
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: true, timedOut: true };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_field_info", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { isPassword: false };
      const backend = cdpBackendFor(wc, keyOf(cctx.sender, tabId), payload.ref as string);
      if (typeof backend !== "number") return { isPassword: false };
      return { isPassword: await isPasswordField(wc, backend) };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_hover", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { error: "no browser tab open" };
      const backend = cdpBackendFor(wc, keyOf(cctx.sender, tabId), payload.ref as string);
      if (typeof backend !== "number") return backend;
      const res = await cdpHover(wc, backend);
      if ("error" in res) return res;
      await settle(wc, 300);
      return { ok: true };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_select", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { error: "no browser tab open" };
      const backend = cdpBackendFor(wc, keyOf(cctx.sender, tabId), payload.ref as string);
      if (typeof backend !== "number") return backend;
      return cdpSelectOption(wc, backend, (payload.values as string[]) ?? []);
    }),
  );

  ctx.effect(() =>
    command("browser_ai_upload", async (payload, cctx) => {
      const tabId = payload.tabId as number;
      const wc = requireWc(cctx.sender, tabId);
      if (!wc) return { error: "no browser tab open" };
      const backend = cdpBackendFor(wc, keyOf(cctx.sender, tabId), payload.ref as string);
      if (typeof backend !== "number") return backend;
      return cdpUpload(wc, backend, (payload.paths as string[]) ?? []);
    }),
  );

  ctx.effect(() =>
    command("browser_ai_dialog", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      if (!(await ensureCdp(wc))) return { error: "cannot handle dialog (DevTools open)" };
      try {
        await send(wc, "Page.handleJavaScriptDialog", {
          accept: Boolean(payload.accept),
          promptText: payload.promptText as string | undefined,
        });
        return { ok: true };
      } catch (e) {
        return { error: `no dialog open (${e instanceof Error ? e.message : String(e)})` };
      }
    }),
  );

  // Grab-from-page: let the user point at an element and send it (a cropped
  // screenshot + its text) to the AI chat. Resolves when the user clicks or
  // cancels with Escape.
  ctx.effect(() =>
    command("browser_ai_pick", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (!wc) return { error: "no browser tab open" };
      wc.focus();
      type PickedElement = {
        rect: { x: number; y: number; width: number; height: number };
        text: string;
        tag: string;
        role?: string;
        accessibleName?: string;
      };
      let picked: PickedElement | null;
      try {
        picked = (await wc.executeJavaScriptInIsolatedWorld(AI_WORLD_ID, [
          { code: pickerSource() },
        ])) as PickedElement | null;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
      if (!picked) return { cancelled: true };
      // Crop the capture to the picked element's rect (viewport-relative DIP,
      // same units capturePage expects). Clamp so a rect running off-screen
      // (partly scrolled) still yields a valid capture.
      const full = await wc.capturePage();
      const size = full.getSize();
      const rect = {
        x: Math.max(0, Math.min(picked.rect.x, size.width - 1)),
        y: Math.max(0, Math.min(picked.rect.y, size.height - 1)),
        width: Math.max(1, Math.min(picked.rect.width, size.width - picked.rect.x)),
        height: Math.max(1, Math.min(picked.rect.height, size.height - picked.rect.y)),
      };
      const cropped = await wc.capturePage(rect).catch(() => full);
      return {
        ok: true,
        url: wc.getURL(),
        title: wc.getTitle(),
        png: cropped.toPNG().toString("base64"),
        text: picked.text,
        tag: picked.tag,
        ...(picked.role ? { role: picked.role } : {}),
        ...(picked.accessibleName
          ? { accessibleName: picked.accessibleName }
          : {}),
      };
    }),
  );

  ctx.effect(() =>
    command("browser_ai_pick_cancel", async (payload, cctx) => {
      const wc = requireWc(cctx.sender, payload.tabId as number);
      if (wc) {
        await wc
          .executeJavaScriptInIsolatedWorld(AI_WORLD_ID, [
            { code: pickerCancelSource() },
          ])
          .catch(() => {});
      }
      return null;
    }),
  );
}

/** Test seam: reset epoch bookkeeping between unit tests. */
export function __resetAiEpochs(): void {
  epochByKey.clear();
}
