/**
 * AiToolApproval — the approval card for a pending tool call (approve/deny),
 * memoized so it never re-renders on downstream tokens. Owns the tool-meta
 * label/icon registry; the per-tool preview lives in `./PreviewBlock`.
 */

import { Button } from "@termco/ui";
import {
  Cancel01Icon,
  CursorMagicSelection02Icon,
  Edit02Icon,
  FileEditIcon,
  FilePlusIcon,
  FolderAddIcon,
  Globe02Icon,
  HelpCircleIcon,
  KeyframeIcon,
  MapsIcon,
  TerminalIcon,
  Tick02Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ToolUIPart } from "ai";
import { memo, useEffect, useMemo, useState } from "react";
import { useChatStore } from "../../store/chatStore";
import { allowActiveBrowserOrigin, BROWSER_ACTION_TOOLS } from "./alwaysAllow";
import { PreviewBlock } from "./PreviewBlock";

type Props = {
  part: Extract<ToolUIPart, { state: "approval-requested" }>;
  toolName: string;
  onRespond: (approved: boolean, always?: boolean) => void;
  /** Show an "Always allow" action (coding-agent runs remember the rule for the
   * rest of the run). Distinct from the browser per-site allow-list below. */
  allowRemember?: boolean;
};

const TOOL_META: Record<string, { label: string; icon: typeof FilePlusIcon }> =
  {
    write_file: { label: "Write file", icon: FilePlusIcon },
    edit: { label: "Edit file", icon: FileEditIcon },
    multi_edit: { label: "Edit file (batch)", icon: Edit02Icon },
    create_directory: { label: "Create directory", icon: FolderAddIcon },
    bash_run: { label: "Run shell command", icon: TerminalIcon },
    bash_background: { label: "Spawn background process", icon: TerminalIcon },
    browser_navigate: { label: "Open in browser", icon: Globe02Icon },
    browser_click: {
      label: "Click in browser",
      icon: CursorMagicSelection02Icon,
    },
    browser_type: { label: "Type in browser", icon: Edit02Icon },
    browser_press_key: { label: "Press key in browser", icon: KeyframeIcon },
    browser_evaluate: {
      label: "Run JavaScript in browser",
      icon: TerminalIcon,
    },
    browser_network_body: { label: "Read a response body", icon: Globe02Icon },
    browser_select_option: { label: "Select an option", icon: Edit02Icon },
    browser_file_upload: { label: "Upload a file", icon: FilePlusIcon },
  };

/** Coding-agent tools that get a bespoke approval panel instead of the generic
 * approve/deny footer. */
const isPlanTool = (t: string) =>
  t === "ExitPlanMode" || t === "exit_plan_mode";
const isQuestionTool = (t: string) =>
  t === "AskUserQuestion" || t === "ask_user_question";

