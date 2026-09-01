/**
 * A published-container-port chip that routes the port to localhost in one
 * click. Used on both the sidebar card and the detail view. Primary click:
 * forward it (SSH) / open it (local); when already forwarded, open it. The ▾
 * menu offers same/free/custom local port, open, copy, and stop.
 *
 * Visual language follows Termco's system: sans labels, mono port values, and
 * a compact healthy signal for a live route.
 */
import ui from "@termco/ui";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  Copy01Icon,
  Globe02Icon,
  PlugSocketIcon,
  ShuffleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type MouseEvent, useState } from "react";
import type { ForwardInfo, RouteChoice } from "../useContainerPortForward";

const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} = ui;

export function PortForwardChip({
  hostPort,
  label,
  forward,
  isSsh,
  onRoute,
  onOpen,
  onStop,
}: {
  hostPort: number;
  label: string;
  forward: ForwardInfo | null;
  isSsh: boolean;
  onRoute: (choice: RouteChoice) => void;
  onOpen: (localPort: number) => void;
  onStop: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const active = forward?.state === "active";
  const pending =
    forward?.state === "starting" || forward?.state === "reconnecting";
  const errored = forward?.state === "error";
  const localPort = forward?.localPort ?? hostPort;
  const remapped = active && forward && forward.localPort !== hostPort;

  const stop = (e: MouseEvent) => e.stopPropagation();

  const skin = errored
    ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
    : active
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-border bg-muted/50 text-muted-foreground";

  const primary = () => {
    if (active && forward) onOpen(forward.localPort);
    else onRoute("same");
  };

  const copyUrl = (port: number) =>
    void navigator.clipboard.writeText(`http://localhost:${port}`);

  const customValid = (() => {
    const n = Number(custom);
    return Number.isInteger(n) && n > 0 && n < 65536;
  })();
  const submitCustom = () => {
    if (!customValid) return;
    onRoute(Number(custom));
    setCustom("");
    setOpen(false);
  };

  const title = errored
    ? (forward?.error ?? "forward error")
    : active
      ? `Forwarded → localhost:${localPort} (click to open)`
      : isSsh
        ? `Route :${hostPort} to localhost`
        : `Open localhost:${hostPort}`;

  return (
    <span
      className={cn(
        "inline-flex h-[19px] items-center overflow-hidden rounded-md border font-mono text-xs font-semibold",
        skin,
        pending && "motion-safe:animate-pulse",
      )}
    >
      <button
        type="button"
        title={title}
        onClick={(e) => {
          stop(e);
          primary();
        }}
        className="inline-flex h-full items-center gap-1 pr-1 pl-1.5 transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10"
      >
        {active ? (
          <span className="size-1 rounded-full bg-current motion-safe:animate-pulse" />
        ) : null}
        {label}
        {remapped ? <span className="opacity-60">· :{localPort}</span> : null}
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Port ${hostPort} options`}
            onClick={stop}
            className="inline-flex h-full items-center pr-1 pl-0.5 opacity-55 transition-[opacity,background-color] hover:bg-black/[0.06] hover:opacity-100 dark:hover:bg-white/10"
          >
            <Chevron />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-56 rounded-lg"
          onClick={stop}
        >
          {!isSsh ? (
            <>
              <Eyebrow label="Local port" value={`localhost:${hostPort}`} />
              <ActionRow
                icon={Globe02Icon}
                onSelect={() => onRoute("same")}
                text="Open in preview"
              />
              <ActionRow
                icon={Copy01Icon}
                onSelect={() => copyUrl(hostPort)}
                text="Copy URL"
              />
            </>
          ) : active && forward ? (
            <>
              <ForwardingHeader localPort={forward.localPort} />
              <ActionRow
                icon={Globe02Icon}
                onSelect={() => onOpen(forward.localPort)}
                text="Open in preview"
              />
              <ActionRow
                icon={Copy01Icon}
                onSelect={() => copyUrl(forward.localPort)}
                text="Copy URL"
              />
              <DropdownMenuSeparator />
              <ActionRow
                icon={Cancel01Icon}
                variant="destructive"
                onSelect={() => onStop(forward.id)}
                text="Stop forwarding"
              />
            </>
          ) : (
            <>
              <Eyebrow label="Route port" value={`:${hostPort}`} />
              <ActionRow
                icon={PlugSocketIcon}
                onSelect={() => onRoute("same")}
                text="To localhost"
                hint={`:${hostPort}`}
              />
              <ActionRow
                icon={ShuffleIcon}
                onSelect={() => onRoute("auto")}
                text="To a free port"
              />
              {errored ? (
                <p className="px-3 py-1 text-xs text-red-600 dark:text-red-400">
                  {forward?.error ?? "forward error"}
                </p>
              ) : null}
              <DropdownMenuSeparator />
              <div className="px-2 pb-1">
                <div className="flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background px-2 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/20">
                  <ArrowUpRightGlyph />
                  <span className="font-mono text-xs text-muted-foreground/70">
                    localhost:
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={custom}
                    placeholder="port"
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") submitCustom();
                    }}
                    onChange={(e) =>
                      setCustom(e.target.value.replace(/\D/g, ""))
                    }
                    className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Forward to this port"
                    disabled={!customValid}
                    onClick={submitCustom}
                    className="grid size-5 shrink-0 place-items-center rounded text-primary transition-colors hover:bg-primary/10 disabled:opacity-35"
                  >
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={13}
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

function Eyebrow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 px-3 pt-1.5 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <span className="ml-auto font-mono text-xs text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

function ForwardingHeader({ localPort }: { localPort: number }) {
  return (
    <div className="px-3 pt-1.5 pb-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          Forwarding
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="size-1 rounded-full bg-current motion-safe:animate-pulse" />
          live
        </span>
      </div>
      <div className="mt-0.5 font-mono text-xs text-foreground">
        localhost:{localPort}
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  text,
  hint,
  variant,
  onSelect,
}: {
  icon: typeof Globe02Icon;
  text: string;
  hint?: string;
  variant?: "default" | "destructive";
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      variant={variant}
      onSelect={onSelect}
      className="gap-2.5 py-1.5 text-xs"
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.8} />
      <span>{text}</span>
      {hint ? (
        <span className="ml-auto font-mono text-xs text-muted-foreground/70">
          {hint}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}

function Chevron() {
  return <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2.25} />;
}

function ArrowUpRightGlyph() {
  return (
    <HugeiconsIcon
      icon={ArrowUpRight01Icon}
      size={12}
      strokeWidth={1.75}
      className="shrink-0 text-muted-foreground/60"
    />
  );
}
