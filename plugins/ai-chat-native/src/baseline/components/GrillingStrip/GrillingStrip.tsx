/**
 * GrillingStrip — the decision log of a running questioning session.
 *
 * State is derived from the transcript (`deriveAskUserSession`), not held in a
 * store: the message list already holds every question and its answer, so the
 * strip and the cards can never drift apart, and a reload restores the log for
 * free along with the messages.
 */

import { Button } from "@termco/ui";
import { Progress } from "@termco/ui";
import { ScrollArea } from "@termco/ui";
import { cn } from "@termco/ui";
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  Download01Icon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import { toast } from "sonner";
import { native } from "../../lib/native";
import { useChatStore } from "../../store/chatStore";
import {
  type AskUserSession,
  answerLabel,
  deriveAskUserSession,
  sessionToMarkdown,
} from "../AiAskUser";

function GrillingStripImpl({ messages }: { messages: UIMessage[] }) {
  const session = useMemo(() => deriveAskUserSession(messages), [messages]);
  if (session.entries.length === 0) return null;

  const pct =
    session.total > 0
      ? Math.round((session.answered / session.total) * 100)
      : 0;

  return (
    <div
      data-testid="grilling-strip"
      className="flex max-h-[35%] min-h-0 shrink-0 flex-col border-t-2 border-border/40 bg-muted/80 px-3 py-1.5 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.2)]"
    >
      <div className="my-1.5 flex shrink-0 items-center gap-2">
        <span className="truncate text-xs font-medium text-foreground">
          {session.topic ?? "Decisions"}
        </span>
        <Progress value={pct} className="h-1 flex-1" />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {session.answered}/{Math.max(session.total, session.answered)}
        </span>
        <ExportActions session={session} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-0.5">
          {session.entries.map((entry, index) => (
            <li
              key={entry.toolCallId}
              className={cn(
                "flex items-start gap-2 rounded px-1.5 py-1 text-xs leading-snug",
                entry.open && "border-l-2 border-foreground/50 bg-muted/40",
              )}
            >
              <span className="mt-[2px] inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
                <HugeiconsIcon
                  icon={entry.open ? HelpCircleIcon : CheckmarkCircle02Icon}
                  size={13}
                  strokeWidth={1.75}
                  className={cn(
                    entry.output &&
                      !entry.output.skipped &&
                      !entry.output.stopped
                      ? "text-emerald-600 dark:text-emerald-400"
                      : undefined,
                  )}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {index + 1}. {entry.question.question}
              </span>
              <span
                className={cn(
                  "max-w-[45%] shrink-0 truncate",
                  entry.output ? "text-foreground" : "text-muted-foreground/60",
                )}
              >
                {entry.output ? answerLabel(entry.output) : "waiting…"}
              </span>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

function ExportActions({ session }: { session: AskUserSession }) {
  const markdown = () =>
    sessionToMarkdown(session, { date: new Date().toISOString().slice(0, 10) });

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <Button
        size="icon-xs"
        variant="ghost"
        title="Copy the decision log as Markdown"
        aria-label="Copy the decision log as Markdown"
        onClick={() => {
          void navigator.clipboard
            .writeText(markdown())
            .then(() => toast.success("Decision log copied"))
            .catch(() => toast.error("Could not copy the decision log"));
        }}
      >
        <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.75} />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        title="Save the decision log as Markdown"
        aria-label="Save the decision log as Markdown"
        onClick={() => void saveSession(session, markdown())}
      >
        <HugeiconsIcon icon={Download01Icon} size={12} strokeWidth={1.75} />
      </Button>
    </span>
  );
}

/** Writes the log next to the project, under `.termco/grillings/`. */
async function saveSession(session: AskUserSession, body: string) {
  const root = useChatStore.getState().live.getWorkspaceRoot();
  if (!root) {
    toast.error("Open a folder first — there's nowhere to save the log.");
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const dir = `${root.replace(/\/+$/, "")}/.termco/grillings`;
  const path = `${dir}/${date}-${slug(session.topic ?? "session")}.md`;
  try {
    await native.createDir(dir);
    await native.writeFile(path, body);
    toast.success("Decision log saved", { description: path });
  } catch (e) {
    toast.error("Could not save the decision log", {
      description: e instanceof Error ? e.message : String(e),
    });
  }
}

export function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return cleaned || "session";
}

export const GrillingStrip = memo(GrillingStripImpl);
