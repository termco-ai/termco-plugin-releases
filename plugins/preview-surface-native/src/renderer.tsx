import type {
  BrowserConsoleEntry,
  BrowserNetworkEntry,
  BrowserRect,
  BrowserTabState,
} from "@termco/browser-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { UiTabDescriptor, UiTabSurfaceProps } from "@termco/ui-tabs-base";
import ui from "@termco/ui";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Bug01Icon,
  Cancel01Icon,
  CursorMagicSelection02Icon,
  EyeIcon,
  Globe02Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrowserClient } from "./browser";
import {
  hasArea,
  normalizeUrl,
  PORT_PRESETS,
  probeUrl,
  rectsEqual,
  rectsOverlap,
} from "./model";

const { Input } = ui;
const {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} = ui.React;

const buttonClass = "inline-flex size-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

function measure(element: HTMLElement): BrowserRect {
  const rect = element.getBoundingClientRect();
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
}

function useClientValue<T>(client: BrowserClient, read: () => T): T {
  return useSyncExternalStore(client.subscribe, read, read);
}

function useBrowserView(
  client: BrowserClient,
  runtime: UiTabSurfaceProps["runtime"],
  tabId: number,
  initialUrl: string,
  visible: boolean,
  localOverlay: boolean,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const firstUrl = useRef(initialUrl);
  const lastRect = useRef<BrowserRect | null>(null);
  const [hasSize, setHasSize] = useState(false);
  const [overlayCovers, setOverlayCovers] = useState(false);
  const state = useClientValue(client, () => client.state(tabId));

  useEffect(() => {
    const rect = hostRef.current ? measure(hostRef.current) : { x: 0, y: 0, width: 0, height: 0 };
    void client.create(tabId, firstUrl.current, rect);
    return () => { void client.setVisible(tabId, false).catch(() => {}); };
  }, [client, tabId]);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    let frame = 0;
    const push = () => {
      frame = 0;
      const rect = measure(element);
      const area = hasArea(rect);
      setHasSize(area);
      if (!area || rectsEqual(lastRect.current, rect)) return;
      lastRect.current = rect;
      void client.setBounds(tabId, rect);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(push); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [client, tabId]);

  useEffect(() => {
    const compute = () => {
      const element = hostRef.current;
      if (!element) { setOverlayCovers(false); return; }
      const view = element.getBoundingClientRect();
      setOverlayCovers(
        localOverlay ||
        runtime.hasUnpositionedOverlay() ||
        runtime.overlayRects().some((rect) => rectsOverlap(rect, view)),
      );
    };
    compute();
    return runtime.subscribeOverlays(compute);
  }, [localOverlay, runtime]);

  const showable = visible && hasSize && Boolean(initialUrl) && !state?.crashed && !state?.loadError;
  const effectiveVisible = showable && !overlayCovers;
  useEffect(() => {
    if (effectiveVisible && hostRef.current) {
      const rect = measure(hostRef.current);
      if (hasArea(rect) && !rectsEqual(lastRect.current, rect)) {
        lastRect.current = rect;
        void client.setBounds(tabId, rect);
      }
    }
    void client.setVisible(tabId, effectiveVisible);
  }, [client, effectiveVisible, tabId]);

  return {
    hostRef,
    state,
    navigate: (url: string) => client.loadUrl(tabId, url),
    overlayHidden: showable && overlayCovers,
  };
}

type AddressHandle = { focus(): void };

