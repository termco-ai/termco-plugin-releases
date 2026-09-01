import { PopoverContent } from "@termco/ui";
import { cn } from "@termco/ui";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SlashCommandMeta } from "../lib/slashCommands";
import type { Snippet } from "../lib/snippets";

export type PickerItem =
  | { kind: "snippet"; snippet: Snippet }
  | { kind: "command"; command: SlashCommandMeta };

type Props = {
  items: readonly PickerItem[];
  activeIndex: number;
  onPick: (item: PickerItem) => void;
  onHover: (index: number) => void;
};

export function SnippetPickerContent({
  items,
  activeIndex,
  onPick,
  onHover,
}: Props) {
  const commands = items.filter((it) => it.kind === "command");
  const snippets = items.filter((it) => it.kind === "snippet");
  let cursor = -1;

  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="w-80 gap-0 overflow-hidden p-0"
    >
      <div className="border-b border-border/70 px-3.5 py-3">
        <p className="text-xs font-semibold text-foreground">
          Insert into request
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose a built-in workflow or one of your saved prompts.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No matches. Add snippets in Settings → Agents.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto p-1.5">
          {commands.length > 0 && (
            <>
              <SectionHeader label="Pre-built snippets" />
              <ul>
                {commands.map((it) => {
                  cursor += 1;
                  const i = cursor;
                  if (it.kind !== "command") return null;
                  const c = it.command;
                  return (
                    <li key={`cmd-${c.name}`}>
                      <button
                        type="button"
                        onMouseEnter={() => onHover(i)}
                        onClick={() => onPick(it)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-xs",
                          i === activeIndex
                            ? "border-primary/25 bg-[var(--signal-soft)]"
                            : "border-transparent hover:border-border hover:bg-muted/30",
                        )}
                      >
                        <HugeiconsIcon
                          icon={c.icon}
                          size={13}
                          strokeWidth={1.75}
                          className="text-muted-foreground"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-medium text-foreground">
                            {c.label}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            #{c.name}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {snippets.length > 0 && (
            <>
              <SectionHeader label="Snippets" />
              <ul>
                {snippets.map((it) => {
                  cursor += 1;
                  const i = cursor;
                  if (it.kind !== "snippet") return null;
                  const s = it.snippet;
                  return (
                    <li key={`sn-${s.id}`}>
                      <button
                        type="button"
                        onMouseEnter={() => onHover(i)}
                        onClick={() => onPick(it)}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left text-xs",
                          i === activeIndex
                            ? "border-primary/25 bg-[var(--signal-soft)]"
                            : "border-transparent hover:border-border hover:bg-muted/30",
                        )}
                      >
                        <span className="flex w-full items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {s.name}
                          </span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">
                            #{s.handle}
                          </span>
                        </span>
                        {s.description ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {s.description}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </PopoverContent>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
      {label}
    </div>
  );
}
