// The `>` mode: recent shell commands from history, each re-runnable by
// inserting it into the active terminal.

import { CommandGroup, CommandItem } from "../../ui";
import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AsyncQueryState } from "../hooks/useAsyncQuery";
import { AsyncBody } from "./AsyncBody";
import { StatusItem } from "./StatusItem";

/**
 * Render the command-history results (or the appropriate guidance/status).
 *
 * @param insertCommand Terminal insert callback, or `null` when no terminal is
 *   available; its absence disables the mode.
 * @param history Async query state from `useCommandHistory`.
 * @param onRun Invoked with the chosen command string.
 */
export function HistoryView({
  insertCommand,
  history,
  onRun,
}: {
  insertCommand: ((cmd: string) => void) | null;
  history: AsyncQueryState<string>;
  onRun: (cmd: string) => void;
}) {
  return (
    <CommandGroup heading="Command history">
      {!insertCommand ? (
        <StatusItem label="Open a terminal to run history" />
      ) : (
        <AsyncBody
          loading={history.loading}
          error={history.error}
          empty={history.results.length === 0}
          emptyLabel="No history"
          onRetry={history.retry}
        >
          {history.results.map((cmd) => (
            <CommandItem
              key={`hist:${cmd}`}
              value={`hist:${cmd}`}
              onSelect={() => onRun(cmd)}
              className="gap-3 rounded-lg! px-3 py-2 text-sm data-selected:bg-primary/10"
            >
              <HugeiconsIcon
                icon={TerminalIcon}
                size={14}
                strokeWidth={1.75}
                className="text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {cmd}
              </span>
            </CommandItem>
          ))}
        </AsyncBody>
      )}
    </CommandGroup>
  );
}
