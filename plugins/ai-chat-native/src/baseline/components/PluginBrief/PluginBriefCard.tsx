import { Button, Textarea } from "@termco/ui";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Edit02Icon,
  FileValidationIcon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { memo, useMemo, useState } from "react";
import { toolsService } from "../../runtime/toolContributions";
import type { PluginBrief, PluginBriefOutput } from "./types";

type Props = {
  part: ToolUIPart | DynamicToolUIPart;
  onRespond?: (toolCallId: string, output: PluginBriefOutput) => void;
};

function parsedInput(toolName: string, input: unknown): PluginBrief | null {
  return toolsService.presentation(toolName)?.parseInput(input) as PluginBrief | null;
}

function parsedOutput(
  toolName: string,
  part: { state?: string; output?: unknown },
): PluginBriefOutput | null {
  if (part.state !== "output-available") return null;
  return toolsService.presentation(toolName)?.parseOutput?.(part.output) as
    | PluginBriefOutput
    | null;
}

function PluginBriefCardImpl({ part, onRespond }: Props) {
  const toolName = getToolName(part);
  const brief = useMemo(
    () => parsedInput(toolName, part.input),
    [part.input, toolName],
  );
  const output = parsedOutput(toolName, part);
  const [mode, setMode] = useState<"review" | "revise">("review");
  const [note, setNote] = useState("");

  if (part.state === "input-streaming" || !brief) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
        Preparing the Plugin Brief…
      </div>
    );
  }
  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-xs text-destructive">
        The Plugin Brief could not be completed.
      </div>
    );
  }
  if (output) return <CompletedBrief brief={brief} output={output} />;

  const respond = (response: PluginBriefOutput) =>
    onRespond?.(part.toolCallId, response);

  return (
    <section
      data-testid="plugin-brief-card"
      aria-label="Plugin Brief"
      className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[var(--shadow-control)]"
    >
      <header className="flex items-start gap-3 border-b border-border/60 bg-[var(--signal-soft)] px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background text-primary ring-1 ring-primary/20">
          <HugeiconsIcon icon={FileValidationIcon} size={14} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-foreground">
            Plugin Brief · revision {brief.revision}
          </span>
          <span className="block text-xs text-muted-foreground">
            Confirm the result before Termco creates or changes anything.
          </span>
        </div>
        <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Waiting for you
        </span>
      </header>

      <div className="space-y-3 px-3 py-3 text-xs">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{brief.title}</h3>
          <p className="mt-1 leading-relaxed text-muted-foreground">{brief.outcome}</p>
        </div>
        <BriefFact label="How it fits the work" value={brief.userJourney} />
        <div className="grid gap-2 sm:grid-cols-2">
          <BriefFact label="Where it appears" value={brief.experience.location} />
          <BriefFact label="What the user can do" value={brief.experience.interaction} />
        </div>
        <BriefList label="Visible states" values={brief.experience.states} />
        {brief.onboarding ? <OnboardingDecision onboarding={brief.onboarding} /> : null}
        <BriefList label="Included" values={brief.scope.included} />
        {brief.scope.excluded.length > 0 ? (
          <BriefList label="Not included" values={brief.scope.excluded} muted />
        ) : null}
        <BriefList label="Done when" values={brief.acceptanceCriteria} numbered />

        <details className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            Implementation details
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
            <dt>Approach</dt><dd className="text-foreground">{brief.authoring.intent}</dd>
            <dt>Plugin</dt><dd className="break-all font-mono text-foreground">{brief.authoring.plugin.id}</dd>
            {brief.authoring.sourcePluginId ? <><dt>Existing feature</dt><dd className="break-all font-mono text-foreground">{brief.authoring.sourcePluginId}</dd></> : null}
            <dt>Termco surface</dt><dd className="break-all font-mono text-foreground">{brief.authoring.target}</dd>
          </dl>
        </details>

        {mode === "revise" ? (
          <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
            <label htmlFor={`plugin-brief-note-${part.toolCallId}`} className="block font-medium text-foreground">
              What should change?
            </label>
            <Textarea
              id={`plugin-brief-note-${part.toolCallId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              autoFocus
              placeholder="Describe the outcome or behavior that needs adjusting…"
              className="min-h-0 resize-none text-xs"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode("review")}>Back</Button>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!note.trim() || !onRespond}
                onClick={() => respond({ action: "revise", note: note.trim() })}
              >
                Send change
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {mode === "review" ? (
        <footer className="flex flex-wrap items-center justify-end gap-1.5 border-t border-border/60 bg-muted/20 px-3 py-2">
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground" disabled={!onRespond} onClick={() => respond({ action: "cancel" })}>
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            Cancel
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" disabled={!onRespond} onClick={() => respond({ action: "continue-interview" })}>
            <HugeiconsIcon icon={HelpCircleIcon} size={12} strokeWidth={2} />
            Ask me more
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={!onRespond} onClick={() => setMode("revise")}>
            <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={2} />
            Change something
          </Button>
          <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={!onRespond} onClick={() => respond({ action: "confirm" })}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} />
            Confirm and build
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

function BriefFact({ label, value }: { label: string; value: string }) {
  return <div><div className="font-medium text-foreground">{label}</div><p className="mt-0.5 leading-relaxed text-muted-foreground">{value}</p></div>;
}

function OnboardingDecision({ onboarding }: { onboarding: NonNullable<PluginBrief["onboarding"]> }) {
  if (onboarding.decision !== "include") {
    return (
      <div className="border-y border-border/60 py-2.5">
        <div className="font-medium text-foreground">
          {onboarding.decision === "omit" ? "Onboarding omitted" : "Onboarding not applicable"}
        </div>
        <p className="mt-0.5 leading-relaxed text-muted-foreground">{onboarding.rationale}</p>
      </div>
    );
  }
  return (
    <div className="border-y border-border/60 py-2.5">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={1.9} className="text-emerald-600 dark:text-emerald-400" />
        Onboarding included
      </div>
      <div className="mt-1 font-medium text-foreground">{onboarding.journey.title}</div>
      <p className="mt-0.5 leading-relaxed text-muted-foreground">
        {onboarding.journey.description} · {onboarding.journey.presentation}
      </p>
      <p className="mt-1 leading-relaxed text-muted-foreground/80">{onboarding.rationale}</p>
      <ol className="mt-1.5 space-y-1 pl-4 leading-relaxed text-muted-foreground list-decimal">
        {onboarding.journey.steps.map((step) => <li key={step.id}>{step.title}</li>)}
      </ol>
    </div>
  );
}

function BriefList({ label, values, muted = false, numbered = false }: { label: string; values: string[]; muted?: boolean; numbered?: boolean }) {
  const List = numbered ? "ol" : "ul";
  return (
    <div>
      <div className="font-medium text-foreground">{label}</div>
      <List className={`mt-1 space-y-1 pl-4 leading-relaxed ${numbered ? "list-decimal" : "list-disc"} ${muted ? "text-muted-foreground/75" : "text-muted-foreground"}`}>
        {values.map((value) => <li key={value}>{value}</li>)}
      </List>
    </div>
  );
}

function CompletedBrief({ brief, output }: { brief: PluginBrief; output: PluginBriefOutput }) {
  const labels = {
    confirm: "Confirmed",
    revise: "Revision requested",
    "continue-interview": "More questions requested",
    cancel: "Cancelled",
  } as const;
  return (
    <div data-testid="plugin-brief-card" className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs">
      <HugeiconsIcon icon={output.action === "confirm" ? CheckmarkCircle02Icon : Edit02Icon} size={14} strokeWidth={1.8} className={output.action === "confirm" ? "mt-px text-emerald-600 dark:text-emerald-400" : "mt-px text-muted-foreground"} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{brief.title}</div>
        <div className="mt-0.5 text-muted-foreground">
          <span>{labels[output.action]}</span>
          {output.action === "confirm" && brief.onboarding
            ? ` · onboarding ${brief.onboarding.decision === "include" ? "included" : brief.onboarding.decision}`
            : ""}
          {output.note ? ` — ${output.note}` : ""}
        </div>
      </div>
    </div>
  );
}

export const PluginBriefCard = memo(PluginBriefCardImpl);