const AddressBar = forwardRef<AddressHandle, {
  client: BrowserClient;
  desktop: DesktopIntegrationCapability;
  runtime: UiTabSurfaceProps["runtime"];
  tabId: number;
  url: string;
  state: BrowserTabState | null;
  onNavigate(url: string): void;
  onMenu(open: boolean): void;
  onToggleDev(): void;
  devOpen: boolean;
  errorCount: number;
}>(function AddressBar({ client, desktop, runtime, tabId, url, state, onNavigate, onMenu, onToggleDev, devOpen, errorCount }, ref) {
  const [draft, setDraft] = useState(url);
  const [portsOpen, setPortsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState<number | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => setDraft(url), [url]);
  useEffect(() => onMenu(portsOpen), [onMenu, portsOpen]);
  useImperativeHandle(ref, () => ({
    focus() { void client.focusHost(); input.current?.focus(); input.current?.select(); },
  }), [client]);

  const submit = () => {
    const next = normalizeUrl(draft);
    if (!next) { setNotice("Enter a URL or pick a port preset."); return; }
    setNotice(null);
    if (next === url) void client.reload(tabId); else onNavigate(next);
  };
  const choosePort = async (port: number) => {
    setChecking(port); setNotice(null);
    const next = `http://localhost:${port}`;
    const available = await probeUrl(next);
    setChecking(null);
    if (!available) { setNotice(`No server listening on :${port}.`); return; }
    setDraft(next); setPortsOpen(false); onNavigate(next);
  };
  const pick = async () => {
    if (!runtime.canAttachImageToAi()) { setNotice("Configure an AI model before attaching a page element."); return; }
    setGrabbing(true);
    try {
      const result = await client.pick(tabId);
      if ("ok" in result) runtime.attachImageToAi({
        dataUrl: `data:image/png;base64,${result.png}`,
        name: "Page element",
        text: result.text,
        pageElement: {
          url: result.url,
          title: result.title,
          tag: result.tag,
          ...(result.role ? { role: result.role } : {}),
          ...(result.accessibleName
            ? { accessibleName: result.accessibleName }
            : {}),
          ...(result.text ? { text: result.text } : {}),
        },
      });
    } finally { setGrabbing(false); }
  };

  return <div className="relative shrink-0 border-b border-border/70">
    <div className="termco-toolbar flex h-10 items-center gap-1 px-1.5">
      <IconButton title="Back" disabled={!state?.canGoBack} onClick={() => void client.back(tabId)} icon={ArrowLeft01Icon} size={15} />
      <IconButton title="Forward" disabled={!state?.canGoForward} onClick={() => void client.forward(tabId)} icon={ArrowRight01Icon} size={15} />
      <IconButton title={state?.loading ? "Stop loading" : "Reload"} onClick={() => void (state?.loading ? client.stop(tabId) : client.reload(tabId))} icon={state?.loading ? Cancel01Icon : ArrowReloadHorizontalIcon} />
      <div className="relative">
        <button type="button" title="Common dev-server ports" className="inline-flex h-7 items-center gap-1 rounded-md border border-transparent bg-transparent px-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setPortsOpen((open) => !open)}>
          <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.75} /><span>Ports</span>
        </button>
        {portsOpen ? <div role="menu" className="absolute left-0 top-8 z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          <div className="border-b border-border/70 px-3.5 py-3"><strong className="text-xs">Open development server</strong><p className="m-0 mt-0.5 text-xs text-muted-foreground">Probe a common localhost port in this preview.</p></div>
          <div className="max-h-72 overflow-y-auto">{PORT_PRESETS.map(([port, label, hint]) => <button role="menuitem" type="button" key={port} className="flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-2 text-left hover:bg-accent" onClick={() => void choosePort(port)}>
            <span className="w-10 font-mono text-xs text-muted-foreground">{port}</span><span className="min-w-0 flex-1"><b className="block text-xs">{label}</b><span className="block truncate text-xs text-muted-foreground">{hint}</span></span><span className="text-xs text-muted-foreground">{checking === port ? "checking…" : "→"}</span>
          </button>)}</div>
        </div> : null}
      </div>
      <div className="relative flex min-w-0 flex-1 items-center"><span className="pointer-events-none absolute left-2.5 size-[7px] rounded-full bg-chart-5" /><Input ref={input} value={draft} placeholder="http://localhost:3000" spellCheck={false} autoComplete="off" className="h-8 w-full rounded-md border-border/70 py-1 pr-2.5 pl-7 font-mono text-xs text-muted-foreground placeholder:text-muted-foreground/70" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); submit(); }
        if (event.key === "Escape") { event.preventDefault(); setDraft(url); input.current?.blur(); }
      }} /></div>
      <IconButton title="Console & Network" active={devOpen} onClick={onToggleDev} icon={Bug01Icon} badge={errorCount} />
      <IconButton title="Pick an element and send it to the AI" active={grabbing} disabled={!url || grabbing} onClick={() => void pick()} icon={CursorMagicSelection02Icon} />
      <IconButton title="Open in system browser" disabled={!url} onClick={() => void desktop.openUrl(url)} icon={LinkSquare02Icon} />
    </div>
    {notice ? <div className="flex items-center gap-1.5 bg-amber-500/8 px-3 py-1 text-xs text-amber-600 dark:text-amber-400"><span className="truncate">{notice}</span><button type="button" className="ml-auto rounded border-0 bg-transparent px-1 text-xs opacity-80 hover:bg-accent hover:opacity-100" onClick={() => setNotice(null)}>Dismiss</button></div> : null}
  </div>;
});

