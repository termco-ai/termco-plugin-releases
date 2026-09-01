/**
 * Pure readers over `ask_user` tool parts: the shape the card renders, the
 * answer it wrote back, and the session view the GrillingStrip derives.
 *
 * The transcript is the single source of truth for a questioning session —
 * there is no separate store. That keeps the card and the strip in sync by
 * construction and inherits message persistence for free.
 */

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { toolsService } from "../../runtime/toolContributions";
import type { AskUserOutput, AskUserQuestion } from "./types";

/** Tolerant of partial input: the part streams in before it is complete. */
export function readAskUserInput(
  toolName: string,
  input: unknown,
): AskUserQuestion {
  const parsed = toolsService.presentation(toolName)?.parseInput(input);
  return parsed && typeof parsed === "object"
    ? parsed as AskUserQuestion
    : { question: "", options: [] };
}

export function readAskUserOutput(toolName: string, part: {
  state?: string;
  output?: unknown;
}): AskUserOutput | null {
  if (part.state !== "output-available") return null;
  const parsed = toolsService.presentation(toolName)?.parseOutput?.(part.output);
  return parsed && typeof parsed === "object" ? parsed as AskUserOutput : null;
}

/** Short label for the answered row / the decision log. */
export function answerLabel(output: AskUserOutput): string {
  if (output.stopped) return "Ended";
  if (output.skipped) return "Skipped";
  if (output.selected?.length) return output.selected.join(", ");
  return output.answer;
}

export type AskUserEntry = {
  toolCallId: string;
  messageId: string;
  question: AskUserQuestion;
  output: AskUserOutput | null;
  /** Open = the model is waiting for this one right now. */
  open: boolean;
};

export type AskUserSession = {
  entries: AskUserEntry[];
  answered: number;
  /** Best-known total: answered + open + the model's estimate for what's left. */
  total: number;
  topic?: string;
  /** The session is over: the user ended it, or nothing is open any more. */
  openEntry: AskUserEntry | null;
};

/** Every question asked in this conversation, oldest first. */
export function collectAskUserEntries(
  messages: readonly UIMessage[],
): AskUserEntry[] {
  const out: AskUserEntry[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      const toolName = getToolName(part);
      if (toolsService.presentation(toolName)?.renderer !== "ask-user") continue;
      const state = part.state;
      // A question that never finished streaming isn't a decision yet.
      if (state === "input-streaming") continue;
      const output = readAskUserOutput(toolName, part);
      out.push({
        toolCallId: part.toolCallId,
        messageId: message.id,
        question: readAskUserInput(toolName, part.input),
        output,
        open: state === "input-available",
      });
    }
  }
  return out;
}

export function deriveAskUserSession(
  messages: readonly UIMessage[],
): AskUserSession {
  const entries = collectAskUserEntries(messages);
  const answered = entries.filter((e) => e.output).length;
  const openEntry = entries.find((e) => e.open) ?? null;
  const last = entries[entries.length - 1];
  // The model's estimate counts the questions still to come *after* the last
  // one it asked — so it applies whether or not that one is still open. Once
  // the user ends the session there is nothing left to come.
  const stopped = entries.some((e) => e.output?.stopped);
  const remaining = stopped ? 0 : (last?.question.estimatedRemaining ?? 0);
  return {
    entries,
    answered,
    total: answered + (openEntry ? 1 : 0) + remaining,
    topic: [...entries].reverse().find((e) => e.question.topic)?.question.topic,
    openEntry,
  };
}

/** The decision log as Markdown — what the export button writes. */
export function sessionToMarkdown(
  session: AskUserSession,
  opts: { date?: string } = {},
): string {
  const lines: string[] = [`# Grilling — ${session.topic ?? "Session"}`];
  if (opts.date) lines.push("", `_${opts.date}_`);
  lines.push("");
  session.entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.question.question}`);
    if (entry.question.context) lines.push("", entry.question.context);
    if (entry.question.options.length > 0) {
      lines.push("");
      for (const option of entry.question.options) {
        const chosen = entry.output?.selected?.includes(option.label);
        lines.push(
          `- ${chosen ? "**" : ""}${option.label}${chosen ? "**" : ""}` +
            `${option.recommended ? " _(recommended)_" : ""}` +
            `${option.description ? ` — ${option.description}` : ""}`,
        );
      }
    }
    lines.push(
      "",
      entry.output
        ? `**Decision:** ${entry.output.answer}`
        : "**Decision:** _open_",
      "",
    );
  });
  return lines.join("\n");
}
