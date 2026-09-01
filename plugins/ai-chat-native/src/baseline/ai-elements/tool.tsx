"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import {
  ArrowRight01Icon,
  CheckListIcon,
  Edit02Icon,
  EyeIcon,
  File01Icon,
  FileEditIcon,
  FilePlusIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  GlobalSearchIcon,
  RobotIcon,
  SparklesIcon,
  TerminalIcon,
  ToolsIcon,
} from "@hugeicons/core-free-icons";
import { useChatStore } from "../store/chatStore";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement, memo, useState } from "react";
import { ToolDiff, diffCounts, diffFromInput } from "./tool-diff";


export type ToolPart = ToolUIPart | DynamicToolUIPart;

const TOOL_META: Record<string, { label: string; icon: typeof File01Icon }> = {
  read_file: { label: "Read", icon: File01Icon },
  list_directory: { label: "List", icon: FolderOpenIcon },
  write_file: { label: "Write", icon: FilePlusIcon },
  create_directory: { label: "Create dir", icon: FolderAddIcon },
  edit: { label: "Edit", icon: FileEditIcon },
  multi_edit: { label: "Edit", icon: Edit02Icon },
  bash_run: { label: "Run", icon: TerminalIcon },
  bash_background: { label: "Spawn", icon: TerminalIcon },
  bash_logs: { label: "Logs", icon: TerminalIcon },
  bash_list: { label: "Jobs", icon: TerminalIcon },
  bash_kill: { label: "Kill", icon: TerminalIcon },
  grep: { label: "Search", icon: GlobalSearchIcon },
  glob: { label: "Glob", icon: Folder01Icon },
  suggest_command: { label: "Suggest", icon: SparklesIcon },
  open_preview: { label: "Preview", icon: EyeIcon },
  run_subagent: { label: "Subagent", icon: RobotIcon },
  todo_write: { label: "Todos", icon: CheckListIcon },
  read_transcript: { label: "Earlier conversation", icon: File01Icon },
  browser_navigate: { label: "Browse", icon: GlobalSearchIcon },
  browser_read_page: { label: "Read page", icon: GlobalSearchIcon },
  browser_screenshot: { label: "Screenshot", icon: EyeIcon },
  browser_click: { label: "Click", icon: GlobalSearchIcon },
  browser_type: { label: "Type", icon: GlobalSearchIcon },
  browser_evaluate: { label: "Evaluate", icon: TerminalIcon },
  browser_console: { label: "Console", icon: TerminalIcon },
  browser_network: { label: "Network", icon: GlobalSearchIcon },
  // Coding-agent tool names use the same card so
  // an agent run reads like the in-app chat. Data shapes differ from Termco's
  // own tools, so summary/body handling is keyed on these names below.
  Read: { label: "Read", icon: File01Icon },
  Write: { label: "Write", icon: FilePlusIcon },
  Edit: { label: "Edit", icon: FileEditIcon },
  MultiEdit: { label: "Edit", icon: Edit02Icon },
  Bash: { label: "Bash", icon: TerminalIcon },
  Grep: { label: "Search", icon: GlobalSearchIcon },
  Glob: { label: "Glob", icon: Folder01Icon },
  TodoWrite: { label: "Todos", icon: CheckListIcon },
  Task: { label: "Subagent", icon: RobotIcon },
  ExitPlanMode: { label: "Plan", icon: CheckListIcon },
  WebFetch: { label: "Fetch", icon: GlobalSearchIcon },
  WebSearch: { label: "Search", icon: GlobalSearchIcon },
  shell: { label: "Shell", icon: TerminalIcon },
  apply_patch: { label: "Patch", icon: FileEditIcon },
};

/** Which specialized agent-tool body a tool renders, or null for the generic
 * card. Keyed on backend tool names. */
function agentRenderKind(
  toolName: string,
): "diff" | "bash" | "todo" | "plan" | null {
  switch (toolName) {
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "apply_patch":
      return "diff";
    case "Bash":
    case "shell":
      return "bash";
    case "TodoWrite":
      return "todo";
    case "ExitPlanMode":
      return "plan";
    default:
      return null;
  }
}

