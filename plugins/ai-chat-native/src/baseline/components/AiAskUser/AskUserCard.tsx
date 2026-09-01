/**
 * AskUserCard — the in-transcript card for an `ask_user` tool call.
 *
 * Three states, one component:
 *  - `input-streaming`  the model is still writing the question → placeholder.
 *    A half-parsed question must never flash up as if it were the real one.
 *  - `input-available`  the question is open → options, free text, actions.
 *  - `output-*`         answered → a compact, expandable record of the decision.
 *
 * The free-text field lives inside the card on purpose: the composer is locked
 * while a run is in flight, so it cannot be the place where the answer is typed.
 */

import { Button } from "@termco/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@termco/ui";
import { Textarea } from "@termco/ui";
import { cn } from "@termco/ui";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  HelpCircleIcon,
  StarIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName } from "ai";
import { memo, useEffect, useMemo, useState } from "react";
import {
  answerLabel,
  readAskUserInput,
  readAskUserOutput,
} from "./askUserData";
import type { AskUserOutput, AskUserQuestion } from "./types";

export type AnyAskUserPart = ToolUIPart | DynamicToolUIPart;

type Props = {
  part: AnyAskUserPart;
  /** Absent in read-only surfaces (coding-agent runs) — the card then just shows state. */
  onAnswer?: (toolCallId: string, output: AskUserOutput) => void;
};

function AskUserCardImpl({ part, onAnswer }: Props) {
  const toolName = getToolName(part);
  const question = useMemo(
    () => readAskUserInput(toolName, part.input),
    [part.input, toolName],
  );
  const answered = readAskUserOutput(toolName, part);

  if (answered) return <AnsweredRow question={question} output={answered} />;
  if (part.state === "input-streaming" || !question.question) {
    return <PreparingRow />;
  }
  if (part.state === "output-error") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
        {part.errorText === "Stopped by user"
          ? "This question was stopped."
          : "The question could not be delivered."}
      </div>
    );
  }
  return (
    <OpenQuestion
      question={question}
      disabled={!onAnswer}
      onAnswer={(output) => onAnswer?.(part.toolCallId, output)}
    />
  );
}

/* ------------------------------------------------------------------ open --- */

