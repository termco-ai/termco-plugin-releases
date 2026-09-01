import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  SshClientCapability,
  SshDetectedPort,
  SshForwardInfo,
  SshForwardInput,
  SshForwardState,
  SshHubConnectionState,
} from "@termco/ssh-base";
import type { UiSidebarBadgeProps, UiSidebarViewProps } from "@termco/ui-sidebar-base";
import ui from "@termco/ui";
import {
  Cancel01Icon,
  Copy01Icon,
  Globe02Icon,
  PlayIcon,
  PlusSignIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FormEvent, ReactNode } from "react";
import {
  activeForwardCount,
  BADGE_REFRESH_MS,
  connectionIdFor,
  FORWARD_REFRESH_MS,
  PORT_SCAN_REFRESH_MS,
  sortDetectedPorts,
  sshdPortFor,
} from "./model";

const { Tooltip, TooltipContent, TooltipTrigger, cn } = ui;
const { useCallback, useEffect, useRef, useState } = ui.React;

const STATE_DOT: Record<SshForwardState, string> = {
  starting: "bg-amber-400 animate-pulse",
  active: "bg-emerald-500",
  reconnecting: "bg-amber-400 animate-pulse",
  error: "bg-destructive",
  stopped: "bg-muted-foreground/40",
};

const STATE_LABEL: Record<SshForwardState, string> = {
  starting: "Starting…",
  active: "Active",
  reconnecting: "Reconnecting…",
  error: "Error",
  stopped: "Stopped",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ForwardsChanged = {
  connectionId: string;
  forwards: SshForwardInfo[];
};

function useForwards(
  ssh: SshClientCapability,
  events: ApplicationEventsCapability,
  connectionId: string | null,
) {
  const [forwards, setForwards] = useState<SshForwardInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!connectionId) return;
    const id = request.current;
    try {
      const value = await ssh.forwardList(connectionId);
      if (request.current === id) {
        setForwards(value);
        setError(null);
        setLoaded(true);
      }
    } catch (cause) {
      if (request.current === id) setError(message(cause));
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [connectionId, ssh]);

  useEffect(() => {
    request.current += 1;
    const id = request.current;
    setForwards([]);
    setError(null);
    setLoaded(false);
    if (!connectionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void ssh
      .forwardEnsure(connectionId)
      .then((value) => {
        if (request.current === id) {
          setForwards(value);
          setError(null);
          setLoaded(true);
        }
      })
      .catch((cause) => {
        if (request.current === id) {
          setError(message(cause));
          setLoaded(true);
        }
      })
      .finally(() => {
        if (request.current === id) setLoading(false);
      });
    const unsubscribe = events.subscribe("ssh:forwards-changed", (payload) => {
      const change = payload as ForwardsChanged;
      if (request.current !== id || change.connectionId !== connectionId) return;
      setForwards(change.forwards);
      setError(null);
      setLoading(false);
      setLoaded(true);
    });
    const timer = setInterval(() => void refresh(), FORWARD_REFRESH_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [connectionId, events, refresh, ssh]);

  const mutate = useCallback(
    async (operation: () => Promise<unknown>) => {
      try {
        await operation();
        await refresh();
      } catch (cause) {
        setError(message(cause));
        throw cause;
      }
    },
    [refresh],
  );
  return {
    connectionId,
    forwards,
    isLoading: loading,
    loaded,
    error,
    add: (input: SshForwardInput) =>
      connectionId
        ? mutate(() => ssh.forwardAdd(connectionId, input))
        : Promise.reject(new Error("No SSH connection")),
    start: (id: string) => mutate(() => ssh.forwardStart(id)),
    stop: (id: string) => mutate(() => ssh.forwardStop(id)),
    remove: (id: string) => mutate(() => ssh.forwardRemove(id)),
  };
}

type ScanState = {
  ports: SshDetectedPort[];
  outdated: boolean;
  error: string | null;
  loaded: boolean;
  stale: boolean;
};

const EMPTY_SCAN: ScanState = {
  ports: [],
  outdated: false,
  error: null,
  loaded: false,
  stale: false,
};

function usePortScan(
  ssh: SshClientCapability,
  events: ApplicationEventsCapability,
  workspace: UiSidebarViewProps["workspace"],
): ScanState {
  const connectionId = connectionIdFor(workspace);
  const sshdPort = sshdPortFor(workspace);
  const [hub, setHub] = useState<SshHubConnectionState | null>(null);
  const [poll, setPoll] = useState<ScanState>(EMPTY_SCAN);

  useEffect(() => {
    let active = true;
    setHub(null);
    if (!connectionId) return;
    void ssh.state(connectionId).then((state) => {
      if (active) setHub(state);
    });
    const unsubscribe = events.subscribe("ssh:state-changed", (payload) => {
      const state = payload as SshHubConnectionState;
      if (active && state.connectionId === connectionId) setHub(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [connectionId, events, ssh]);

  useEffect(() => {
    let active = true;
    setPoll(EMPTY_SCAN);
    if (!connectionId || workspace?.kind !== "ssh" || hub?.supported !== false)
      return;
    const sshWorkspace = workspace;
    const scan = async () => {
      try {
        const result = await ssh.scanPorts(sshWorkspace);
        if (active) {
          setPoll({
            ports: sortDetectedPorts(result.ports, sshdPort),
            outdated: result.outdated,
            error: null,
            loaded: true,
            stale: false,
          });
        }
      } catch (cause) {
        if (active)
          setPoll((current) => ({
            ...current,
            error: message(cause),
            loaded: true,
          }));
      }
    };
    void scan();
    const timer = setInterval(() => void scan(), PORT_SCAN_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connectionId, hub?.supported, ssh, sshdPort, workspace]);

  if (!connectionId) return EMPTY_SCAN;
  const domain = hub?.domains.ports;
  if (hub?.supported && domain) {
    return {
      ports: sortDetectedPorts(
        Array.isArray(domain.data) ? (domain.data as SshDetectedPort[]) : [],
        sshdPort,
      ),
      outdated: false,
      error: domain.error,
      loaded: true,
      stale: domain.stale,
    };
  }
  if (hub?.supported === false) return poll;
  return EMPTY_SCAN;
}

export function createPortsBadge(
  ssh: SshClientCapability,
  events: ApplicationEventsCapability,
) {
  return function usePortsBadge({ workspace }: UiSidebarBadgeProps): number {
    const connectionId = connectionIdFor(workspace);
    const [count, setCount] = useState(0);
    useEffect(() => {
      let active = true;
      setCount(0);
      if (!connectionId) return;
      const read = () =>
        void ssh
          .forwardList(connectionId)
          .then((items) => {
            if (active) setCount(activeForwardCount(items));
          })
          .catch(() => {});
      read();
      const unsubscribe = events.subscribe("ssh:forwards-changed", (payload) => {
        const change = payload as ForwardsChanged;
        if (active && change.connectionId === connectionId)
          setCount(activeForwardCount(change.forwards));
      });
      const timer = setInterval(read, BADGE_REFRESH_MS);
      return () => {
        active = false;
        unsubscribe();
        clearInterval(timer);
      };
    }, [connectionId]);
    return count;
  };
}

function RowIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="grid size-[22px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function ForwardRow({
  forward,
  desktop,
  onStart,
  onStop,
  onRemove,
}: {
  forward: SshForwardInfo;
  desktop: DesktopIntegrationCapability;
  onStart: () => void;
  onStop: () => void;
  onRemove: () => void;
}) {
  const running = forward.desired === "running";
  const url = `http://localhost:${forward.localPort}`;
  const remotePrefix =
    forward.remoteHost === "127.0.0.1" ? "" : `${forward.remoteHost}:`;
  return (
    <div className="border-b border-border/30 px-3.5 py-2">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-testid="forward-state"
              data-state={forward.state}
              className={cn(
                "size-2 shrink-0 rounded-full",
                STATE_DOT[forward.state],
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {STATE_LABEL[forward.state]}
          </TooltipContent>
        </Tooltip>
        <span
          title={`${remotePrefix}${forward.remotePort} → localhost:${forward.localPort}`}
          className="min-w-0 flex-1 truncate font-mono text-xs"
        >
          <span className="text-muted-foreground">{remotePrefix}</span>
          {forward.remotePort}
          <span className="text-muted-foreground"> → :</span>
          {forward.localPort}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <RowIconButton
            label="Open in browser"
            onClick={() => void desktop.openUrl(url)}
          >
            <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.9} />
          </RowIconButton>
          <RowIconButton
            label="Copy local address"
            onClick={() => void desktop.writeClipboardText(url)}
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.9} />
          </RowIconButton>
          <RowIconButton
            label={running ? "Stop forward" : "Start forward"}
            onClick={running ? onStop : onStart}
          >
            <HugeiconsIcon
              icon={running ? StopIcon : PlayIcon}
              size={13}
              strokeWidth={1.9}
            />
          </RowIconButton>
          <RowIconButton label="Remove forward" onClick={onRemove}>
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.9} />
          </RowIconButton>
        </div>
      </div>
      {forward.error && forward.state !== "active" ? (
        <div className="mt-1 pl-4 text-xs leading-snug text-destructive/90">
          {forward.error}
        </div>
      ) : null}
    </div>
  );
}

function AddForm({ onAdd }: { onAdd: (input: SshForwardInput) => Promise<void> }) {
  const [remote, setRemote] = useState("");
  const [local, setLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const remotePort = Number(remote);
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
      setError("Enter a remote port (1–65535).");
      return;
    }
    let localPort: number | "auto" = remotePort;
    if (local.trim() !== "") {
      const parsed = Number(local);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        setError("Local port must be 1–65535 (or empty for auto).");
        return;
      }
      localPort = parsed;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd({ localPort, remotePort });
      setRemote("");
      setLocal("");
    } catch (cause) {
      setError(message(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  };
  const inputClass =
    "h-7 min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2 font-sans text-xs text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-primary/50";
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="border-b border-border/40 px-3.5 py-2.5"
    >
      <div className="flex items-center gap-1.5">
        <input
          value={remote}
          onChange={(event) => setRemote(event.target.value)}
          placeholder="Remote port"
          inputMode="numeric"
          aria-label="Remote port"
          className={inputClass}
        />
        <span className="shrink-0 text-xs text-muted-foreground">→</span>
        <input
          value={local}
          onChange={(event) => setLocal(event.target.value)}
          placeholder="Local (same)"
          inputMode="numeric"
          aria-label="Local port"
          className={inputClass}
        />
        <button
          type="submit"
          aria-label="Add forward"
          disabled={busy}
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-foreground transition-colors hover:bg-foreground/12 disabled:opacity-50"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
        </button>
      </div>
      {error ? (
        <div className="mt-1.5 text-xs leading-snug text-destructive/90">
          {error}
        </div>
      ) : null}
    </form>
  );
}

function DetectedRow({
  detected,
  forwarded,
  onForward,
}: {
  detected: SshDetectedPort;
  forwarded: SshForwardInfo | undefined;
  onForward: () => void;
}) {
  const label = detected.container
    ? `${detected.container.container}:${detected.container.containerPort}`
    : (detected.process ?? "");
  return (
    <div className="flex items-center gap-2 border-b border-border/30 px-3.5 py-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {detected.port}
        {label ? <span className="text-muted-foreground"> · {label}</span> : null}
      </span>
      {detected.loopbackOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              server-only
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56 text-xs">
            Bound to loopback on the server — forwarding is the only way to
            reach it from here.
          </TooltipContent>
        </Tooltip>
      ) : null}
      {forwarded ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-testid="detected-forwarded"
              className={cn(
                "size-2 shrink-0 rounded-full",
                STATE_DOT[forwarded.state],
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Forwarded to localhost:{forwarded.localPort} — {STATE_LABEL[forwarded.state]}
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          aria-label={`Forward port ${detected.port}`}
          onClick={onForward}
          className="h-[22px] shrink-0 rounded-md bg-foreground/[0.06] px-2 font-sans text-xs font-medium text-foreground transition-colors hover:bg-foreground/12"
        >
          Forward
        </button>
      )}
    </div>
  );
}

export function createPortsPanel(
  ssh: SshClientCapability,
  desktop: DesktopIntegrationCapability,
  events: ApplicationEventsCapability,
) {
  return function PortsPanel({ workspace }: UiSidebarViewProps) {
    const connectionId = connectionIdFor(workspace);
    const ports = useForwards(ssh, events, connectionId);
    const scan = usePortScan(ssh, events, workspace);
    const forwardDetected = async (port: number) => {
      try {
        await ports.add({ localPort: port, remotePort: port });
      } catch {
        await ports
          .add({ localPort: "auto", remotePort: port })
          .catch(() => {});
      }
    };
    const forwardFor = (port: number) =>
      ports.forwards.find(
        (forward) =>
          forward.remotePort === port && forward.remoteHost === "127.0.0.1",
      );
    const detected = scan.outdated ? (
      <Message>
        The server agent on this host predates port discovery. Disconnect and
        reconnect the rig to deploy the update.
      </Message>
    ) : scan.error ? (
      <Message>Couldn't scan the server for listening ports.</Message>
    ) : !scan.loaded ? (
      <Message>Scanning…</Message>
    ) : scan.ports.length === 0 ? (
      <Message>Nothing is listening on the server.</Message>
    ) : (
      scan.ports.map((entry) => (
        <DetectedRow
          key={entry.port}
          detected={entry}
          forwarded={forwardFor(entry.port)}
          onForward={() => void forwardDetected(entry.port)}
        />
      ))
    );
    const body = !connectionId ? (
      <Center
        title="Only available in SSH rigs"
        body="Switch to an SSH rig to forward ports from the remote host to this machine."
      />
    ) : !ports.loaded && ports.isLoading ? (
      <Center title="Loading forwards…" />
    ) : ports.error && ports.forwards.length === 0 ? (
      <Center title="Couldn't load forwards" body={ports.error} />
    ) : (
      <>
        <AddForm onAdd={ports.add} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ports.forwards.length === 0 ? (
            <Message>No forwarded ports yet.</Message>
          ) : (
            ports.forwards.map((forward) => (
              <ForwardRow
                key={forward.id}
                forward={forward}
                desktop={desktop}
                onStart={() => void ports.start(forward.id)}
                onStop={() => void ports.stop(forward.id)}
                onRemove={() => void ports.remove(forward.id)}
              />
            ))
          )}
          <div className="flex h-8 items-center gap-2 border-b border-border/40 px-3.5">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground">
              DETECTED ON SERVER
            </span>
            {scan.stale ? (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                disconnected
              </span>
            ) : null}
          </div>
          {detected}
        </div>
      </>
    );
    return (
      <div data-testid="ports-sidebar" className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground">
              PORTS
            </span>
            {ports.forwards.length > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground/70">
                {ports.forwards.length}
              </span>
            ) : null}
          </div>
        </div>
        {body}
      </div>
    );
  };
}

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="px-3.5 py-2 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

function Center({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-sm font-medium">{title}</div>
      {body ? (
        <div className="max-w-64 text-xs leading-relaxed text-muted-foreground">
          {body}
        </div>
      ) : null}
    </div>
  );
}
