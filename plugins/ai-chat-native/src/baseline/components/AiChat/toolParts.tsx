/**
 * Renderers for the non-user message parts: text, reasoning, tool calls, and
 * the collapsed multi-file "read" group. Approval-requested tool parts are
 * routed to {@link AiToolApproval}.
 */

import { MessageResponse } from "../../ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../ai-elements/reasoning";
import { Tool } from "../../ai-elements/tool";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import { ArrowRight01Icon, File01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { memo, useCallback, useMemo, useRef } from "react";
import { LIVE_VIEW_PART } from "../../lib/agent/uiMessage";
import { toolsService } from "../../runtime/toolContributions";
import { useTranscriptPrefs } from "../../lib/transcriptPrefs";
import { AskUserCard, type AskUserOutput } from "../AiAskUser";
import { LiveViewCard, RichUiCard, type AskUiOutput } from "../AiRichUi";
import { PluginBriefCard, type PluginBriefOutput } from "../PluginBrief";
import { AiToolApproval } from "../AiToolApproval";
import { PluginCompletionCard } from "../PluginCompletion";
import { type AnyPart, basename, readPathFromPart } from "./partGroups";
import { markToolPresentationMounted } from "../../../toolPresentation";

type AnyToolPart = ToolUIPart | DynamicToolUIPart;

function ToolPresentationBoundary({
  toolCallId,
  children,
}: {
  toolCallId: string;
  children: React.ReactNode;
}) {
  const dispose = useRef<() => void>(() => {});
  const bind = useCallback((element: HTMLDivElement | null) => {
    dispose.current();
    dispose.current = element
      ? markToolPresentationMounted(toolCallId, element)
      : () => {};
  }, [toolCallId]);
  return (
    <div ref={bind} data-tool-presentation={toolCallId} className="contents">
      {children}
    </div>
  );
}

export const ReadGroup = memo(function ReadGroup({
  parts,
}: {
  parts: AnyPart[];
}) {
  const paths = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      const path = readPathFromPart(p);
      if (!path) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
    return out;
  }, [parts]);
  const count = paths.length || parts.length;
  const preview = paths.map(basename).join(", ");

  return (
    <Collapsible className="group/read overflow-hidden rounded-md border border-border/50 bg-card/50">
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs",
          "transition-colors hover:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={11}
          strokeWidth={2}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            "group-data-[state=open]/read:rotate-90",
          )}
        />
        <HugeiconsIcon
          icon={File01Icon}
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
        />
        <span className="shrink-0 font-medium text-foreground">Read</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {count} file{count === 1 ? "" : "s"}
        </span>
        {paths.length > 0 ? (
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground/80 group-data-[state=open]/read:invisible">
            · {preview}
          </span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="termco-collapsible-content border-t border-border/30">
        <ul className="flex flex-col gap-0.5 px-2 py-1.5">
          {paths.map((path) => (
            <li
              key={path}
              className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
            >
              <HugeiconsIcon
                icon={File01Icon}
                size={10}
                strokeWidth={1.75}
                className="shrink-0 opacity-60"
              />
              <span className="truncate text-foreground">{basename(path)}</span>
              <span className="truncate opacity-60">{path}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
});

export const PartAppear = memo(function PartAppear({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out">
      {children}
    </div>
  );
});

export const ReadRow = memo(function ReadRow({ part }: { part: AnyPart }) {
  const path = readPathFromPart(part);
  const state = (part as { state?: string }).state ?? "";
  const isError = state === "output-error";
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isError
            ? "bg-destructive"
            : "border border-muted-foreground/40 bg-transparent",
        )}
      />
      <HugeiconsIcon
        icon={File01Icon}
        size={13}
        strokeWidth={1.75}
        className="shrink-0 text-muted-foreground"
      />
      <span className="shrink-0 font-medium text-foreground">Read</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {path ?? ""}
      </span>
    </div>
  );
});