function OpenQuestion({
  question,
  disabled,
  onAnswer,
}: {
  question: AskUserQuestion;
  disabled: boolean;
  onAnswer: (output: AskUserOutput) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [freeText, setFreeText] = useState("");
  const options = question.options;
  const allowFreeText = question.allowFreeText !== false;
  const ready = selected.length > 0 || freeText.trim().length > 0;

  const submit = () => {
    if (!ready || disabled) return;
    const labels = selected.map((i) => options[i]?.label ?? "").filter(Boolean);
    const typed = freeText.trim();
    onAnswer({
      answer: labels.length
        ? typed
          ? `${labels.join(", ")} — ${typed}`
          : labels.join(", ")
        : typed,
      selected: labels.length ? labels : undefined,
      freeText: labels.length === 0 ? true : undefined,
    });
  };

  const toggle = (index: number) => {
    setSelected((current) =>
      question.multiSelect
        ? current.includes(index)
          ? current.filter((i) => i !== index)
          : [...current, index]
        : current[0] === index
          ? []
          : [index],
    );
  };

  // 1–9 pick an option, ⌘↩ answers. Ignored while the user is typing anywhere
  // (composer, this card's own textarea) — a digit must stay a digit there.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const digit = Number.parseInt(e.key, 10);
      if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
        e.preventDefault();
        toggle(digit - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      data-testid="ask-user-card"
      className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[var(--shadow-control)]"
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-[var(--signal-soft)] px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background text-primary ring-1 ring-primary/20">
          <HugeiconsIcon icon={HelpCircleIcon} size={14} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-foreground">
            {question.topic || "A question for you"}
          </span>
          <span className="block text-xs text-muted-foreground">
            Your call — nothing continues until you answer.
          </span>
        </div>
        <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Paused
        </span>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        <p className="text-xs font-medium leading-relaxed text-foreground">
          {question.question}
        </p>
        {question.context ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {question.context}
          </p>
        ) : null}

        {options.length > 0 ? (
          <div className="space-y-1">
            {options.map((option, index) => {
              const active = selected.includes(index);
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: the options
                  // come from a completed tool input — the list never reorders.
                  key={`${option.label}-${index}`}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => toggle(index)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                    active
                      ? "border-primary/30 bg-[var(--signal-soft)]"
                      : "border-border/70 bg-background hover:bg-muted/35",
                  )}
                >
                  <span className="mt-px shrink-0 font-mono text-muted-foreground/70">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground">{option.label}</span>
                    {option.recommended ? (
                      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px align-middle text-xs font-medium text-primary">
                        <HugeiconsIcon
                          icon={StarIcon}
                          size={9}
                          strokeWidth={2}
                        />
                        Recommended
                      </span>
                    ) : null}
                    {option.description ? (
                      <span className="mt-0.5 block text-muted-foreground/80">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {active ? (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={12}
                      strokeWidth={2}
                      className="mt-px shrink-0 text-primary"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {allowFreeText ? (
          <Textarea
            value={freeText}
            disabled={disabled}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={
              options.length > 0
                ? "Or answer in your own words…"
                : "Your answer…"
            }
            aria-label="Your own answer"
            className="min-h-0 resize-none text-xs"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            onAnswer({
              answer:
                "The user ended the questioning. Stop asking and summarize what you have.",
              stopped: true,
            })
          }
          className="h-7 gap-1.5 text-xs text-muted-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
          End session
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            onAnswer({
              answer:
                "The user skipped this question. Decide it yourself with your recommended answer and move on.",
              skipped: true,
            })
          }
          className="h-7 text-xs text-muted-foreground"
        >
          Skip
        </Button>
        <Button
          size="sm"
          variant="default"
          disabled={disabled || !ready}
          onClick={submit}
          className="h-7 gap-1.5 text-xs"
        >
          <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
          Answer
          <kbd className="ml-0.5 rounded border border-primary-foreground/30 px-1 text-xs opacity-80">
            ⌘↩
          </kbd>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- answered --- */

function AnsweredRow({
  question,
  output,
}: {
  question: AskUserQuestion;
  output: AskUserOutput;
}) {
  const label = answerLabel(output);
  const hasDetail =
    !!question.context ||
    question.options.some((o) => o.description || o.recommended);

  const head = (
    <>
      <HugeiconsIcon
        icon={Tick02Icon}
        size={12}
        strokeWidth={2}
        className={cn(
          "mt-px shrink-0",
          output.stopped || output.skipped
            ? "text-muted-foreground"
            : "text-emerald-600 dark:text-emerald-400",
        )}
      />
      <span className="min-w-0 flex-1 text-muted-foreground">
        {question.question || "Question"}
      </span>
      <span className="shrink-0 font-medium text-foreground">{label}</span>
    </>
  );

  if (!hasDetail) {
    return (
      <div
        data-testid="ask-user-answered"
        className="flex items-start gap-2 rounded-md border border-border/50 bg-card/50 px-2.5 py-2 text-xs"
      >
        {head}
      </div>
    );
  }

  return (
    <Collapsible
      data-testid="ask-user-answered"
      className="group/ask overflow-hidden rounded-md border border-border/50 bg-card/50"
    >
      <CollapsibleTrigger className="flex w-full items-start gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={11}
          strokeWidth={2}
          className="mt-px shrink-0 text-muted-foreground transition-transform group-data-[state=open]/ask:rotate-90"
        />
        {head}
      </CollapsibleTrigger>
      <CollapsibleContent className="termco-collapsible-content border-t border-border/30">
        <div className="space-y-1.5 px-2.5 py-2 text-xs">
          {question.context ? (
            <p className="leading-relaxed text-muted-foreground">
              {question.context}
            </p>
          ) : null}
          {question.options.map((option, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static option list
              key={`${option.label}-${index}`}
              className={cn(
                "flex gap-2",
                output.selected?.includes(option.label)
                  ? "text-foreground"
                  : "text-muted-foreground/70",
              )}
            >
              <span className="shrink-0 font-mono opacity-70">
                {index + 1}.
              </span>
              <span>
                {option.label}
                {option.recommended ? " (recommended)" : ""}
                {option.description ? ` — ${option.description}` : ""}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreparingRow() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-card/50 px-2.5 py-2 text-xs text-muted-foreground">
      <HugeiconsIcon icon={HelpCircleIcon} size={13} strokeWidth={1.75} />
      <span className="animate-pulse">Preparing a question…</span>
    </div>
  );
}

/**
 * Plain `memo` — deliberately NO custom comparator.
 *
 * The AI SDK mutates its tool parts in place (`updateToolPart` assigns
 * `part.state`/`part.input`) and hands React a fresh clone afterwards. By the
 * time a comparator runs, the object React kept as "previous props" has already
 * been mutated to the new state, so `a.part.state === b.part.state` is true for
 * a change it is supposed to detect — the card would freeze on its first render
 * ("Preparing a question…" forever). Any comparator that reads fields off
 * `part` has this flaw. React's default shallow check on the part *reference*
 * is both correct and sufficient here.
 */
export const AskUserCard = memo(AskUserCardImpl);
