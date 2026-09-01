/**
 * Renders a single transcript message. User messages surface the slash-command
 * pill and context chips; assistant/tool messages are split into part groups
 * (collapsed reads vs. singletons) and delegated to the part renderers.
 */

import { Message, MessageContent } from "../../ai-elements/message";
import { SparklesIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import { TERMCO_CMD_RE } from "../../lib/slashCommands";
import { AttachmentChip } from "../AttachmentChip";
import type { AskUserOutput } from "../AiAskUser";
import type { AskUiOutput } from "../AiRichUi";
import type { PluginBriefOutput } from "../PluginBrief";
import { CommandSnippet } from "./CommandSnippet";
import { ContextChips } from "./ContextChips";
import { stripUserContextBlocks } from "./contextBlocks";
import { type AnyPart, buildPartGroups, partType } from "./partGroups";
import { PartAppear, ReadGroup, ReadRow, RenderedPart } from "./toolParts";

export const RenderedMessage = memo(function RenderedMessage({
  message,
  onApproval,
  onAnswerQuestion,
  onRespondUi,
  onRespondBrief,
  streaming,
  allowRemember,
}: {
  message: UIMessage;
  onApproval: (id: string, approved: boolean, always?: boolean) => void;
  /** Absent on read-only surfaces (coding-agent runs have no `useChat`). */
  onAnswerQuestion?: (
    toolName: string,
    toolCallId: string,
    output: AskUserOutput,
  ) => void;
  onRespondUi?: (
    toolName: string,
    toolCallId: string,
    output: AskUiOutput,
  ) => void;
  onRespondBrief?: (
    toolName: string,
    toolCallId: string,
    output: PluginBriefOutput,
  ) => void;
  streaming: boolean;
  /** Show an "Always allow" action on approval cards (coding-agent runs). */
  allowRemember?: boolean;
}) {
  // Index of the trailing text part — only that one is "live" mid-stream.
  // Earlier text parts (separated by tool calls) are already finalized.
  let lastTextIdx = -1;
  for (let i = message.parts.length - 1; i >= 0; i -= 1) {
    if (message.parts[i]?.type === "text") {
      lastTextIdx = i;
      break;
    }
  }
  const groups = useMemo(
    () => buildPartGroups(message.parts as AnyPart[]),
    [message.parts],
  );

  if (message.role === "user") {
    const rawText = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");

    // Attached images (pasted/dropped files, grabbed page elements) — the
    // renderer used to drop these, so the user couldn't see what they sent.
    const images = message.parts.filter(
      (
        p,
      ): p is {
        type: "file";
        mediaType: string;
        url: string;
        filename?: string;
      } =>
        p.type === "file" &&
        typeof (p as { url?: unknown }).url === "string" &&
        typeof (p as { mediaType?: unknown }).mediaType === "string" &&
        (p as { mediaType: string }).mediaType.startsWith("image/"),
    );

    const cmdMatch = rawText.match(TERMCO_CMD_RE);
    const commandName = cmdMatch?.[1] ?? null;
    const withoutCmd = cmdMatch ? rawText.slice(cmdMatch[0].length) : rawText;
    const stripped = stripUserContextBlocks(withoutCmd);

    return (
      <Message from="user">
        <MessageContent>
          <div className="flex items-center gap-1.5 border-b border-border/60 pb-1.5 text-xs font-medium text-muted-foreground">
            <HugeiconsIcon icon={UserCircleIcon} size={12} strokeWidth={1.75} />
            <span>Your request</span>
          </div>
          {commandName ? <CommandSnippet name={commandName} /> : null}
          {stripped.chips.length > 0 ? (
            <ContextChips chips={stripped.chips} />
          ) : null}
          {images.length > 0 ? (
            <div className="mb-1 flex flex-col items-start gap-1">
              {images.map((p, i) => (
                // The whole chip is a button — click to expand the full image
                // inline in the transcript (same pill + chevron as tool cards).
                <AttachmentChip
                  key={`${message.id}-img-${i}`}
                  src={p.url}
                  name={p.filename}
                />
              ))}
            </div>
          ) : null}
          {stripped.text ? (
            <p className="whitespace-pre-wrap wrap-break-word">
              {stripped.text}
            </p>
          ) : null}
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="absolute left-0 grid size-3 place-items-center rounded-full bg-background text-primary ring-2 ring-background">
            <HugeiconsIcon icon={SparklesIcon} size={9} strokeWidth={2} />
          </span>
          <span>Termco</span>
          {streaming ? (
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            if (g.kind === "reads") {
              return (
                <PartAppear key={`${message.id}-${g.key}`}>
                  <ReadGroup parts={g.parts} />
                </PartAppear>
              );
            }
            const isReadSingle =
              partType(g.part) === "tool-read_file" &&
              ((g.part as { state?: string }).state ?? "") !==
                "approval-requested";
            if (isReadSingle) {
              return (
                <PartAppear key={`${message.id}-${g.key}`}>
                  <ReadRow part={g.part} />
                </PartAppear>
              );
            }
            return (
              <PartAppear key={`${message.id}-${g.key}`}>
                <RenderedPart
                  part={g.part}
                  onApproval={onApproval}
                  onAnswerQuestion={onAnswerQuestion}
                  onRespondUi={onRespondUi}
                  onRespondBrief={onRespondBrief}
                  streaming={streaming && g.idx === lastTextIdx}
                  allowRemember={allowRemember}
                />
              </PartAppear>
            );
          })}
        </div>
      </MessageContent>
    </Message>
  );
});
