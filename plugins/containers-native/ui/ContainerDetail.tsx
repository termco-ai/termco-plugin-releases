/**
 * The rich detail/inspector surface for ONE container — the body of a container
 * tab. An identity header with inline lifecycle actions, a live meter strip
 * (running only), then a two-column body: the Spec column (ports, networks,
 * mounts, environment manifest, labels, health, image) and a following logs
 * tail. Reads inspect once, image once, and polls stats/logs only while its tab
 * is the active one.
 *
 * Typographic signature: sans for chrome/labels, mono for every value.
 */
import ui from "@termco/ui";
import { LogView, type LogViewHandle } from "./components/LogView";
import {
  ArrowDownDoubleIcon,
  Cancel01Icon,
  ComputerTerminal02Icon,
  Copy01Icon,
  PauseIcon,
  PlayIcon,
  Refresh01Icon,
  ReloadIcon,
  Search01Icon,
  SearchAreaIcon,
  StopIcon,
  TextWrapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type MouseEvent, useRef, useState } from "react";
import { EnvManifest } from "./components/EnvManifest";
import { MeterStrip } from "./components/MeterStrip";
import { PortForwardChip } from "./components/PortForwardChip";
import { SpecSection } from "./components/SpecSection";
import { formatMatchLines, searchSummary } from "./lib/logSearch";
import { containersNative } from "./lib/native";
import {
  isRunningState,
  stateDotClass,
  statusTextClass,
} from "./lib/runtimeMeta";
import type {
  ContainerActionKind,
  ContainerRuntime,
  ContainerStats,
  LogSearchResult,
} from "./types";
import { useContainerInspect, useContainerLogs } from "./useContainerDetail";
import { useContainerImage } from "./useContainerImage";
import { useContainerPortForward } from "./useContainerPortForward";

const { cn, Tooltip, TooltipContent, TooltipTrigger } = ui;