function IconButton({ title, icon, disabled, active, badge, size = 14, onClick }: { title: string; icon: unknown; disabled?: boolean; active?: boolean; badge?: number; size?: number; onClick(): void }) {
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${buttonClass} relative ${active ? "bg-accent text-foreground" : ""}`}><HugeiconsIcon icon={icon as never} size={size} strokeWidth={1.75} />{badge ? <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-0.5 text-[10px] text-white">{badge > 99 ? "99+" : badge}</span> : null}</button>;
}

function ViewHost({ hostRef, url, state, overlayHidden, reload }: { hostRef: { current: HTMLDivElement | null }; url: string; state: BrowserTabState | null; overlayHidden: boolean; reload(): void }) {
  let fallback: unknown = null;
  if (overlayHidden) fallback = <Fallback icon={EyeIcon} title="Page hidden while a menu is open" />;
  else if (!url) fallback = <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-6 text-center"><div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><HugeiconsIcon icon={Globe02Icon} size={26} strokeWidth={1.5} /></div><div className="space-y-1.5"><p className="text-base font-semibold text-foreground">Nothing to preview yet</p><p className="max-w-md text-sm leading-relaxed text-muted-foreground">Type a URL above, or open the <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs">Ports</span> dropdown to jump straight to your running dev server. Public sites often block embedding — open them in your browser via the link icon if you see a blank page.</p></div></div>;
  else if (state?.crashed) fallback = <Fallback icon={Alert02Icon} title="This page crashed" detail={`The page renderer exited (${state.crashed}).`} action={reload} />;
  else if (state?.loadError) fallback = <Fallback icon={Alert02Icon} title="This page failed to load" detail={`${state.loadError.description} (${state.loadError.code}) — ${state.loadError.url}`} action={reload} />;
  return <div ref={hostRef} className="relative min-h-0 flex-1 bg-background">{fallback as never}</div>;
}

function Fallback({ icon, title, detail, action }: { icon: unknown; title: string; detail?: string; action?: () => void }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"><HugeiconsIcon icon={icon as never} size={20} className="text-muted-foreground" /><div><div className="text-sm font-medium">{title}</div>{detail ? <div className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</div> : null}</div>{action ? <button type="button" className="rounded-md border border-border bg-card px-3 py-1.5 text-xs" onClick={action}>Reload</button> : null}</div>;
}

function DevPanel({ client, tabId, close }: { client: BrowserClient; tabId: number; close(): void }) {
  const [kind, setKind] = useState<"console" | "network">("console");
  const consoleEntries = useClientValue(client, () => client.consoleEntries(tabId));
  const networkEntries = useClientValue(client, () => client.networkEntries(tabId));
  return <div className="flex h-full min-h-0 flex-col border-t border-border/60 bg-card/40 text-xs">
    <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 px-1.5"><PanelTab active={kind === "console"} onClick={() => setKind("console")}>Console ({consoleEntries.length})</PanelTab><PanelTab active={kind === "network"} onClick={() => setKind("network")}>Network ({networkEntries.length})</PanelTab><button type="button" className={`${buttonClass} ml-auto size-6`} onClick={close}><HugeiconsIcon icon={Cancel01Icon} size={12} /></button></div>
    <div className="min-h-0 flex-1 overflow-auto font-mono">{kind === "console" ? <ConsoleList entries={consoleEntries} /> : <NetworkList entries={networkEntries} />}</div>
  </div>;
}

function PanelTab({ active, onClick, children }: { active: boolean; onClick(): void; children: unknown }) { return <button type="button" onClick={onClick} className={`rounded border-0 px-2 py-0.5 text-xs ${active ? "bg-accent text-foreground" : "bg-transparent text-muted-foreground"}`}>{children as never}</button>; }
function ConsoleList({ entries }: { entries: BrowserConsoleEntry[] }) { return entries.length ? <ul className="m-0 list-none p-0">{entries.map((entry) => <li key={entry.id} className={`flex gap-2 border-b border-border/30 px-2 py-0.5 ${entry.level === "error" ? "text-red-500" : entry.level === "warn" ? "text-amber-500" : "text-foreground"}`}><span className="uppercase opacity-60">{entry.level}</span><span className="whitespace-pre-wrap break-words">{entry.text}</span></li>)}</ul> : <Empty>No console output yet.</Empty>; }
function NetworkList({ entries }: { entries: BrowserNetworkEntry[] }) { return entries.length ? <ul className="m-0 list-none p-0">{entries.map((entry) => <li key={entry.id} className="flex items-center gap-2 border-b border-border/30 px-2 py-0.5"><span className={entry.failed || (entry.status ?? 0) >= 400 ? "w-10 text-red-500" : "w-10 text-muted-foreground"}>{entry.failed ? "ERR" : (entry.status ?? "…")}</span><span className="w-10 text-muted-foreground">{entry.method}</span><span className="min-w-0 flex-1 truncate">{entry.url || entry.errorText}</span>{entry.durationMs != null ? <span className="text-muted-foreground">{entry.durationMs}ms</span> : null}</li>)}</ul> : <Empty>No network activity yet.</Empty>; }
function Empty({ children }: { children: unknown }) { return <div className="p-3 text-xs text-muted-foreground">{children as never}</div>; }

type PaneHandle = { focusAddressBar(): void };
const PreviewPane = forwardRef<PaneHandle, { client: BrowserClient; desktop: DesktopIntegrationCapability; runtime: UiTabSurfaceProps["runtime"]; tab: UiTabDescriptor; visible: boolean }>(function PreviewPane({ client, desktop, runtime, tab, visible }, ref) {
  const address = useRef<AddressHandle | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const browser = useBrowserView(client, runtime, tab.id, tab.url ?? "", visible, menuOpen);
  const logs = useClientValue(client, () => client.consoleEntries(tab.id));
  useImperativeHandle(ref, () => ({ focusAddressBar: () => address.current?.focus() }), []);
  useEffect(() => {
    if (visible && !(tab.url ?? "")) setTimeout(() => address.current?.focus(), 0);
  }, [tab.url, visible]);
  useEffect(() => {
    if (browser.state?.url && browser.state.url !== tab.url) runtime.updateTab(tab.id, { url: browser.state.url });
  }, [browser.state?.url, runtime, tab.id, tab.url]);
  useEffect(() => {
    if (browser.state?.title && browser.state.title !== tab.title) runtime.updateTab(tab.id, { title: browser.state.title });
  }, [browser.state?.title, runtime, tab.id, tab.title]);
  return <div className="flex h-full w-full flex-col overflow-hidden bg-background" style={{ visibility: visible ? "visible" : "hidden", pointerEvents: visible ? "auto" : "none" }}>
    <AddressBar ref={address} client={client} desktop={desktop} runtime={runtime} tabId={tab.id} url={tab.url ?? ""} state={browser.state} onNavigate={(url) => { void browser.navigate(url); void client.focus(tab.id); }} onMenu={setMenuOpen} onToggleDev={() => setDevOpen((open) => !open)} devOpen={devOpen} errorCount={logs.filter((entry) => entry.level === "error").length} />
    <ViewHost hostRef={browser.hostRef} url={tab.url ?? ""} state={browser.state} overlayHidden={browser.overlayHidden} reload={() => void client.reload(tab.id)} />
    {devOpen ? <div className="h-2/5 min-h-[120px] shrink-0"><DevPanel client={client} tabId={tab.id} close={() => setDevOpen(false)} /></div> : null}
  </div>;
});

export function createPreviewSurface(client: BrowserClient, desktop: DesktopIntegrationCapability) {
  const handles = new Map<number, PaneHandle>();
  let knownTabs = new Set<number>();
  return function PreviewSurface({ tabs, activeId, surfaceVisible, runtime }: UiTabSurfaceProps) {
    const allPreviewIds = new Set(runtime.allTabs().filter((tab) => tab.kind === "preview").map((tab) => tab.id));
    useEffect(() => {
      for (const id of knownTabs) if (!allPreviewIds.has(id)) void client.destroy(id);
      knownTabs = allPreviewIds;
    });
    const previews = tabs.filter((tab) => tab.kind === "preview" && !tab.cold);
    if (!previews.length) return null;
    return <div className="relative h-full w-full">{previews.map((tab) => {
      const visible = surfaceVisible && tab.id === activeId;
      return <div key={tab.id} aria-hidden={!visible} className={`absolute inset-0 ${visible ? "" : "invisible pointer-events-none"}`}><PreviewPane ref={(handle) => { if (handle) handles.set(tab.id, handle); else handles.delete(tab.id); }} client={client} desktop={desktop} runtime={runtime} tab={tab} visible={visible} /></div>;
    })}</div>;
  };
}
