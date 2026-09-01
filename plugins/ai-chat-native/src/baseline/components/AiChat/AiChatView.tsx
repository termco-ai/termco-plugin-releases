/**
 * The scrollable AI conversation transcript: renders each message, the live
 * "thinking" spinner, the context-compaction notice, the step-cap "Continue"
 * row, and inline errors. Reused by both the mini-window and the side panel.
 */

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../../ai-elements/conversation";
import { Spinner } from "@termco/ui";
import {
  ArrowReloadHorizontalIcon,
  ArrowTurnBackwardIcon,
  Delete02Icon,
  Edit02Icon,
  GitBranchIcon,
} from "@hugeicons/core-free-icons";
import {
  respondToOwnedApproval,
  respondToOwnedInteractiveTool,
} from "../../../chatRuntime";
import type { ChatStatus, UIMessage } from "ai";
import { memo, useCallback, useMemo, useState } from "react";
import { messageCreatedAt, messagePlainText } from "../../lib/messageText";
import {
  deleteMessage,
  editUserMessage,
  regenerateMessage,
  rewindTo,
  sendMessage,
} from "../../store/chatRuntime";
import {
  atHardCeiling,
  contextFillRatio,
  runCompaction,
} from "../../store/chatRuntime/compaction";
import { useChatStore } from "../../store/chatStore";
import type { AskUserOutput } from "../AiAskUser";
import type { AskUiOutput } from "../AiRichUi";
import type { PluginBriefOutput } from "../PluginBrief";
import { CompactionHeader } from "./CompactionHeader";
import { ContextCeilingNotice } from "./ContextCeilingNotice";
import { type MessageAction, MessageActionBar } from "./MessageActionBar";
import { RenderedMessage } from "./RenderedMessage";

type ApprovalArg = {
  id: string;
  approved: boolean;
  reason?: string;
};

type ToolOutputArg = {
  tool: string;
  toolCallId: string;
  output: unknown;
};

type Props = {
  messages: UIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  clearError: () => void;
  addToolApprovalResponse: (arg: ApprovalArg) => void | PromiseLike<void>;
  /** Writes a client-side tool's result back (question cards). */
  addToolOutput?: (arg: ToolOutputArg) => void | PromiseLike<void>;
  stop: () => void | PromiseLike<void>;
};

