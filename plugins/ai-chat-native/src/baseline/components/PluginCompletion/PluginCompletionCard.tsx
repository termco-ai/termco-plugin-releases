import type { AiToolPresentationAdapter } from "@termco/ai-tools-base";
import { Button } from "@termco/ui";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { useMemo, useState } from "react";

type AnyToolPart = ToolUIPart | DynamicToolUIPart;

type CompletionRecord = {
  kind: "plugin-completion";
  completionId: string;
  plugin: {
    id: string;
    name: string;
    intent: "create" | "fork" | "replace";
    target: string;
    generation: string;
  };
  contributions: ReadonlyArray<{ service: string; key: string }>;
  stages: readonly string[];
  actions: readonly string[];
  message: string;
};

type DisablePreview = {
  previewId: string;
  generation: number;
  blockedPlugins: ReadonlyArray<{ pluginId: string }>;
  unavailableFeatures: ReadonlyArray<{ label: string }>;
  destructiveResources: readonly unknown[];
};

function recordFrom(
  presentation: AiToolPresentationAdapter,
  part: AnyToolPart,
): CompletionRecord | null {
  if (!("output" in part)) return null;
  return (presentation.parseOutput?.(part.output) ?? null) as CompletionRecord | null;
}

export function PluginCompletionCard({
  part,
  presentation,
}: {
  part: AnyToolPart;
  presentation: AiToolPresentationAdapter;
}) {
  const record = useMemo(
    () => recordFrom(presentation, part),
    [part, presentation],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disablePreview, setDisablePreview] = useState<DisablePreview | null>(null);
  const [finishedAction, setFinishedAction] = useState<"disabled" | "undone" | null>(null);

  if (!record || !("output" in part) || !presentation.performAction) return null;

  const perform = async (action: string, payload?: unknown) => {
    setBusy(action);
    setError(null);
    try {
      return await presentation.performAction?.({
        action,
        input: part.input,
        output: part.output,
        payload,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const previewDisable = async () => {
    const result = await perform("disable-preview") as DisablePreview | undefined;
    if (result) setDisablePreview(result);
  };

  const confirmDisable = async () => {
    if (!disablePreview) return;
    const result = await perform("disable", {
      previewId: disablePreview.previewId,
      generation: disablePreview.generation,
    }) as { status?: string } | undefined;
    if (result?.status === "replaced") {
      setDisablePreview(null);
      setFinishedAction("disabled");
    }
  };

  const undo = async () => {
    const result = await perform("undo") as { status?: string } | undefined;
    if (result?.status === "replaced") setFinishedAction("undone");
  };

  const impactCount = disablePreview
    ? disablePreview.blockedPlugins.length +
      disablePreview.unavailableFeatures.length +
      disablePreview.destructiveResources.length
    : 0;

  return (
    <section
      aria-label="Plugin change ready"
      className="my-2 overflow-hidden rounded-xl border border-emerald-500/25 bg-card/80 shadow-sm"
      data-testid="plugin-completion-card"
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Plugin change ready</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {record.plugin.name}
            <span className="px-1.5 text-border">·</span>
            {record.plugin.intent}
            <span className="px-1.5 text-border">·</span>
            {record.plugin.target}
          </p>
        </div>
        <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {record.stages.length} checks
        </span>
      </div>

      {record.contributions.length > 0 ? (
        <div className="border-t border-border/50 px-4 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/75">
            Added to
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {record.contributions.map((entry) => (
              <span
                key={`${entry.service}:${entry.key}`}
                className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] text-foreground/80"
              >
                {entry.service} / {entry.key}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {disablePreview ? (
        <div role="alert" className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-medium text-foreground">Disable this plugin?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {impactCount === 0
              ? "No dependent plugin or live resource is affected."
              : `${impactCount} dependent feature or resource ${impactCount === 1 ? "is" : "are"} affected.`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => void confirmDisable()}>
              Confirm disable
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setDisablePreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="border-t border-destructive/20 px-4 py-2 text-xs text-destructive">{error}</p> : null}
      {finishedAction ? (
        <p role="status" className="border-t border-border/50 px-4 py-2 text-xs text-muted-foreground">
          Plugin {finishedAction}.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-t border-border/50 px-3 py-2.5">
        {record.actions.includes("show-again") ? (
          <Button size="sm" variant="secondary" disabled={busy !== null || finishedAction !== null} onClick={() => void perform("show-again")}>
            Show again
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void perform("open-folder")}>
          Open plugin folder
        </Button>
        {record.actions.includes("disable") ? (
          <Button size="sm" variant="ghost" disabled={busy !== null || finishedAction !== null} onClick={() => void previewDisable()}>
            Disable
          </Button>
        ) : null}
        {record.actions.includes("undo") ? (
          <Button size="sm" variant="ghost" disabled={busy !== null || finishedAction !== null} onClick={() => void undo()}>
            Undo
          </Button>
        ) : null}
        <details className="ml-auto self-center text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Evidence</summary>
          <div className="mt-2 max-w-sm space-y-1 pb-1 font-mono text-[10px]">
            <p>{record.plugin.id}@{record.plugin.generation}</p>
            <p>{record.stages.join(" → ")}</p>
            <p>{record.message}</p>
          </div>
        </details>
      </div>
    </section>
  );
}
