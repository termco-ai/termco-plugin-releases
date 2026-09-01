/**
 * Live resource meters for a running container: CPU, memory (against its limit
 * when set), network I/O and PID count. A quiet horizontal strip under the
 * identity header; rendered only while the container is running. Values are
 * mono, labels are sans (the app's typographic split). Bar width eases with a
 * soft transition; reduced-motion disables it.
 */
import ui from "@termco/ui";
import type { ContainerLimits } from "../lib/inspectParse";
import { clampPct, formatCpu, formatMemShort } from "../lib/runtimeMeta";
import type { ContainerStats } from "../types";

const { cn } = ui;

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

export function MeterStrip({
  stats,
  limits,
}: {
  stats: ContainerStats | undefined;
  limits: ContainerLimits;
}) {
  const memLimit = limits.memBytes > 0 ? formatBytes(limits.memBytes) : null;
  const cpuLimit = limits.nanoCpus > 0 ? limits.nanoCpus / 1e9 : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Meter
        label="CPU"
        value={stats ? formatCpu(stats.cpuPerc) : "…"}
        sub={cpuLimit ? `/ ${cpuLimit} cpu` : undefined}
        pct={stats ? clampPct(stats.cpuPerc) : 0}
        barClass="bg-primary"
      />
      <Meter
        label="Memory"
        value={stats ? formatMemShort(stats.memUsage) : "…"}
        sub={memLimit ? `/ ${memLimit}` : undefined}
        pct={stats ? clampPct(stats.memPerc) : 0}
        barClass="bg-blue-400"
      />
      <Stat label="Net I/O" value={stats?.netIO ? stats.netIO : "—"} />
      <Stat
        label="PIDs"
        value={stats?.pids ? String(stats.pids) : "—"}
        sub={limits.pids > 0 ? `/ ${limits.pids}` : undefined}
      />
    </div>
  );
}

function Meter({
  label,
  value,
  sub,
  pct,
  barClass,
}: {
  label: string;
  value: string;
  sub?: string;
  pct: number;
  barClass: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60 px-2.5 py-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/75">
          {label}
        </span>
        <span className="ml-auto min-w-0 truncate font-mono text-xs text-foreground/90">
          {value}
        </span>
        {sub ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground/55">
            {sub}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn(
            "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500",
            barClass,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60 px-2.5 py-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/75">
          {label}
        </span>
        <span className="ml-auto min-w-0 truncate font-mono text-xs text-foreground/90">
          {value}
        </span>
        {sub ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground/55">
            {sub}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 h-[3px] rounded-full bg-foreground/[0.04]" />
    </div>
  );
}