export function AiChatView({
  messages,
  status,
  error,
  clearError,
  addToolApprovalResponse,
  addToolOutput,
}: Props) {
  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const showSpinner = isBusy && lastMessage?.role === "user";
  const streamingMessageId =
    status === "streaming" && lastMessage?.role === "assistant"
      ? lastMessage.id
      : null;
  const step = useChatStore((s) => s.agentMeta.step);
  const hitStepCap = useChatStore((s) => s.agentMeta.hitStepCap);
  const compactionNotice = useChatStore((s) => s.agentMeta.compactionNotice);
  const compacting = useChatStore((s) => s.agentMeta.compacting);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const session = useChatStore((s) =>
    s.sessions.find((x) => x.id === s.activeSessionId),
  );
  const newSession = useChatStore((s) => s.newSession);
  // Only after the user turned an automatic compaction down — before that the
  // automation handles it and a warning would be noise.
  const showCeiling =
    !!session?.compactionPolicy?.declined &&
    !!activeSessionId &&
    atHardCeiling(activeSessionId);
  const patchAgentMeta = useChatStore((s) => s.patchAgentMeta);
  const branchFrom = useChatStore((s) => s.branchFrom);
  const showContinue =
    !isBusy && hitStepCap && lastMessage?.role === "assistant";
  // Inline user-message editing.
  const [editingId, setEditingId] = useState<string | null>(null);

  const onApproval = useCallback(
    (id: string, approved: boolean) => {
      if (!activeSessionId) return;
      void respondToOwnedApproval({
        sessionId: activeSessionId,
        approvalId: id,
        approved,
      }, () => addToolApprovalResponse({ id, approved })).catch((cause) => {
        patchAgentMeta({
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });
    },
    [activeSessionId, addToolApprovalResponse, patchAgentMeta],
  );

  const respondToInteractiveTool = useCallback(
    (toolName: string, toolCallId: string, output: unknown) => {
      if (!activeSessionId || !addToolOutput) return;
      void respondToOwnedInteractiveTool({
        sessionId: activeSessionId,
        toolName,
        toolCallId,
        output,
      }, () => addToolOutput({ tool: toolName, toolCallId, output })).catch((cause) => {
        patchAgentMeta({
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });
    },
    [activeSessionId, addToolOutput, patchAgentMeta],
  );

  // Answering a question first commits its canonical tool result; only then
  // may the AI SDK publish it and automatically resume the suspended turn.
  const onAnswerQuestion = useMemo(
    () =>
      addToolOutput
        ? (toolName: string, toolCallId: string, output: AskUserOutput) =>
            respondToInteractiveTool(toolName, toolCallId, output)
        : undefined,
    [addToolOutput, respondToInteractiveTool],
  );

  // Same path for an interactive rich view (`ask_ui`).
  const onRespondUi = useMemo(
    () =>
      addToolOutput
        ? (toolName: string, toolCallId: string, output: AskUiOutput) =>
            respondToInteractiveTool(toolName, toolCallId, output)
        : undefined,
    [addToolOutput, respondToInteractiveTool],
  );

  const onRespondBrief = useMemo(
    () =>
      addToolOutput
        ? (toolName: string, toolCallId: string, output: PluginBriefOutput) =>
            respondToInteractiveTool(toolName, toolCallId, output)
        : undefined,
    [addToolOutput, respondToInteractiveTool],
  );

  // A compacted chat has no messages of its own but is not empty: its summary
  // card stands in for everything that came before and must show immediately,
  // not only once the user has typed something.
  if (messages.length === 0 && !session?.compaction) {
    return (
      <Conversation>
        <ConversationContent>
          <ConversationEmptyState
            title="Ask Termco anything"
            description="Explain command output, fix errors, generate snippets, or run a task."
          />
        </ConversationContent>
      </Conversation>
    );
  }

  return (
    <Conversation>
      <ConversationContent className="gap-6 px-4 py-5">
        {session?.compaction && (
          <CompactionHeader compaction={session.compaction} />
        )}
        {messages.map((m) => (
          <ChatMessageRow
            key={m.id}
            message={m}
            streaming={m.id === streamingMessageId}
            busy={isBusy}
            onApproval={onApproval}
            onAnswerQuestion={onAnswerQuestion}
            onRespondUi={onRespondUi}
            onRespondBrief={onRespondBrief}
            editing={editingId === m.id}
            onStartEdit={() => setEditingId(m.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(text) => {
              setEditingId(null);
              void editUserMessage(m.id, text);
            }}
            onBranch={() => branchFrom(m.id)}
          />
        ))}
        {compactionNotice && (
          <CompactionNotice
            droppedCount={compactionNotice.droppedCount}
            tier={compactionNotice.tier}
            onDismiss={() => patchAgentMeta({ compactionNotice: null })}
          />
        )}
        {compacting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            <span className="flex-1 truncate">
              Summarising the conversation…
            </span>
          </div>
        )}
        {showCeiling && activeSessionId && (
          <ContextCeilingNotice
            percent={Math.round(contextFillRatio(activeSessionId) * 100)}
            onCompact={() =>
              void runCompaction({
                sessionId: activeSessionId,
                mode: "manual",
              })
            }
            onNewChat={() => newSession()}
          />
        )}
        {showSpinner && !compacting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            <span className="truncate">{step ?? "Thinking…"}</span>
          </div>
        )}
        {showContinue && (
          <ContinueRow
            onContinue={() => {
              patchAgentMeta({ hitStepCap: false });
              void sendMessage(
                "Continue from where you stopped. Don't recap — just keep going.",
              );
            }}
          />
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="font-medium">Something went wrong.</div>
            <div className="mt-0.5 leading-relaxed opacity-90">
              {error.message}
            </div>
            <button
              type="button"
              onClick={clearError}
              className="mt-1 underline opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

/** One transcript message + its hover action bar (copy / edit / regenerate /
 * branch / rewind / delete), or an inline editor when the user is editing it. */
const ChatMessageRow = memo(function ChatMessageRow({
  message,
  streaming,
  busy,
  onApproval,
  onAnswerQuestion,
  onRespondUi,
  onRespondBrief,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onBranch,
}: {
  message: UIMessage;
  streaming: boolean;
  busy: boolean;
  onApproval: (id: string, approved: boolean) => void;
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
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onBranch: () => void;
}) {
  const text = messagePlainText(message);
  const isUser = message.role === "user";

  if (editing) {
    return (
      <EditBox initial={text} onSave={onSaveEdit} onCancel={onCancelEdit} />
    );
  }

  // Mutating actions are hidden mid-stream to avoid racing the live turn.
  const actions: MessageAction[] = [];
  if (!busy) {
    if (isUser && text) {
      actions.push({
        key: "edit",
        icon: Edit02Icon,
        label: "Edit & resend",
        onClick: onStartEdit,
      });
    }
    if (!isUser) {
      actions.push({
        key: "regen",
        icon: ArrowReloadHorizontalIcon,
        label: "Regenerate",
        onClick: () => void regenerateMessage(message.id),
      });
    }
    actions.push({
      key: "branch",
      icon: GitBranchIcon,
      label: "Branch from here",
      onClick: onBranch,
    });
    actions.push({
      key: "rewind",
      icon: ArrowTurnBackwardIcon,
      label: "Rewind to here (drop later messages)",
      onClick: () => rewindTo(message.id),
      danger: true,
      confirm: {
        title: "Rewind this conversation?",
        description:
          "Messages after this point will be removed from the current conversation.",
        actionLabel: "Rewind",
      },
    });
    actions.push({
      key: "delete",
      icon: Delete02Icon,
      label: "Delete message",
      danger: true,
      onClick: () => deleteMessage(message.id),
      confirm: {
        title: "Delete this message?",
        description:
          "This message will be removed from the current conversation.",
        actionLabel: "Delete message",
      },
    });
  }

  return (
    <div className="group/msg relative">
      <MessageActionBar
        text={text || undefined}
        timestamp={messageCreatedAt(message)}
        actions={actions}
        align={isUser ? "end" : "start"}
      />
      <RenderedMessage
        message={message}
        onApproval={onApproval}
        onAnswerQuestion={onAnswerQuestion}
        onRespondUi={onRespondUi}
        onRespondBrief={onRespondBrief}
        streaming={streaming}
      />
    </div>
  );
});

/** Inline editor for a user message (Enter saves, Esc cancels). */
function EditBox({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="rounded-lg border border-primary/30 bg-background p-3 shadow-[var(--shadow-control)]">
      <textarea
        // biome-ignore lint/a11y/noAutofocus: focus the editor the user just opened
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSave(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={Math.min(8, Math.max(2, value.split("\n").length))}
        className="w-full resize-none bg-transparent text-sm text-foreground focus-visible:outline-none"
      />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => value.trim() && onSave(value)}
          disabled={!value.trim()}
          className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Save & resend
        </button>
      </div>
    </div>
  );
}

/** Says what actually happened. The rungs of the ladder are very different
 * events, and calling them all "tool results elided" was a lie — one of them
 * loses nothing at all. */
function compactionText(
  tier: "summary" | "persisted" | "elided" | "clamped",
  n: number,
): string {
  const msg = `message${n === 1 ? "" : "s"}`;
  const results = `tool result${n === 1 ? "" : "s"}`;
  switch (tier) {
    case "summary":
      return `Context compacted — the first ${n} ${msg} were replaced by a summary.`;
    case "clamped":
      return `Context trimmed — the ${n} oldest ${msg} no longer fit and were dropped.`;
    case "persisted":
      // Worth distinguishing: nothing was lost here, unlike every other rung.
      return `Context freed — ${n} older ${results} moved out of the conversation; the agent can still read them back.`;
    default:
      return `Context compacted — ${n} older ${results} elided to save tokens.`;
  }
}

const CompactionNotice = memo(function CompactionNotice({
  droppedCount,
  tier,
  onDismiss,
}: {
  droppedCount: number;
  tier: "summary" | "persisted" | "elided" | "clamped";
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500/80" />
      <span className="flex-1 truncate">
        {compactionText(tier, droppedCount)}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs underline opacity-70 hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  );
});

const ContinueRow = memo(function ContinueRow({
  onContinue,
}: {
  onContinue: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs">
      <span className="flex-1 text-muted-foreground">
        Hit the step limit. Continue to keep going.
      </span>
      <button
        type="button"
        onClick={onContinue}
        className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        Continue
      </button>
    </div>
  );
});
