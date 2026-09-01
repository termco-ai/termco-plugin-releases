import { Button, cn } from "@termco/ui";
import type { McpApprovalStore, McpApprovalSource } from "./mcpApprovalStore";
import type { McpInteractionStore } from "./mcpInteractionStore";

function sourceLabel(source: McpApprovalSource): string {
  return source.kind === "run" ? "a managed run" : source.label;
}

function argSummary(input: Record<string, unknown>): string {
  const summary = JSON.stringify(input);
  return summary.length > 160 ? `${summary.slice(0, 160)}…` : summary;
}

export function McpApprovalOverlay({
  approvals,
  interactions,
}: {
  approvals: McpApprovalStore;
  interactions: McpInteractionStore;
}) {
  const pendingApprovals = approvals.useStore((state) => state.pending);
  const answerApproval = approvals.useStore((state) => state.answer);
  const pendingInteractions = interactions.useStore((state) => state.pending);
  const answerInteraction = interactions.useStore((state) => state.answer);
  const dismiss = interactions.useStore((state) => state.dismiss);

  if (pendingApprovals.length === 0 && pendingInteractions.length === 0) {
    return null;
  }

  return (
    <div
      data-termco-overlay="true"
      data-testid="mcp-approval-overlay"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[999] flex flex-col items-center gap-2 px-4"
    >
      {pendingApprovals.map((request) => (
        <div
          key={request.requestId}
          className={cn(
            "pointer-events-auto w-full max-w-md rounded-xl border bg-card p-3 shadow-lg",
            request.catastrophic ? "border-destructive" : "border-border",
          )}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">
              {request.toolName}
            </span>
            <span>·</span>
            <span>{sourceLabel(request.source)}</span>
            <span>·</span>
            <span className="truncate">{request.rig.rigName}</span>
          </div>
          {request.catastrophic ? (
            <div className="mt-1 text-xs font-semibold text-destructive">
              ⚠ This command is flagged as dangerous.
            </div>
          ) : null}
          <div className="mt-1 break-words font-mono text-xs text-muted-foreground/90">
            {argSummary(request.input)}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => answerApproval(request.requestId, false)}
            >
              Deny
            </Button>
            {!request.catastrophic ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => answerApproval(request.requestId, true, true)}
              >
                Allow &amp; remember
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => answerApproval(request.requestId, true)}
            >
              Allow once
            </Button>
          </div>
        </div>
      ))}

      {pendingInteractions.map((interaction) =>
        interaction.kind === "ask_user" ? (
          <AskUserCard
            key={interaction.requestId}
            input={interaction.input}
            onAnswer={(value) => answerInteraction(interaction.requestId, value)}
          />
        ) : (
          <div
            key={interaction.requestId}
            className="pointer-events-auto w-full max-w-md rounded-xl border border-border bg-card p-3 shadow-lg"
          >
            <div className="text-xs font-semibold text-foreground">Agent view</div>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs text-muted-foreground">
              {JSON.stringify(interaction.input, null, 2)}
            </pre>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismiss(interaction.requestId)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function AskUserCard({
  input,
  onAnswer,
}: {
  input: Record<string, unknown>;
  onAnswer: (value: Record<string, unknown>) => void;
}) {
  const question =
    typeof input.question === "string"
      ? input.question
      : "The agent has a question.";
  const options = Array.isArray(input.options)
    ? (input.options as Array<{ label?: unknown }>).filter(
        (option) => typeof option?.label === "string",
      )
    : [];
  return (
    <div className="pointer-events-auto w-full max-w-md rounded-xl border border-primary/50 bg-card p-3 shadow-lg">
      <div className="text-sm font-medium text-foreground">{question}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option, index) => (
          <Button
            key={index}
            size="sm"
            variant="outline"
            onClick={() =>
              onAnswer({
                answer: String(option.label),
                selected: [String(option.label)],
              })
            }
          >
            {String(option.label)}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAnswer({ answer: "", skipped: true })}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}