function AiToolApprovalImpl({
  part,
  toolName,
  onRespond,
  allowRemember,
}: Props) {
  const plan = isPlanTool(toolName);
  const question = isQuestionTool(toolName);
  const meta = TOOL_META[toolName];
  const label = plan
    ? "Plan ready"
    : question
      ? "Agent has a question"
      : (meta?.label ?? toolName);
  const Icon = plan
    ? MapsIcon
    : question
      ? HelpCircleIcon
      : (meta?.icon ?? ToolsIcon);
  const input = part.input as Record<string, unknown>;
  const isBrowserAction = BROWSER_ACTION_TOOLS.has(toolName);
  const focusInput = useChatStore((state) => state.focusInput);
  const [questionSelections, setQuestionSelections] = useState<
    Record<number, string>
  >({});
  const questions = useMemo(
    () =>
      Array.isArray(input.questions)
        ? (input.questions as Array<Record<string, unknown>>)
        : [],
    [input.questions],
  );
  const selectableQuestionCount = questions.filter(
    (item) => Array.isArray(item.options) && item.options.length > 0,
  ).length;
  const answeredQuestionCount = Object.keys(questionSelections).length;
  const questionReady =
    selectableQuestionCount === 0 ||
    answeredQuestionCount === selectableQuestionCount;

  useEffect(() => {
    setQuestionSelections({});
  }, [part.approval.id]);

  // Plan panel: ⌘↩ / Ctrl+↩ = Build it.
  useEffect(() => {
    if (!plan) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onRespond(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, onRespond]);

  if (plan) {
    return (
      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[var(--shadow-control)]">
        <div className="flex items-start gap-3 border-b border-border/60 bg-[var(--signal-soft)] px-3 py-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background text-primary ring-1 ring-primary/20">
            <HugeiconsIcon icon={MapsIcon} size={14} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">
              {label}
            </span>
            <span className="block text-xs text-muted-foreground">
              Check the approach before the agent changes your workspace.
            </span>
          </div>
        </div>
        <div className="px-3 py-3">
          <PreviewBlock toolName={toolName} input={input} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Nothing runs until you approve.
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRespond(false)}
              className="h-7 gap-1.5 text-xs"
              title="Keep planning — send feedback to revise"
            >
              <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={2} />
              Revise
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => onRespond(true)}
              className="h-7 gap-1.5 text-xs"
              title="Approve the plan and start building (⌘↩)"
            >
              <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
              Build it
              <kbd className="ml-0.5 rounded border border-primary-foreground/30 px-1 text-xs opacity-80">
                ⌘↩
              </kbd>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[var(--shadow-control)]">
      <div className="flex items-start gap-3 border-b border-border/60 bg-[var(--signal-soft)] px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background text-primary ring-1 ring-primary/20">
          <HugeiconsIcon icon={Icon} size={14} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-foreground">
            Review required
          </span>
          <span className="block text-xs text-muted-foreground">{label}</span>
        </div>
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Paused
        </span>
      </div>

      <div className="px-3 py-3">
        <PreviewBlock
          toolName={toolName}
          input={input}
          questionSelections={questionSelections}
          onQuestionSelection={(questionIndex, answer) =>
            setQuestionSelections((current) => ({
              ...current,
              [questionIndex]: answer,
            }))
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRespond(false)}
          className="h-7 gap-1.5 text-xs"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
          {question ? "Dismiss" : "Don’t allow"}
        </Button>
        {question ? (
          <Button
            size="sm"
            variant="default"
            disabled={!questionReady}
            onClick={() => {
              const answer = formatQuestionAnswer(
                questions,
                questionSelections,
              );
              onRespond(false);
              requestAnimationFrame(() => focusInput(answer));
            }}
            className="h-7 gap-1.5 text-xs"
          >
            <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={2} />
            Answer in composer
          </Button>
        ) : null}
        {isBrowserAction && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Allow this site for the rest of the session, then approve the
              // pending action. Allow-listing must not block the approval if
              // origin resolution fails.
              void allowActiveBrowserOrigin().finally(() => onRespond(true));
            }}
            className="h-7 gap-1.5 text-xs text-muted-foreground"
          >
            Trust this site
          </Button>
        )}
        {allowRemember && !isBrowserAction && !question && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRespond(true, true)}
            className="h-7 gap-1.5 text-xs text-muted-foreground"
          >
            Always allow
          </Button>
        )}
        {!question ? (
          <Button
            size="sm"
            variant="default"
            onClick={() => onRespond(true)}
            className="h-7 gap-1.5 text-xs"
          >
            <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
            Approve
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export const AiToolApproval = memo(AiToolApprovalImpl, (a, b) => {
  // The approval card never changes content for a given approvalId — once
  // the model has emitted the approval-requested part with its input, we
  // don't want to re-render on every downstream token.
  return (
    a.toolName === b.toolName &&
    a.part.approval.id === b.part.approval.id &&
    a.onRespond === b.onRespond &&
    a.allowRemember === b.allowRemember
  );
});

function formatQuestionAnswer(
  questions: Array<Record<string, unknown>>,
  selections: Record<number, string>,
): string {
  if (questions.length === 0) return "";
  if (questions.length === 1) return selections[0] ?? "";
  return questions
    .map((question, index) => {
      const label = String(question.question ?? question.header ?? "Question");
      return `${label}: ${selections[index] ?? ""}`;
    })
    .join("\n");
}
