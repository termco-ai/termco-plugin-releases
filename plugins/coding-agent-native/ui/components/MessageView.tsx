import ui from "@termco/ui";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UIMessage } from "ai";
import { useState } from "react";
import { useTranscriptPrefs } from "../lib/transcriptPrefs";

const { Button, Streamdown, cn } = ui;

type Part = Record<string, unknown> & { type: string };

export type MessageAction = {
  key: string;
  icon: typeof Copy01Icon;
  label: string;
  onClick(): void;
};

export function messagePlainText(message: UIMessage): string {
  return (message.parts as Part[])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n\n")
    .trim();
}

export function MessageActionBar({
  text,
  actions,
}: {
  text?: string;
  actions: readonly MessageAction[];
}) {
  const [copied, setCopied] = useState(false);
  if (!text && actions.length === 0) return null;
  return (
    <div className="mt-1 flex h-6 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
      {text ? (
        <button
          type="button"
          aria-label="Copy message"
          title="Copy message"
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={12} strokeWidth={2} />
        </button>
      ) : null}
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          aria-label={action.label}
          title={action.label}
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={action.onClick}
        >
          <HugeiconsIcon icon={action.icon} size={12} strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}

export function RenderedMessage({
  message,
  onApproval,
}: {
  message: UIMessage;
  onApproval(id: string, approved: boolean, always?: boolean): void;
  streaming?: boolean;
  allowRemember?: boolean;
}) {
  const showThinking = useTranscriptPrefs((state) => state.showThinking);
  const parts = message.parts as Part[];
  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-sm leading-relaxed",
        message.role === "user" && "ml-6 rounded-xl bg-muted/55 px-3 py-2",
      )}
    >
      {parts.map((part, index) => {
        const key = `${String(part.toolCallId ?? part.type)}:${index}`;
        if (part.type === "text") {
          return (
            <Streamdown key={key} className="select-text [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              {String(part.text ?? "")}
            </Streamdown>
          );
        }
        if (part.type === "reasoning") {
          if (!showThinking && part.state !== "streaming") return null;
          return (
            <details key={key} className="rounded-lg border border-border/50 bg-muted/25 px-2.5 py-2" open={part.state === "streaming"}>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Thinking</summary>
              <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{String(part.text ?? "")}</div>
            </details>
          );
        }
        if (part.type.startsWith("tool-")) {
          const approvalId = (part.approval as { id?: unknown } | undefined)?.id;
          const name = part.type.slice(5).replaceAll("_", " ");
          return (
            <div key={key} className="rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs">
              <div className="font-medium capitalize text-foreground">{name}</div>
              {part.input !== undefined ? (
                <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{formatValue(part.input)}</pre>
              ) : null}
              {part.errorText ? <div className="mt-1 text-destructive">{String(part.errorText)}</div> : null}
              {part.output !== undefined ? (
                <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{formatValue(part.output)}</pre>
              ) : null}
              {typeof approvalId === "string" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => onApproval(approvalId, true)}>Allow</Button>
                  <Button size="sm" variant="outline" onClick={() => onApproval(approvalId, true, true)}>Always allow</Button>
                  <Button size="sm" variant="ghost" onClick={() => onApproval(approvalId, false)}>Deny</Button>
                </div>
              ) : null}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
