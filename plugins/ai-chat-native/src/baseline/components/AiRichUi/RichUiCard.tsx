/**
 * RichUiCard — the transcript card for `show_ui` and `ask_ui`.
 *
 * `show_ui` is quiet chrome around a view; `ask_ui` wears the same "Paused"
 * treatment as the question card, because it stops the run. Both share every
 * state handler, so a view behaves identically whichever tool carried it.
 *
 * NOTE: plain `memo`, no custom comparator. The AI SDK mutates tool parts in
 * place and hands React a clone afterwards, so a comparator reading
 * `a.part.state` sees the new value on both sides and freezes the card. See
 * `AiAskUser/AskUserCard.tsx` for the incident this rule comes from.
 */

import { Button } from "@termco/ui";
import { Textarea } from "@termco/ui";
import { cn } from "@termco/ui";
import {
  Alert02Icon,
  Analytics01Icon,
  Cancel01Icon,
  File01Icon,
  FileEditIcon,
  Grid02Icon,
  StarIcon,
  Table01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { memo, useMemo, useState } from "react";
import type { AskUiOutput, UiAction, ViewKind, ViewSpec } from "./types";
import { viewItemCount } from "./types";
import { RichView } from "./RichView";
import type { AskUiInput } from "./richUiData";
import { readAskUi, readAskUiOutput, readShowUi } from "./richUiData";

export type AnyRichUiPart = ToolUIPart | DynamicToolUIPart;

const KIND_META: Record<ViewKind, { icon: typeof Table01Icon; label: string }> =
  {
    table: { icon: Table01Icon, label: "Table" },
    chart: { icon: Analytics01Icon, label: "Chart" },
    diff: { icon: FileEditIcon, label: "Diff" },
    findings: { icon: Alert02Icon, label: "Findings" },
    tree: { icon: File01Icon, label: "Files" },
    metrics: { icon: Analytics01Icon, label: "Metrics" },
    cards: { icon: Grid02Icon, label: "Cards" },
  };

type Props = {
  part: AnyRichUiPart;
  interactive: boolean;
  /** Absent on read-only surfaces (coding-agent runs have no `useChat`). */
  onRespond?: (toolCallId: string, output: AskUiOutput) => void;
};

function RichUiCardImpl({ part, interactive, onRespond }: Props) {
  const toolName = getToolName(part);
  const parsed = useMemo(
    (): Partial<AskUiInput> | null =>
      interactive
        ? readAskUi(toolName, part.input)
        : readShowUi(toolName, part.input),
    [part.input, interactive, toolName],
  );
  const answered = readAskUiOutput(toolName, part);

  if (part.state === "input-streaming" || !parsed?.view) {
    return <PreparingRow interactive={interactive} />;
  }
  if (part.state === "output-error") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
        {part.errorText === "Stopped by user"
          ? "This request was stopped."
          : "The view could not be rendered."}
      </div>
    );
  }

  return (
    <ViewCard
      view={parsed.view}
      question={parsed.question}
      actions={parsed.actions}
      allowNote={parsed.allowNote !== false}
      selectable={parsed.selectable === true}
      answered={answered}
      onRespond={
        onRespond ? (out) => onRespond(part.toolCallId, out) : undefined
      }
    />
  );
}

function ViewCard({
  view,
  question,
  actions,
  allowNote,
  selectable,
  answered,
  onRespond,
}: {
  view: ViewSpec;
  question?: string;
  actions?: UiAction[];
  allowNote: boolean;
  selectable: boolean;
  answered: AskUiOutput | null;
  onRespond?: (output: AskUiOutput) => void;
}) {
  const meta = KIND_META[view.kind];
  const interactive = !!actions?.length;
  const pending = interactive && !answered;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState("");

  const respond = (action: UiAction | null) => {
    if (!onRespond) return;
    onRespond({
      actionId: action?.id ?? null,
      label: action?.label ?? note.trim(),
      note: note.trim() || undefined,
      selected: selected.size ? [...selected] : undefined,
      dismissed: action === null && !note.trim() ? true : undefined,
    });
  };

  const selection =
    selectable && pending
      ? {
          selected,
          onToggle: (label: string) =>
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(label)) next.delete(label);
              else next.add(label);
              return next;
            }),
        }
      : undefined;

  return (
    <div
      data-testid={interactive ? "rich-ui-card-interactive" : "rich-ui-card"}
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        pending
          ? "border-primary/25 shadow-[var(--shadow-control)]"
          : "border-border/60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-2.5 py-1.5 text-xs",
          pending
            ? "border-border/60 bg-[var(--signal-soft)]"
            : "border-border/40 bg-muted/30",
        )}
      >
        <HugeiconsIcon
          icon={meta.icon}
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
        />
        <span className="shrink-0 font-medium text-foreground">
          {view.title ?? meta.label}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {viewItemCount(view)}
        </span>
        <span className="flex-1" />
        {pending ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            Paused
          </span>
        ) : null}
      </div>

      <RichView view={view} selection={selection} />

      {interactive ? (
        answered ? (
          <div className="flex items-center gap-2 border-t border-border/40 bg-muted/20 px-2.5 py-1.5 text-xs">
            <HugeiconsIcon
              icon={Tick02Icon}
              size={12}
              strokeWidth={2}
              className={cn(
                "shrink-0",
                answered.dismissed
                  ? "text-muted-foreground"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {question ?? "Answered"}
            </span>
            <span className="shrink-0 font-medium text-foreground">
              {answered.dismissed ? "Dismissed" : answered.label || "Answered"}
            </span>
          </div>
        ) : (
          <div className="border-t border-border/60 bg-muted/20 px-2.5 py-2">
            {question ? (
              <p className="mb-1.5 text-xs font-medium text-foreground">
                {question}
              </p>
            ) : null}
            {allowNote ? (
              <Textarea
                value={note}
                disabled={!onRespond}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Add a note, or answer in your own words…"
                aria-label="Your note"
                className="mb-1.5 min-h-0 resize-none text-xs"
              />
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                disabled={!onRespond}
                onClick={() => respond(null)}
                className="h-7 gap-1.5 text-xs text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                Dismiss
              </Button>
              {actions?.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant={
                    a.variant === "ghost"
                      ? "ghost"
                      : a.variant === "destructive"
                        ? "destructive"
                        : "default"
                  }
                  disabled={!onRespond}
                  onClick={() => respond(a)}
                  title={a.description}
                  className="h-7 gap-1.5 text-xs"
                >
                  {a.recommended ? (
                    <HugeiconsIcon icon={StarIcon} size={10} strokeWidth={2} />
                  ) : null}
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

function PreparingRow({ interactive }: { interactive: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-card/50 px-2.5 py-2 text-xs text-muted-foreground">
      <HugeiconsIcon icon={Table01Icon} size={13} strokeWidth={1.75} />
      <span className="animate-pulse">
        {interactive ? "Preparing a choice…" : "Preparing a view…"}
      </span>
    </div>
  );
}

export const RichUiCard = memo(RichUiCardImpl);