const STATUS_DOT: Record<ToolPart["state"], string> = {
  "approval-requested": "bg-amber-500",
  "approval-responded": "bg-sky-500",
  "input-streaming": "bg-muted-foreground/40",
  "input-available": "bg-amber-500",
  "output-available": "bg-transparent border border-muted-foreground/40",
  "output-denied": "bg-orange-500",
  "output-error": "bg-destructive",
};

const STATUS_LABEL: Record<ToolPart["state"], string> = {
  "approval-requested": "awaiting approval",
  "approval-responded": "responded",
  "input-streaming": "preparing",
  "input-available": "running",
  "output-available": "done",
  "output-denied": "denied",
  "output-error": "error",
};

function deriveSummary(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const i = input as Record<string, unknown>;
  const str = (k: string) =>
    typeof i[k] === "string" ? (i[k] as string) : null;

  switch (toolName) {
    case "read_file":
    case "write_file":
    case "edit":
    case "multi_edit":
    case "create_directory":
    case "list_directory":
      return str("path");
    case "bash_run":
    case "bash_background":
      return str("command");
    case "bash_logs":
    case "bash_kill":
      return str("id");
    case "grep":
      return str("pattern") ?? str("query");
    case "glob":
      return str("pattern");
    case "suggest_command":
      return str("intent") ?? str("description");
    case "open_preview":
      return str("path") ?? str("url");
    case "run_subagent":
      return str("agent") ?? str("task");
    case "browser_navigate":
      return str("url");
    case "browser_screenshot":
      return i.fullPage === true ? "full page" : (str("ref") ?? "viewport");
    case "browser_click":
    case "browser_type":
      return str("ref");
    case "browser_evaluate":
      return str("expression");
    case "todo_write": {
      const items = Array.isArray(i.todos) ? i.todos : null;
      return items
        ? `${items.length} item${items.length === 1 ? "" : "s"}`
        : null;
    }
    // Coding-agent tool input shapes.
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
      return str("file_path") ?? str("path");
    case "Bash":
    case "shell":
      return str("command");
    case "apply_patch":
      return str("file_path") ?? str("path");
    case "Grep":
      return str("pattern") ?? str("query");
    case "Glob":
      return str("pattern");
    case "Task":
      return str("description") ?? str("subagent_type") ?? str("prompt");
    case "WebFetch":
      return str("url");
    case "WebSearch":
      return str("query");
    case "TodoWrite": {
      const items = Array.isArray(i.todos) ? i.todos : null;
      return items
        ? `${items.length} item${items.length === 1 ? "" : "s"}`
        : null;
    }
    default:
      return null;
  }
}

