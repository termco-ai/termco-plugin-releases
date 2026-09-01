/** Source-owned by the coding-agent-native plugin.
 * Per-backend display identity — each coding-agent CLI gets a distinct icon and
 * tint so a run's backend reads at a glance in the roster and header. Colors are
 * kept off the app's accent hue (amber vs. sky) so "which backend" is encoded in
 * form, not just text.
 */

import { RoboticIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AgentBackend } from "../lib/protocol";

type BackendMeta = {
  label: string;
  blurb: string;
  /** Icon tile classes (bg + text). */
  tile: string;
  icon: typeof RoboticIcon;
};

const META: Record<AgentBackend, BackendMeta> = {
  claude: {
    label: "Claude Code",
    blurb: "Anthropic · reuses your Claude Max login",
    tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    icon: RoboticIcon,
  },
  codex: {
    label: "Codex",
    blurb: "OpenAI · reuses your Codex login",
    tile: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    icon: SourceCodeIcon,
  },
};

export function backendMeta(backend: AgentBackend): BackendMeta {
  return META[backend];
}

/** A rounded backend avatar tile at a given size. */
export function BackendAvatar({
  backend,
  size = 34,
  className,
}: {
  backend: AgentBackend;
  size?: number;
  className?: string;
}) {
  const m = META[backend];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${m.tile} ${className ?? ""}`}
      style={{ width: size, height: size }}
      title={m.label}
    >
      <HugeiconsIcon
        icon={m.icon}
        size={Math.round(size * 0.46)}
        strokeWidth={1.6}
      />
    </span>
  );
}
