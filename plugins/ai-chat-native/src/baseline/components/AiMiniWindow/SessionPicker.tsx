/** Conversation switcher with history metadata and a dedicated new-chat action. */

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import {
  Add01Icon,
  ArrowDown01Icon,
  Chat01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import type { SessionMeta } from "../../../sessions";
import { useChatStore } from "../../store/chatStore";

export function SessionPicker({ className }: { className?: string }) {
  const sessions = useChatStore((state) => state.sessions);
  const activeId = useChatStore((state) => state.activeSessionId);
  const currentRigId = useChatStore((state) => state.currentRigId);
  const switchSession = useChatStore((state) => state.switchSession);
  const newSession = useChatStore((state) => state.newSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const [open, setOpen] = useState(false);

  const active = sessions.find((session) => session.id === activeId) ?? null;
  if (!active) return null;

  const sorted = sessions
    .filter((session) => session.rigId === currentRigId)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
          title="Switch conversation"
        >
          <HugeiconsIcon
            icon={Chat01Icon}
            size={12}
            strokeWidth={1.7}
            className="shrink-0"
          />
          <span className="truncate font-medium text-foreground">
            {active.title || "New chat"}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="shrink-0 opacity-65"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={7}
        className="w-80 gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3.5 py-3">
          <div>
            <p className="text-xs font-semibold text-foreground">
              Conversations
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sorted.length} in this workspace
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              newSession();
              setOpen(false);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground shadow-[var(--shadow-control)] transition-colors hover:bg-accent"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.8} />
            New chat
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {sorted.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              active={session.id === activeId}
              onSelect={() => {
                switchSession(session.id);
                setOpen(false);
              }}
              onDelete={() => {
                void Promise.resolve(deleteSession(session.id)).catch((error) => {
                  toast.error("Conversation was not deleted", {
                    description: error instanceof Error
                      ? error.message
                      : "The session is still referenced by another conversation.",
                  });
                });
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: SessionMeta;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 outline-none transition-colors",
        active
          ? "border-primary/25 bg-[var(--signal-soft)]"
          : "border-transparent hover:border-border hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          active ? "bg-primary" : "bg-border",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">
          {session.title || "New chat"}
        </span>
        <span className="block text-xs text-muted-foreground">
          {relativeTime(session.updatedAt)}
          {active ? " · current" : ""}
        </span>
      </span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            title="Delete session"
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          >
            <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              “{session.title || "New chat"}” and its messages will be removed
              from this workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep conversation</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}
