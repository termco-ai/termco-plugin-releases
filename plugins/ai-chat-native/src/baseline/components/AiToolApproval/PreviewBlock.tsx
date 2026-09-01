/**
 * PreviewBlock — renders the per-tool preview shown inside an approval card.
 * Owns the tool-specific summaries (shell command, or path + size hint for
 * file mutations); it deliberately does not preview streamed file content.
 */

import { cn } from "@termco/ui";

export function PreviewBlock({
  toolName,
  input,
  questionSelections,
  onQuestionSelection,
}: {
  toolName: string;
  input: Record<string, unknown>;
  questionSelections?: Record<number, string>;
  onQuestionSelection?: (questionIndex: number, answer: string) => void;
}) {
  // Coding-agent plan-mode exit: show the proposed plan (Build / Revise footer).
  if (toolName === "ExitPlanMode" || toolName === "exit_plan_mode") {
    const plan = typeof input.plan === "string" ? input.plan : "";
    return (
      <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed text-foreground">
        {plan || "No plan text provided."}
      </div>
    );
  }
  // Coding-agent AskUserQuestion: render the questions + numbered options.
  if (toolName === "AskUserQuestion" || toolName === "ask_user_question") {
    return (
      <QuestionPreview
        input={input}
        selections={questionSelections ?? {}}
        onSelect={onQuestionSelection}
      />
    );
  }
  if (toolName === "bash_run" || toolName === "bash_background") {
    const cwd = typeof input.cwd === "string" ? input.cwd : null;
    return (
      <div className="space-y-1.5">
        {cwd && (
          <div className="font-mono text-xs text-muted-foreground">{cwd}</div>
        )}
        <pre
          className={cn(
            "max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed",
          )}
        >
          {String(input.command ?? "")}
        </pre>
      </div>
    );
  }
  // For file mutations we deliberately do NOT preview content here —
  // streamed write/edit content thrashes the UI and the AI diff tab is the
  // authoritative place to review the change. Show just the path + a
  // one-line size hint so the user knows what's being touched.
  if (toolName === "write_file") {
    const content = typeof input.content === "string" ? input.content : "";
    const lines = content ? content.split("\n").length : 0;
    return (
      <div className="space-y-0.5 font-mono text-xs">
        <div className="text-muted-foreground">{String(input.path ?? "")}</div>
        <div className="text-xs text-muted-foreground/80">
          {lines} line{lines === 1 ? "" : "s"} · review in the diff tab
        </div>
      </div>
    );
  }
  if (toolName === "edit") {
    const oldStr = typeof input.old_string === "string" ? input.old_string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string : "";
    const removed = oldStr ? oldStr.split("\n").length : 0;
    const added = newStr ? newStr.split("\n").length : 0;
    return (
      <div className="space-y-0.5 font-mono text-xs">
        <div className="text-muted-foreground">
          {String(input.path ?? "")}
          {input.replace_all ? " · replace all" : ""}
        </div>
        <div className="text-xs text-muted-foreground/80">
          −{removed} / +{added} line{added === 1 && removed === 1 ? "" : "s"} ·
          review in the diff tab
        </div>
      </div>
    );
  }
  if (toolName === "multi_edit") {
    const edits = Array.isArray(input.edits)
      ? (input.edits as Array<{ old_string?: string; new_string?: string }>)
      : [];
    return (
      <div className="space-y-0.5 font-mono text-xs">
        <div className="text-muted-foreground">{String(input.path ?? "")}</div>
        <div className="text-xs text-muted-foreground/80">
          {edits.length} edit{edits.length === 1 ? "" : "s"} · review in the
          diff tab
        </div>
      </div>
    );
  }
  if (toolName === "create_directory") {
    return (
      <div className="font-mono text-xs text-muted-foreground">
        {String(input.path ?? "")}
      </div>
    );
  }
  if (toolName === "browser_navigate") {
    return (
      <div className="font-mono text-xs text-muted-foreground break-all">
        {String(input.url ?? "")}
      </div>
    );
  }
  if (toolName === "browser_evaluate") {
    return (
      <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed">
        {String(input.expression ?? "")}
      </pre>
    );
  }
  if (toolName === "browser_network_body") {
    return (
      <div className="font-mono text-xs text-muted-foreground">
        response body of {String(input.requestId ?? "")}
      </div>
    );
  }
  if (
    toolName === "browser_click" ||
    toolName === "browser_type" ||
    toolName === "browser_press_key"
  ) {
    return (
      <div className="space-y-0.5 font-mono text-xs text-muted-foreground">
        {input.ref ? <div>element {String(input.ref)}</div> : null}
        {toolName === "browser_type" && typeof input.text === "string" ? (
          <div className="text-xs text-muted-foreground/80">
            type: “
            {input.text.length > 80
              ? `${input.text.slice(0, 80)}…`
              : input.text}
            ”{input.submit ? " · then Enter" : ""}
          </div>
        ) : null}
        {toolName === "browser_press_key" ? (
          <div>press {String(input.key ?? "")}</div>
        ) : null}
      </div>
    );
  }
  return (
    <pre className="overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

/** Render an AskUserQuestion payload as selectable answers. The approval
 * transport cannot carry arbitrary answer data, so the parent routes the
 * completed selection into the normal composer as a user reply. */
function QuestionPreview({
  input,
  selections,
  onSelect,
}: {
  input: Record<string, unknown>;
  selections: Record<number, string>;
  onSelect?: (questionIndex: number, answer: string) => void;
}) {
  const questions = Array.isArray(input.questions)
    ? (input.questions as Array<Record<string, unknown>>)
    : [];
  if (questions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        {typeof input.question === "string"
          ? input.question
          : "The agent is asking a question."}
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {questions.map((q, qi) => {
        const options = Array.isArray(q.options)
          ? (q.options as Array<Record<string, unknown>>)
          : [];
        return (
          <div key={qi} className="space-y-1">
            <div className="text-xs font-medium text-foreground">
              {String(q.question ?? q.header ?? "Question")}
            </div>
            <div className="space-y-1">
              {options.map((o, oi) => (
                <button
                  key={oi}
                  type="button"
                  aria-pressed={selections[qi] === String(o.label ?? "")}
                  onClick={() => onSelect?.(qi, String(o.label ?? ""))}
                  className={cn(
                    "flex w-full gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                    selections[qi] === String(o.label ?? "")
                      ? "border-primary/30 bg-[var(--signal-soft)]"
                      : "border-border/70 bg-background hover:bg-muted/35",
                  )}
                >
                  <span className="shrink-0 font-mono text-muted-foreground/70">
                    {oi + 1}.
                  </span>
                  <span>
                    <span className="text-foreground">
                      {String(o.label ?? "")}
                    </span>
                    {typeof o.description === "string" && o.description ? (
                      <span className="text-muted-foreground/80">
                        {" "}
                        — {o.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
