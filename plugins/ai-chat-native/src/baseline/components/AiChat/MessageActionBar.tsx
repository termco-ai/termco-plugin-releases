/**
 * A hover-revealed per-message action bar shared by the normal chat and the
 * coding-agents transcript: a copy button (when the message has text), any
 * caller-supplied actions (edit / regenerate / branch / rewind / delete), and an
 * optional timestamp. It sits in the transcript margin rather than floating
 * over message content.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { shortTime } from "../../lib/messageText";

export type MessageAction = {
  key: string;
  icon: typeof Copy01Icon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  confirm?: {
    title: string;
    description: string;
    actionLabel: string;
  };
};

export function MessageActionBar({
  text,
  timestamp,
  actions = [],
  align = "end",
}: {
  text?: string;
  timestamp?: number;
  actions?: MessageAction[];
  align?: "start" | "end";
}) {
  const time = shortTime(timestamp);
  if (!text && actions.length === 0 && !time) return null;
  return (
    <div
      className={cn(
        "mt-1 flex h-6 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100",
        align === "end" ? "justify-end" : "justify-start pl-5",
      )}
    >
      {time && (
        <span className="px-1 text-xs tabular-nums text-muted-foreground/70">
          {time}
        </span>
      )}
      {text ? <CopyButton text={text} /> : null}
      {actions.map((a) => (
        <ActionButton key={a.key} action={a} />
      ))}
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconBtn
      title="Copy message"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <HugeiconsIcon
        icon={copied ? Tick02Icon : Copy01Icon}
        size={12}
        strokeWidth={2}
        className={copied ? "text-emerald-500" : undefined}
      />
    </IconBtn>
  );
}

function ActionButton({ action }: { action: MessageAction }) {
  if (action.confirm) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            title={action.label}
            aria-label={action.label}
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
          >
            <HugeiconsIcon icon={action.icon} size={12} strokeWidth={2} />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action.confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {action.confirm.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={action.onClick}>
              {action.confirm.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  return (
    <IconBtn
      title={action.label}
      onClick={action.onClick}
      danger={action.danger}
    >
      <HugeiconsIcon icon={action.icon} size={12} strokeWidth={2} />
    </IconBtn>
  );
}