/** Todo list from a `TodoWrite` input. */
function AgentTodoBody({ input }: { input: unknown }) {
  if (!input || typeof input !== "object") return null;
  const todos = (input as { todos?: unknown }).todos;
  if (!Array.isArray(todos) || todos.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {todos.map((raw, idx) => {
        const t = (raw ?? {}) as Record<string, unknown>;
        const content =
          typeof t.content === "string"
            ? t.content
            : typeof t.activeForm === "string"
              ? (t.activeForm as string)
              : "";
        const status = typeof t.status === "string" ? t.status : "pending";
        const mark =
          status === "completed" ? "✓" : status === "in_progress" ? "▸" : "○";
        return (
          <li
            key={idx}
            className={cn(
              "flex items-start gap-1.5 text-xs",
              status === "completed" && "text-muted-foreground line-through",
              status === "in_progress" && "text-foreground",
              status === "pending" && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "shrink-0",
                status === "completed" &&
                  "text-emerald-600 dark:text-emerald-400",
                status === "in_progress" && "text-primary",
              )}
            >
              {mark}
            </span>
            <span className="min-w-0 flex-1">{content}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Bash / shell command row and output. Output is a plain string;
 * auto-expansion on error is
 * handled by the outer card. */
function AgentBashBody({
  input,
  output,
  errorText,
}: {
  input: unknown;
  output: unknown;
  errorText?: string;
}) {
  const i = (input ?? {}) as Record<string, unknown>;
  const command = typeof i.command === "string" ? i.command : "";
  const outStr =
    typeof output === "string"
      ? output
      : output != null
        ? JSON.stringify(output, null, 2)
        : "";
  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-background/50">
      {command ? (
        <div className="flex gap-2 px-2.5 py-1.5">
          <span className="select-none font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            $
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs text-foreground">
            {command}
          </span>
        </div>
      ) : null}
      {errorText ? (
        <pre className="max-h-72 overflow-auto border-t border-border/50 bg-destructive/5 px-2.5 py-2 font-mono text-xs leading-relaxed text-destructive whitespace-pre-wrap">
          {errorText}
        </pre>
      ) : outStr ? (
        <pre className="max-h-72 overflow-auto border-t border-border/50 px-2.5 py-2 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {outStr}
        </pre>
      ) : null}
    </div>
  );
}

/** Plan markdown from an `ExitPlanMode` tool (non-approval render; the
 * Build/Revise approval flow is handled by AiToolApproval when the part is in
 * `approval-requested` state). */
function AgentPlanBody({ input }: { input: unknown }) {
  const i = (input ?? {}) as Record<string, unknown>;
  const plan = typeof i.plan === "string" ? i.plan : "";
  if (!plan) return null;
  return (
    <div className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs leading-relaxed text-foreground">
      {plan}
    </div>
  );
}

export type ToolProps = ComponentProps<typeof Collapsible> & {
  toolName: string;
  state: ToolPart["state"];
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

// Tools whose `input` carries large/streaming content (file bodies, sub-
// agent prompts, todo lists). The AI diff tab is the canonical place to
// view file changes; for the rest, the header summary + final output is
// enough. Re-rendering streamed input on every token both stalls the UI
// and duplicates information.
const HEAVY_CONTENT_TOOLS = new Set([
  "write_file",
  "edit",
  "multi_edit",
  "run_subagent",
  "todo_write",
]);

const ToolImpl = ({
  className,
  toolName,
  state,
  input,
  output,
  errorText,
  defaultOpen,
  ...props
}: ToolProps) => {
  const meta = TOOL_META[toolName];
  const Icon = meta?.icon ?? ToolsIcon;
  const label = meta?.label ?? toolName;
  const summary = deriveSummary(toolName, input);
  const isError = state === "output-error";
  const isHeavy = HEAVY_CONTENT_TOOLS.has(toolName);

  // Coding-agent tools get a specialized body: a real
  // diff, a bash panel, a todo checklist, or the plan text. These take
  // precedence over the generic input/output rendering.
  const agentKind = agentRenderKind(toolName);
  let agentBody: ReactNode = null;
  if (agentKind === "diff") {
    agentBody = diffFromInput(toolName, input) ? (
      <ToolDiff toolName={toolName} input={input} />
    ) : null;
  } else if (agentKind === "bash") {
    const cmd =
      input && typeof input === "object"
        ? (input as { command?: unknown }).command
        : undefined;
    agentBody =
      cmd || output !== undefined || errorText ? (
        <AgentBashBody input={input} output={output} errorText={errorText} />
      ) : null;
  } else if (agentKind === "todo") {
    agentBody = <AgentTodoBody input={input} />;
  } else if (agentKind === "plan") {
    agentBody = <AgentPlanBody input={input} />;
  }

  // A compact count pill at the row end: +added/-removed for diffs, item count
  // for todos.
  let countPill: string | null = null;
  if (agentKind === "diff") {
    const d = diffFromInput(toolName, input);
    if (d) {
      const { added, removed } = diffCounts(d.lines);
      const parts: string[] = [];
      if (added) parts.push(`+${added}`);
      if (removed) parts.push(`-${removed}`);
      countPill = parts.join(" ") || null;
    }
  } else if (agentKind === "todo") {
    const todos =
      input && typeof input === "object"
        ? (input as { todos?: unknown }).todos
        : undefined;
    if (Array.isArray(todos) && todos.length)
      countPill = `${todos.length} item${todos.length === 1 ? "" : "s"}`;
  }

  // For heavy tools, only show details on error — never the streamed input
  // body, which is huge and re-renders per token.
  const showInputBody = !agentKind && !isHeavy && Boolean(input);
  const showOutputBody = !agentKind && !isHeavy && output !== undefined;
  const hasDetails = agentKind
    ? Boolean(agentBody)
    : showInputBody || showOutputBody || Boolean(errorText);
  // Diffs/plans are the point of the card → open by default; bash/todo stay
  // collapsed behind their summary, expanding on error.
  const open =
    defaultOpen ??
    (agentKind === "diff" || agentKind === "plan" || agentKind === "todo"
      ? true
      : isError);

  return (
    <Collapsible
      defaultOpen={open}
      className={cn(
        "group/tool not-prose w-full overflow-hidden rounded-md border border-border/70 bg-muted/25 transition-colors hover:bg-muted/40",
        className,
      )}
      {...props}
    >
      <CollapsibleTrigger
        disabled={!hasDetails}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-2 text-left",
          "text-xs transition-colors",
          "disabled:cursor-default",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <span
          className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[state])}
          aria-label={STATUS_LABEL[state]}
        />
        <span className="grid size-5 shrink-0 place-items-center rounded bg-background/80">
          <HugeiconsIcon
            icon={Icon}
            size={13}
            strokeWidth={1.75}
            className="text-muted-foreground"
          />
        </span>
        <span className="shrink-0 font-medium text-foreground">{label}</span>
        {summary ? (
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {countPill ? (
          <span className="shrink-0 rounded bg-background/70 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {countPill}
          </span>
        ) : null}
        {isError && (
          <span className="shrink-0 text-xs font-medium text-destructive">
            failed
          </span>
        )}
      </CollapsibleTrigger>

      {hasDetails && (
        <CollapsibleContent
          className={cn("termco-collapsible-content")}
        >
          <div className="space-y-2 px-2.5 pb-2.5 pt-1">
            {agentKind ? (
              agentBody
            ) : (
              <>
                {showInputBody ? (
                  <ToolInput toolName={toolName} input={input} />
                ) : null}
                {showOutputBody || errorText ? (
                  <ToolOutput
                    toolName={toolName}
                    output={showOutputBody ? output : undefined}
                    errorText={errorText}
                  />
                ) : null}
              </>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

// For heavy tools, the only thing that should trigger a re-render is a
// state transition or the path summary changing — NOT every input-content
// token. We compare the cheap derived summary instead of the input ref.
export const Tool = memo(ToolImpl, (a, b) => {
  if (a.toolName !== b.toolName || a.state !== b.state) return false;
  if (a.errorText !== b.errorText) return false;
  if (a.output !== b.output) return false;
  if (a.className !== b.className) return false;
  if (HEAVY_CONTENT_TOOLS.has(a.toolName)) {
    return deriveSummary(a.toolName, a.input) ===
      deriveSummary(b.toolName, b.input);
  }
  return a.input === b.input;
});

function ToolInput({ toolName, input }: { toolName: string; input: unknown }) {
  if (input == null) return null;
  const preview = renderInputPreview(toolName, input);
  if (preview) {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">
          Input
        </div>
        {preview}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Input</div>
      <CodeBlockMini
        code={
          typeof input === "string" ? input : JSON.stringify(input, null, 2)
        }
        language="json"
      />
    </div>
  );
}

function renderInputPreview(
  toolName: string,
  input: unknown,
): ReactNode | null {
  if (!input || typeof input !== "object") return null;
  const i = input as Record<string, unknown>;
  const str = (k: string) =>
    typeof i[k] === "string" ? (i[k] as string) : null;

  if (toolName === "bash_run" || toolName === "bash_background") {
    const cmd = str("command");
    const cwd = str("cwd");
    if (!cmd) return null;
    return (
      <div className="space-y-1">
        {cwd ? (
          <div className="font-mono text-xs text-muted-foreground">
            {cwd}
          </div>
        ) : null}
        <pre className="overflow-auto rounded bg-muted/40 p-2 font-mono text-xs leading-relaxed">
          {cmd}
        </pre>
      </div>
    );
  }
  if (
    toolName === "read_file" ||
    toolName === "list_directory" ||
    toolName === "create_directory" ||
    toolName === "open_preview"
  ) {
    const path = str("path") ?? str("url");
    if (!path) return null;
    return (
      <div className="font-mono text-xs text-muted-foreground">{path}</div>
    );
  }
  if (toolName === "grep") {
    const pat = str("pattern") ?? str("query");
    const path = str("path") ?? str("root");
    if (!pat) return null;
    return (
      <div className="space-y-0.5 font-mono text-xs">
        <div className="text-foreground">{pat}</div>
        {path ? <div className="text-muted-foreground">{path}</div> : null}
      </div>
    );
  }
  return null;
}

function ToolOutput({
  toolName,
  output,
  errorText,
}: {
  toolName: string;
  output: unknown;
  errorText?: string;
}) {
  if (errorText) {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-destructive">Error</div>
        <div className="rounded bg-destructive/10 px-2 py-1.5 font-mono text-xs text-destructive whitespace-pre-wrap">
          {errorText}
        </div>
      </div>
    );
  }
  if (output === undefined || output === null) return null;

  const custom = renderToolOutput(toolName, output);
  if (custom) return custom;

  let body: ReactNode;
  if (typeof output === "string") {
    body = <CodeBlockMini code={output} language="text" />;
  } else if (typeof output === "object" && !isValidElement(output)) {
    body = (
      <CodeBlockMini code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else {
    body = <div className="text-xs">{output as ReactNode}</div>;
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">
        Output
      </div>
      {body}
    </div>
  );
}

function renderToolOutput(toolName: string, output: unknown): ReactNode | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  if (toolName === "browser_screenshot") {
    if (typeof o.error === "string") {
      return (
        <div className="rounded bg-destructive/10 px-2 py-1.5 font-mono text-xs text-destructive">
          {o.error}
        </div>
      );
    }
    const png = typeof o.png === "string" ? o.png : null;
    const url = typeof o.url === "string" ? o.url : null;
    const mediaType = typeof o.mediaType === "string" ? o.mediaType : "image/png";
    if (!png) return null;
    return (
      <div className="space-y-1">
        <img
          src={`data:${mediaType};base64,${png}`}
          alt={url ? `Screenshot of ${url}` : "Page screenshot"}
          className="max-h-96 w-full rounded border border-border/50 object-contain object-top"
        />
        {url ? (
          <div className="truncate font-mono text-xs text-muted-foreground">
            {url}
          </div>
        ) : null}
      </div>
    );
  }

  if (toolName === "read_file") {
    const path = typeof o.path === "string" ? o.path : "";
    const size = typeof o.size === "number" ? o.size : null;
    const content = typeof o.content === "string" ? o.content : "";
    const lines = content ? content.split("\n").length : null;
    return (
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
        <span className="text-foreground">read</span>
        {path ? <span className="text-muted-foreground">· {path}</span> : null}
        {lines != null ? (
          <span className="text-muted-foreground">
            ({lines} line{lines === 1 ? "" : "s"}
            {size != null ? `, ${formatBytes(size)}` : ""})
          </span>
        ) : null}
      </div>
    );
  }

  if (toolName === "list_directory") {
    const entries = Array.isArray(o.entries)
      ? (o.entries as Array<{ name: string; kind: string }>)
      : [];
    if (entries.length === 0) {
      return (
        <div className="text-xs italic text-muted-foreground">empty</div>
      );
    }
    const dirs = entries.filter(
      (e) => e.kind === "directory" || e.kind === "dir",
    );
    const files = entries.filter(
      (e) => !(e.kind === "directory" || e.kind === "dir"),
    );
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-xs">
        {dirs.map((e) => (
          <div
            key={`d-${e.name}`}
            className="flex items-center gap-1.5 truncate"
          >
            <HugeiconsIcon
              icon={FolderOpenIcon}
              size={11}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate text-foreground">{e.name}/</span>
          </div>
        ))}
        {files.map((e) => (
          <div
            key={`f-${e.name}`}
            className="flex items-center gap-1.5 truncate"
          >
            <HugeiconsIcon
              icon={File01Icon}
              size={11}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate text-muted-foreground">{e.name}</span>
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "bash_run") {
    return <BashRunOutput data={o} />;
  }

  if (toolName === "suggest_command") {
    const cmd = typeof o.command === "string" ? o.command : null;
    const explanation =
      typeof o.explanation === "string" ? o.explanation : null;
    if (!cmd) return null;
    return <SuggestCommandCard command={cmd} explanation={explanation} />;
  }

  if (toolName === "grep") {
    const hits = Array.isArray(o.hits)
      ? (o.hits as Array<{
          rel?: string;
          path?: string;
          line: number;
          text: string;
        }>)
      : [];
    const pattern = typeof o.pattern === "string" ? o.pattern : null;
    const truncated = Boolean(o.truncated);
    const filesScanned =
      typeof o.files_scanned === "number" ? o.files_scanned : null;

    if (hits.length === 0) {
      return (
        <div className="text-xs italic text-muted-foreground">
          no matches
          {filesScanned != null ? ` · ${filesScanned} files scanned` : ""}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="max-h-72 overflow-auto rounded bg-muted/30 font-mono text-xs">
          {hits.slice(0, 200).map((h, idx) => (
            <div
              key={`${h.rel ?? h.path}-${h.line}-${idx}`}
              className="flex gap-2 border-b border-border/30 px-2 py-1 last:border-b-0 hover:bg-muted/60"
            >
              <span className="shrink-0 text-muted-foreground">
                {h.rel ?? h.path}:{h.line}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {pattern ? highlightMatch(h.text, pattern) : h.text}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {hits.length} hit{hits.length === 1 ? "" : "s"}
            {filesScanned != null ? ` · ${filesScanned} files` : ""}
          </span>
          {truncated ? (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
              truncated
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (toolName === "glob") {
    const matches = Array.isArray(o.matches)
      ? (o.matches as string[])
      : Array.isArray(o.paths)
        ? (o.paths as string[])
        : [];
    if (matches.length === 0) {
      return (
        <div className="text-xs italic text-muted-foreground">
          no matches
        </div>
      );
    }
    return (
      <div className="max-h-60 overflow-auto rounded bg-muted/30 px-2 py-1 font-mono text-xs">
        {matches.slice(0, 300).map((p) => (
          <div key={p} className="truncate text-muted-foreground">
            {p}
          </div>
        ))}
      </div>
    );
  }

  if (toolName === "edit" || toolName === "multi_edit") {
    const ok = o.ok === true || typeof o.replacements === "number";
    if (ok) {
      const reps = typeof o.replacements === "number" ? o.replacements : null;
      const path = typeof o.path === "string" ? o.path : "";
      return (
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-emerald-600 dark:text-emerald-400">✓</span>
          {reps != null ? (
            <span className="text-foreground">
              {reps} replacement{reps === 1 ? "" : "s"}
            </span>
          ) : null}
          {path ? (
            <span className="text-muted-foreground">· {path}</span>
          ) : null}
        </div>
      );
    }
  }

  if (toolName === "write_file" || toolName === "create_directory") {
    const path = typeof o.path === "string" ? o.path : "";
    const bytes = typeof o.bytesWritten === "number" ? o.bytesWritten : null;
    return (
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
        <span className="text-foreground">
          {toolName === "create_directory" ? "created" : "wrote"}
        </span>
        {path ? <span className="text-muted-foreground">· {path}</span> : null}
        {bytes != null ? (
          <span className="text-muted-foreground">({formatBytes(bytes)})</span>
        ) : null}
      </div>
    );
  }

  if (toolName === "bash_background") {
    const handle = typeof o.handle === "string" ? o.handle : null;
    const cmd = typeof o.command === "string" ? o.command : "";
    return (
      <div className="space-y-0.5 font-mono text-xs">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {handle ? <span className="text-foreground">{handle}</span> : null}
          <span className="text-muted-foreground">running</span>
        </div>
        {cmd ? (
          <div className="truncate text-muted-foreground">{cmd}</div>
        ) : null}
      </div>
    );
  }

  return null;
}

function BashRunOutput({ data }: { data: Record<string, unknown> }) {
  const stdout = typeof data.stdout === "string" ? data.stdout : "";
  const stderr = typeof data.stderr === "string" ? data.stderr : "";
  const exit = typeof data.exit_code === "number" ? data.exit_code : null;
  const cwdAfter = typeof data.cwd_after === "string" ? data.cwd_after : null;
  const truncated = Boolean(data.truncated);
  const timedOut = Boolean(data.timed_out);

  const hasStdout = stdout.length > 0;
  const hasStderr = stderr.length > 0;
  const initial = hasStdout ? "stdout" : hasStderr ? "stderr" : "stdout";
  const [tab, setTab] = useState<"stdout" | "stderr">(initial);

  const tabs: Array<{
    key: "stdout" | "stderr";
    label: string;
    count: number;
  }> = [
    { key: "stdout", label: "stdout", count: stdout.length },
    { key: "stderr", label: "stderr", count: stderr.length },
  ];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-xs transition-colors",
              tab === t.key
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
              t.count === 0 && "opacity-40",
            )}
            disabled={t.count === 0}
          >
            {t.label}
            {t.count > 0 ? (
              <span className="ml-1 text-muted-foreground">{t.count}</span>
            ) : null}
          </button>
        ))}
        <span className="flex-1" />
        {exit != null ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-xs",
              exit === 0
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-destructive/15 text-destructive",
            )}
          >
            exit {exit}
          </span>
        ) : null}
        {timedOut ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-xs text-amber-700 dark:text-amber-400">
            timed out
          </span>
        ) : null}
        {truncated ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-xs text-amber-700 dark:text-amber-400">
            truncated
          </span>
        ) : null}
      </div>
      <pre className="max-h-72 overflow-auto rounded bg-muted/40 p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {tab === "stdout" ? stdout || " " : stderr || " "}
      </pre>
      {cwdAfter ? (
        <div className="font-mono text-xs text-muted-foreground">
          cwd → {cwdAfter}
        </div>
      ) : null}
    </div>
  );
}

function highlightMatch(text: string, pattern: string): ReactNode {
  if (!pattern) return text;
  let re: RegExp;
  try {
    re = new RegExp(
      `(${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
  } catch {
    return text;
  }
  const parts = text.split(re);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-amber-500/30 px-0.5 text-foreground">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function CodeBlockMini({ code }: { code: string; language: string }) {
  // Tool input/output is debug-grade detail — JSON arrives pre-formatted and
  // file content is shown in the editor diff tab. Highlighting here is not
  // worth the parser hop.
  return (
    <pre className="max-h-60 overflow-auto rounded bg-muted/40 p-2 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
      {code}
    </pre>
  );
}

function SuggestCommandCard({
  command,
  explanation,
}: {
  command: string;
  explanation: string | null;
}) {
  const [inserted, setInserted] = useState(false);
  const onInsert = () => {
    const ok = useChatStore
      .getState()
      .live.injectIntoActivePty(command);
    if (ok) setInserted(true);
  };
  return (
    <div className="space-y-1.5">
      {explanation ? (
        <div className="text-xs text-muted-foreground">{explanation}</div>
      ) : null}
      <div className="flex items-stretch gap-1.5 rounded bg-muted/40 overflow-hidden">
        <pre className="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed">
          {command}
        </pre>
        <button
          type="button"
          onClick={onInsert}
          disabled={inserted}
          className={cn(
            "shrink-0 flex items-center gap-1 px-2.5 text-xs font-medium",
            "border-l border-border/60",
            "hover:bg-muted/80 active:bg-muted",
            "disabled:opacity-60 disabled:cursor-default disabled:hover:bg-transparent",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
          aria-label="Insert into active terminal"
        >
          <HugeiconsIcon
            icon={inserted ? TerminalIcon : ArrowRight01Icon}
            size={12}
            strokeWidth={1.75}
          />
          <span>{inserted ? "Inserted" : "Insert"}</span>
        </button>
      </div>
    </div>
  );
}

// The current tool surface exposes its reusable input and output renderers.
export { ToolInput, ToolOutput };