function formatBytes(n: number): string {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

export function ContainerDetail({
  runtime,
  containerId,
  name,
  state,
  status,
  image,
  listLoaded,
  stats,
  busy,
  active,
  onShell,
  onAction,
}: {
  runtime: ContainerRuntime;
  containerId: string;
  name: string;
  /** Live state/status/image from the container list, "" when not present. */
  state: string;
  status: string;
  image: string;
  /** Whether the container list has resolved — distinguishes loading from gone. */
  listLoaded: boolean;
  stats: ContainerStats | undefined;
  busy: boolean;
  active: boolean;
  onShell: () => void;
  onAction: (action: ContainerActionKind) => void;
}) {
  const running = isRunningState(state);
  const detail = useContainerInspect(runtime, containerId);
  const [tail, setTail] = useState<number>(1000);
  const [follow, setFollow] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const logViewRef = useRef<LogViewHandle>(null);
  const logs = useContainerLogs(
    runtime,
    containerId,
    running,
    active,
    tail,
    follow,
    reloadKey,
  );
  const imageRef = detail?.identity.imageRef || image;
  const imageInfo = useContainerImage(runtime, imageRef);
  const pf = useContainerPortForward();

  // Full-log search: scans the ENTIRE log on the host (including lines never
  // fetched into the tail view) and shows the matching lines.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<LogSearchResult | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRid = useRef(0);

  const runFullLogSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResult(null);
      return;
    }
    const rid = ++searchRid.current;
    setSearchLoading(true);
    try {
      const res = await containersNative.logsSearch(runtime, containerId, q);
      if (searchRid.current === rid) setSearchResult(res);
    } catch {
      if (searchRid.current === rid) {
        setSearchResult({
          matches: [],
          matched: 0,
          scanned: 0,
          truncated: false,
        });
      }
    } finally {
      if (searchRid.current === rid) setSearchLoading(false);
    }
  };
  const closeFullSearch = () => {
    searchRid.current += 1;
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResult(null);
    setSearchLoading(false);
  };

  // The viewer shows full-log search results when active, else the tail.
  const showingResults = searchOpen && searchResult !== null;
  const viewerText = showingResults
    ? formatMatchLines(searchResult.matches)
    : logs.text;
  const lineCount = viewerText ? viewerText.split("\n").length : 0;

  // Find over whatever the viewer currently shows (tail OR search results).
  const onFind = () => logViewRef.current?.openSearch();
  const onRefresh = () => setReloadKey((k) => k + 1);

  // Only "gone" once the list has actually loaded without this container —
  // otherwise a not-yet-loaded list would flash "unavailable" for a live one.
  const gone = listLoaded && state === "";
  const id = detail?.identity;

  return (
    <div className="termco-workspace flex h-full min-h-0 flex-col gap-3 p-3">
      {/* Identity header */}
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              stateDotClass(state),
              running && "motion-safe:animate-pulse",
            )}
          />
          <span
            className="shrink-0 whitespace-nowrap text-base font-semibold"
            title={name}
          >
            {name}
          </span>
          <span
            className="min-w-0 truncate font-mono text-xs text-muted-foreground"
            title={imageRef}
          >
            {imageRef}
          </span>
          <span className={cn("shrink-0 text-xs", statusTextClass(state))}>
            {gone ? "unavailable" : status || (listLoaded ? "" : "…")}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {running ? (
              <HeaderBtn label="Open shell" onClick={onShell}>
                <HugeiconsIcon
                  icon={ComputerTerminal02Icon}
                  size={14}
                  strokeWidth={2}
                />
              </HeaderBtn>
            ) : null}
            <HeaderBtn
              label="Restart"
              disabled={!running || busy || gone}
              onClick={() => onAction("restart")}
            >
              <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
            </HeaderBtn>
            <HeaderBtn
              label={running ? "Stop" : "Start"}
              disabled={busy || gone}
              onClick={() => onAction(running ? "stop" : "start")}
            >
              <HugeiconsIcon
                icon={running ? StopIcon : PlayIcon}
                size={14}
                strokeWidth={2}
              />
            </HeaderBtn>
          </div>
        </div>
        {/* Sub-line: mono, dim identity facts */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-xs text-muted-foreground/60">
          {id?.shortId ? <span>{id.shortId}</span> : null}
          {id?.created ? <Dim>created {id.created}</Dim> : null}
          {id?.restartPolicy ? <Dim>restart: {id.restartPolicy}</Dim> : null}
          {id?.platform ? <Dim>{id.platform}</Dim> : null}
          {id?.user ? <Dim>user: {id.user}</Dim> : null}
        </div>
      </div>

      {/* Live meters (running only) */}
      {running ? (
        <div className="shrink-0">
          <MeterStrip
            stats={stats}
            limits={detail?.limits ?? { memBytes: 0, nanoCpus: 0, pids: 0 }}
          />
        </div>
      ) : null}

      {/* Body: Spec | Logs */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-2">
        {/* Spec column */}
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-0.5">
          {id?.command ? (
            <SpecSection title="Command">
              <code className="block select-text overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground/90">
                {id.command}
              </code>
            </SpecSection>
          ) : null}

          <SpecSection title="Ports" count={detail?.ports.length}>
            {detail && detail.ports.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.ports.map((p, i) =>
                  p.hostPort != null ? (
                    <PortForwardChip
                      // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat across proto
                      key={`${p.label}:${i}`}
                      hostPort={p.hostPort}
                      label={p.label}
                      forward={pf.forwardFor(p.hostPort)}
                      isSsh={pf.isSsh}
                      onRoute={(choice) =>
                        p.hostPort != null && void pf.route(p.hostPort, choice)
                      }
                      onOpen={pf.open}
                      onStop={pf.stop}
                    />
                  ) : (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat across proto
                      key={`${p.label}:${i}`}
                      className="inline-flex h-[19px] items-center rounded-md bg-muted px-1.5 font-mono text-xs font-semibold text-muted-foreground"
                      title="Exposed, not published"
                    >
                      {p.label}
                    </span>
                  ),
                )}
              </div>
            ) : (
              <Empty ready={!!detail}>No published ports</Empty>
            )}
          </SpecSection>

          <SpecSection title="Networks" count={detail?.networks.length}>
            {detail && detail.networks.length > 0 ? (
              <div className="flex flex-col gap-1">
                {detail.networks.map((n) => (
                  <div key={n.name} className="flex items-baseline gap-2">
                    <span className="shrink-0 font-mono text-xs text-foreground/90">
                      {n.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
                      {n.ip || "—"}
                      {n.gateway ? ` · gw ${n.gateway}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty ready={!!detail}>No networks</Empty>
            )}
          </SpecSection>

          <SpecSection title="Mounts" count={detail?.mounts.length}>
            {detail && detail.mounts.length > 0 ? (
              <div className="flex flex-col gap-1">
                {detail.mounts.map((m) => (
                  <div
                    key={`${m.src}:${m.dst}`}
                    className="flex items-baseline gap-2 overflow-x-auto"
                  >
                    <span
                      className="whitespace-nowrap font-mono text-xs text-muted-foreground"
                      title={m.src}
                    >
                      {m.src}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground/40">
                      →
                    </span>
                    <span className="whitespace-nowrap font-mono text-xs text-foreground/90">
                      {m.dst}
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded px-1 font-mono text-xs font-semibold",
                        m.rw
                          ? "bg-blue-500/12 text-blue-600 dark:text-blue-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {m.rw ? "rw" : "ro"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty ready={!!detail}>No mounts</Empty>
            )}
          </SpecSection>

          <EnvManifest env={detail?.env ?? []} />

          {detail && detail.labels.length > 0 ? (
            <SpecSection
              title="Labels"
              count={detail.labels.length}
              collapsible
              defaultOpen={false}
            >
              <div className="flex flex-col gap-1">
                {detail.labels.map((l) => (
                  <div
                    key={l.key}
                    className="flex items-baseline gap-2 overflow-x-auto"
                  >
                    <span
                      className="whitespace-nowrap font-mono text-xs text-muted-foreground/70"
                      title={l.key}
                    >
                      {l.key}
                    </span>
                    <span
                      className="ml-auto whitespace-nowrap font-mono text-xs text-foreground/90"
                      title={l.value}
                    >
                      {l.value}
                    </span>
                  </div>
                ))}
              </div>
            </SpecSection>
          ) : null}

          {detail?.health ? (
            <SpecSection title="Health">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-foreground/90">
                  {detail.health.status}
                </span>
                {detail.health.failingStreak > 0 ? (
                  <span className="font-mono text-xs text-red-500">
                    failing streak {detail.health.failingStreak}
                  </span>
                ) : null}
              </div>
              {detail.health.lastOutput ? (
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                  {detail.health.lastOutput}
                </pre>
              ) : null}
            </SpecSection>
          ) : null}

          <SpecSection title="Image">
            {imageInfo ? (
              <div className="flex flex-col gap-0.5">
                <ImageFact label="Ref" value={imageRef} mono />
                <ImageFact
                  label="Size"
                  value={imageInfo.size ? formatBytes(imageInfo.size) : "—"}
                />
                <ImageFact
                  label="Platform"
                  value={
                    [imageInfo.os, imageInfo.arch].filter(Boolean).join("/") ||
                    "—"
                  }
                />
                <ImageFact
                  label="Layers"
                  value={imageInfo.layers ? String(imageInfo.layers) : "—"}
                />
                {imageInfo.digest ? (
                  <ImageFact label="Digest" value={imageInfo.digest} mono />
                ) : null}
                {imageInfo.created ? (
                  <ImageFact label="Created" value={imageInfo.created} mono />
                ) : null}
              </div>
            ) : (
              <Empty ready={false}>image details unavailable</Empty>
            )}
          </SpecSection>
        </div>

        {/* Logs column — a read-only, line-numbered, searchable viewer on the
            same CodeMirror stack as the file editor. */}
        <div className="flex min-h-[180px] flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-[var(--shadow-control)]">
          <div className="termco-toolbar flex shrink-0 items-center gap-1.5 border-b border-border/70 px-3 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/75">
              {showingResults ? "Log matches" : "Logs"}
            </span>
            {showingResults ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground/55">
                {searchSummary(searchResult, searchLoading)}
              </span>
            ) : lineCount > 0 ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground/55">
                {lineCount.toLocaleString()} lines
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-0.5">
              {/* tail size — "more logs" (tail view only) */}
              {!showingResults ? (
                <>
                  <label className="sr-only" htmlFor="log-tail">
                    Lines to load
                  </label>
                  <select
                    id="log-tail"
                    value={tail}
                    onChange={(e) => setTail(Number(e.target.value))}
                    className="mr-0.5 h-5 rounded border border-border/60 bg-transparent px-1 font-mono text-xs text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Lines to load"
                  >
                    <option value={200}>200</option>
                    <option value={1000}>1k</option>
                    <option value={5000}>5k</option>
                    <option value={10000}>10k</option>
                  </select>
                </>
              ) : null}
              <LogIconBtn label="Find in view" onClick={onFind}>
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={12}
                  strokeWidth={1.75}
                />
              </LogIconBtn>
              <LogIconBtn
                label="Search all logs"
                active={searchOpen}
                onClick={() => setSearchOpen((v) => !v)}
              >
                <HugeiconsIcon
                  icon={SearchAreaIcon}
                  size={12}
                  strokeWidth={1.75}
                />
              </LogIconBtn>
              {!showingResults ? (
                <LogIconBtn label="Refresh logs" onClick={onRefresh}>
                  <HugeiconsIcon
                    icon={Refresh01Icon}
                    size={12}
                    strokeWidth={1.75}
                    className={logs.loading ? "animate-spin" : undefined}
                  />
                </LogIconBtn>
              ) : null}
              <LogIconBtn
                label={wrap ? "Disable wrap" : "Wrap lines"}
                active={wrap}
                onClick={() => setWrap((w) => !w)}
              >
                <HugeiconsIcon
                  icon={TextWrapIcon}
                  size={12}
                  strokeWidth={1.75}
                />
              </LogIconBtn>
              {running && !showingResults ? (
                <LogIconBtn
                  label={follow ? "Pause follow" : "Resume follow"}
                  active={follow}
                  onClick={() => {
                    const next = !follow;
                    setFollow(next);
                    if (next) logViewRef.current?.scrollToBottom();
                  }}
                >
                  <HugeiconsIcon
                    icon={follow ? PauseIcon : PlayIcon}
                    size={12}
                    strokeWidth={1.75}
                  />
                </LogIconBtn>
              ) : null}
              <LogIconBtn
                label="Jump to bottom"
                onClick={() => logViewRef.current?.scrollToBottom()}
              >
                <HugeiconsIcon
                  icon={ArrowDownDoubleIcon}
                  size={12}
                  strokeWidth={1.75}
                />
              </LogIconBtn>
              <LogIconBtn
                label="Copy"
                onClick={() => void navigator.clipboard.writeText(viewerText)}
              >
                <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.75} />
              </LogIconBtn>
            </div>
          </div>

          {/* Full-log search bar — scans the ENTIRE log on the host. */}
          {searchOpen ? (
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 bg-card/40 px-3 py-1.5">
              <HugeiconsIcon
                icon={SearchAreaIcon}
                size={12}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground/70"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runFullLogSearch();
                  if (e.key === "Escape") closeFullSearch();
                }}
                placeholder="Search all logs (incl. not-loaded)…  ↵"
                // biome-ignore lint/a11y/noAutofocus: focus the search field when the bar opens
                autoFocus
                aria-label="Search all logs"
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground/45 focus:outline-none"
              />
              {searchLoading || searchResult ? (
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/60">
                  {searchSummary(searchResult, searchLoading)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void runFullLogSearch()}
                className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-sans text-xs font-semibold text-primary hover:bg-primary/15"
              >
                Search
              </button>
              <button
                type="button"
                aria-label="Close search"
                onClick={closeFullSearch}
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={12}
                  strokeWidth={1.75}
                />
              </button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            {viewerText ? (
              <LogView
                ref={logViewRef}
                text={viewerText}
                follow={!showingResults && follow && running}
                wrap={wrap}
                className="h-full"
              />
            ) : (
              <div className="grid h-full place-items-center px-3 font-mono text-xs text-muted-foreground/50">
                {showingResults
                  ? searchLoading
                    ? "Searching all logs…"
                    : "No matches in the full log."
                  : logs.loading
                    ? "Loading logs…"
                    : "No log output."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dim({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="text-muted-foreground/30">·</span>
      <span>{children}</span>
    </>
  );
}

function LogIconBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            "grid size-5 place-items-center rounded transition-colors hover:text-foreground",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function Empty({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="text-xs text-muted-foreground/60">
      {ready ? children : "…"}
    </span>
  );
}

function ImageFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2.5 py-[2px]">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground/75">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-right text-xs text-foreground/90",
          mono && "font-mono",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function HeaderBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: (e: MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
