import { Progress } from "@termco/ui";
import { ScrollArea } from "@termco/ui";
import { Spinner } from "@termco/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import { CheckmarkSquare02Icon, SquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Todo } from "../lib/todos";
import { useTodosStore } from "../store/todoStore";

type Props = { sessionId: string | null };

const EMPTY_TODOS: Todo[] = [];

export function TodoStrip({ sessionId }: Props) {
  const todos =
    useTodosStore((s) => (sessionId ? s.bySession[sessionId] : undefined)) ??
    EMPTY_TODOS;

  if (!sessionId || todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const pct = Math.round((completed / todos.length) * 100);

  return (
    <div className="flex flex-col min-h-0 shrink-0 border-t-2 border-border/40 bg-muted/80 px-3 py-1.5 max-h-[35%] shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.2)]">
      <div className="my-1.5 flex items-center gap-2 shrink-0">
        <span className="text-xs font-medium text-foreground">Todos</span>
        <Progress value={pct} className="h-1 flex-1" />
        <span className="text-xs tabular-nums font-mono text-muted-foreground">
          {completed}/{todos.length}
        </span>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <ul className="flex flex-col gap-0.5">
          {todos.map((t) => (
            <TodoRow key={t.id} todo={t} />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  const isInProgress = todo.status === "in_progress";
  const row = (
    <li
      className={cn(
        "flex items-start gap-2 rounded px-1.5 py-1 text-xs leading-snug",
        isInProgress && "border-l-2 border-foreground/50 bg-muted/40",
      )}
    >
      <span className="mt-[2px] inline-flex size-3.5 shrink-0 items-center justify-center">
        {isInProgress ? (
          <Spinner className="size-3" />
        ) : (
          <HugeiconsIcon
            icon={
              todo.status === "completed" ? CheckmarkSquare02Icon : SquareIcon
            }
            strokeWidth={1.75}
          />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1",
          todo.status === "completed"
            ? "text-muted-foreground/60 line-through"
            : isInProgress
              ? "text-foreground"
              : "text-muted-foreground",
        )}
      >
        {isInProgress && todo.activeForm ? todo.activeForm : todo.title}
      </span>
    </li>
  );

  if (!todo.description) return row;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs">
          {todo.description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
