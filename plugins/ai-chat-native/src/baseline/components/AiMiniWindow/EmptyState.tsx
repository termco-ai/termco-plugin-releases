/** Zero-message workbench with lightweight, contextual starting points. */

import {
  AlertCircleIcon,
  ArrowRight01Icon,
  FilterIcon,
  SparklesIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const SUGGESTIONS = [
  {
    label: "Explain the last error",
    hint: "Inspect the terminal buffer and identify the cause",
    icon: AlertCircleIcon,
    text: "Explain the last error in the terminal.",
  },
  {
    label: "Generate a command",
    hint: "Turn an outcome into a safe shell command",
    icon: TerminalIcon,
    text: "Give me a command to ",
  },
  {
    label: "Summarize recent activity",
    hint: "Recap commands, output, and what changed",
    icon: FilterIcon,
    text: "Summarize what just happened in the terminal.",
  },
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center px-5 py-5">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-2 text-primary">
          <span className="grid size-7 place-items-center rounded-md bg-[var(--signal-soft)]">
            <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.8} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide">
            Workspace assistant
          </span>
        </div>
        <h2 className="mt-3 font-heading text-xl font-semibold tracking-tight text-foreground">
          What should happen next?
        </h2>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Termco can inspect the active terminal and workspace, explain what
          happened, or help carry a task through.
        </p>

        <div className="mt-4 border-y border-border/70">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onPick(suggestion.text)}
              className="group flex w-full items-center gap-3 border-b border-border/60 px-1 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/30"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors group-hover:text-foreground">
                <HugeiconsIcon
                  icon={suggestion.icon}
                  size={13}
                  strokeWidth={1.75}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">
                  {suggestion.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {suggestion.hint}
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={13}
                strokeWidth={1.75}
                className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