export const RenderedPart = memo(function RenderedPart({
  part,
  onApproval,
  onAnswerQuestion,
  onRespondUi,
  onRespondBrief,
  streaming,
  allowRemember,
}: {
  part: AnyPart;
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
  allowRemember?: boolean;
}) {
  const showThinking = useTranscriptPrefs((s) => s.showThinking);
  if (part.type === "text") {
    return (
      <MessageResponse streaming={streaming}>
        {(part as unknown as { text: string }).text}
      </MessageResponse>
    );
  }

  if (part.type === "reasoning") {
    const r = part as unknown as { text: string; state?: string };
    // "Show thinking" toggle (transcript pref): hide reasoning unless enabled,
    // but never hide the block that's actively streaming (it'd flicker away).
    if (!showThinking && r.state !== "streaming") return null;
    return (
      <Reasoning isStreaming={r.state === "streaming"}>
        <ReasoningTrigger />
        <ReasoningContent>{r.text}</ReasoningContent>
      </Reasoning>
    );
  }

  // A live view pushed by a still-running tool. Unlike a tool part this one is
  // rewritten in place as the work progresses through the session data channel.
  if (part.type === LIVE_VIEW_PART) {
    return <LiveViewCard part={part} />;
  }

  if (
    part.type === "dynamic-tool" ||
    (typeof part.type === "string" && part.type.startsWith("tool-"))
  ) {
    return (
      <ToolPresentationBoundary
        toolCallId={String((part as { toolCallId?: unknown }).toolCallId ?? "")}
      >
        <RenderedTool
          part={part as unknown as AnyToolPart}
          onApproval={onApproval}
          onAnswerQuestion={onAnswerQuestion}
          onRespondUi={onRespondUi}
          onRespondBrief={onRespondBrief}
          allowRemember={allowRemember}
        />
      </ToolPresentationBoundary>
    );
  }

  return null;
});

const RenderedTool = memo(function RenderedTool({
  part,
  onApproval,
  onAnswerQuestion,
  onRespondUi,
  onRespondBrief,
  allowRemember,
}: {
  part: AnyToolPart;
  onApproval: (id: string, approved: boolean, always?: boolean) => void;
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
  allowRemember?: boolean;
}) {
  const toolName =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.replace(/^tool-/, "");
  const presentation = toolsService.presentation(toolName);

  // The question card owns every state of its selected tool — it never falls through
  // to the generic tool row, not even while its input streams in.
  if (presentation?.renderer === "ask-user") {
    return (
      <AskUserCard
        part={part}
        onAnswer={
          onAnswerQuestion
            ? (toolCallId, output) =>
                onAnswerQuestion(toolName, toolCallId, output)
            : undefined
        }
      />
    );
  }

  if (presentation?.renderer === "plugin-brief") {
    return (
      <PluginBriefCard
        part={part}
        onRespond={
          onRespondBrief
            ? (toolCallId, output) =>
                onRespondBrief(toolName, toolCallId, output)
            : undefined
        }
      />
    );
  }

  // Same rule for the rich views: the card owns every state, including the
  // half-streamed one, so a partial ViewSpec never reaches the generic row.
  if (presentation?.renderer === "structured-ui") {
    return (
      <RichUiCard
        part={part}
        interactive={presentation.interactive}
        onRespond={
          onRespondUi
            ? (toolCallId, output) =>
                onRespondUi(toolName, toolCallId, output)
            : undefined
        }
      />
    );
  }

  if (
    presentation?.renderer === "plugin-completion" &&
    part.state === "output-available" &&
    presentation.parseOutput?.("output" in part ? part.output : undefined)
  ) {
    return <PluginCompletionCard part={part} presentation={presentation} />;
  }

  if (part.state === "approval-requested") {
    return (
      <AiToolApproval
        part={part as Extract<ToolUIPart, { state: "approval-requested" }>}
        toolName={toolName}
        allowRemember={allowRemember}
        onRespond={(approved, always) =>
          onApproval(part.approval.id, approved, always)
        }
      />
    );
  }

  return (
    <Tool
      toolName={toolName}
      state={part.state}
      input={part.input}
      output={"output" in part ? part.output : undefined}
      errorText={"errorText" in part ? part.errorText : undefined}
      defaultOpen={toolName === "list_directory"}
    />
  );
});
