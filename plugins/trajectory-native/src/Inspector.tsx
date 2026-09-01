import type { SessionEventExplanation, TrajectoryRecord } from "@termco/session-base";
import ui from "@termco/ui";
import { useEffect, useState } from "react";
import { JsonTree } from "./JsonTree";
import {
  formatDuration,
  formatNesting,
  formatTimeDelta,
  recordColor,
  recordKindLabel,
} from "./recordMeta";
import { diffRequestHeaders } from "./requestDiff";

const { Button, Badge } = ui;

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function RequestInspector({ record, previous }: { record: TrajectoryRecord; previous: TrajectoryRecord | null }) {
  const envelope = asObject(record.inspector);
  const data = asObject(envelope.data);
  const header = asObject(data.header);
  const tools = Array.isArray(header.tools) ? header.tools : [];
  const messages = Array.isArray(header.messages) ? header.messages : [];
  const previousEnvelope = asObject(previous?.inspector);
  const previousHeader = asObject(asObject(previousEnvelope.data).header);
  const diff = previous ? diffRequestHeaders(previousHeader, header) : null;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <section>
        <h4 className="mb-1 font-semibold text-muted-foreground">Effective request</h4>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{String(header.selectedModelId ?? "unknown model")}</Badge>
          <Badge variant="outline">{String(header.reasoningEffort ?? "default effort")}</Badge>
          {typeof header.maxOutputTokens === "number" && <Badge variant="outline">{header.maxOutputTokens} max output tokens</Badge>}
        </div>
      </section>
      {diff && (
        <section aria-labelledby="request-diff-heading">
          <h4 id="request-diff-heading" className="mb-1 font-semibold text-muted-foreground">Changes from previous request</h4>
          {!diff.changed ? <p className="text-muted-foreground">No effective request changes.</p> : (
            <div className="overflow-hidden rounded-md border border-border/60">
              {diff.fields.map((field) => (
                <div key={field.label} className="grid gap-1 border-b border-border/40 px-2.5 py-2 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="font-medium text-muted-foreground">{field.label}</span>
                  <span className="break-words font-mono text-[10px] text-muted-foreground line-through [overflow-wrap:anywhere]">{field.before}</span>
                  <span className="break-words font-mono text-[10px] text-foreground [overflow-wrap:anywhere]">{field.after}</span>
                </div>
              ))}
              {(diff.tools.added.length > 0 || diff.tools.removed.length > 0 || diff.tools.changed.length > 0) && (
                <div className="flex flex-wrap gap-1.5 px-2.5 py-2" aria-label="Tool changes">
                  {diff.tools.added.length > 0 && <Badge variant="outline">Added: {diff.tools.added.join(", ")}</Badge>}
                  {diff.tools.removed.length > 0 && <Badge variant="outline">Removed: {diff.tools.removed.join(", ")}</Badge>}
                  {diff.tools.changed.length > 0 && <Badge variant="outline">Schema changed: {diff.tools.changed.join(", ")}</Badge>}
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <section>
        <h4 className="mb-1 font-semibold text-muted-foreground">Instructions</h4>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2">{String(header.systemPrompt ?? "(none)")}</pre>
      </section>
      <section>
        <h4 className="mb-1 font-semibold text-muted-foreground">Messages ({messages.length})</h4>
        <JsonTree value={messages} />
      </section>
      <section>
        <h4 className="mb-1 font-semibold text-muted-foreground">Tools ({tools.length})</h4>
        <JsonTree value={tools} />
      </section>
    </div>
  );
}

function ToolInspector({ record, records }: { record: TrajectoryRecord; records: readonly TrajectoryRecord[] }) {
  const envelope = asObject(record.inspector);
  const call = asObject(envelope.data);
  const callId = String(record.nesting.callId ?? call.callId ?? "");
  const resultRecord = records.find((candidate) => {
    if (candidate.id === record.id) return false;
    const candidateEnvelope = asObject(candidate.inspector);
    const candidateData = asObject(candidateEnvelope.data);
    return candidateEnvelope.type === "tool/result" && String(candidateData.callId ?? candidate.nesting.callId ?? "") === callId;
  }) ?? null;
  const result = asObject(asObject(resultRecord?.inspector).data);
  const error = asObject(result.error);
  return (
    <div className="flex flex-col gap-3 text-xs">
      <section>
        <h4 className="mb-1 font-semibold text-muted-foreground">Tool input</h4>
        <div className="mb-1 flex flex-wrap gap-1">
          <Badge variant="secondary">{String(call.name ?? "Tool")}</Badge>
          {typeof call.concurrency === "string" && <Badge variant="outline">{call.concurrency} execution</Badge>}
        </div>
        <JsonTree value={call.parsedInput ?? call.rawArguments ?? null} />
      </section>
      {resultRecord ? (
        <>
          <section>
            <h4 className="mb-1 font-semibold text-muted-foreground">Canonical output</h4>
            <JsonTree value={result.canonicalOutput ?? null} />
          </section>
          <section>
            <h4 className="mb-1 font-semibold text-muted-foreground">Model-visible result</h4>
            <JsonTree value={result.modelContent ?? null} />
          </section>
          {(Object.keys(error).length > 0 || result.recovered !== undefined || result.timing !== undefined) && (
            <div className="flex flex-wrap gap-1">
              {Object.keys(error).length > 0 && <Badge variant="destructive">{String(error.code ?? error.name ?? "Error")} · {String(error.message ?? "Tool failed")}</Badge>}
              {result.recovered === "outcome-unknown" && <Badge variant="outline">Outcome unknown after recovery</Badge>}
              {result.recovered === "not-started" && <Badge variant="outline">Not started before recovery</Badge>}
              {result.timing !== undefined && <Badge variant="outline">Timing recorded</Badge>}
            </div>
          )}
        </>
      ) : <p className="text-muted-foreground">No terminal result is recorded for this call.</p>}
    </div>
  );
}

function CausalInspector({
  explanation,
  loading,
  error,
  onNavigateSeq,
}: {
  readonly explanation: SessionEventExplanation | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onNavigateSeq: (seq: number) => void;
}) {
  return (
    <section aria-labelledby="causal-heading">
      <h4 id="causal-heading" className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Why this event?</h4>
      {loading ? <p className="text-xs text-muted-foreground">Resolving causal links…</p> : error ? <p role="alert" className="text-xs text-destructive">{error}</p> : !explanation ? <p className="text-xs text-muted-foreground">No causal links were recorded.</p> : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-medium text-muted-foreground">Sources</p>
            <div className="flex flex-wrap gap-1">
              {explanation.sources.length === 0 ? <span className="text-[10px] text-muted-foreground">None</span> : explanation.sources.map((seq) => (
                <button key={seq} type="button" className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" aria-label={`Open source event ${seq}`} onClick={() => onNavigateSeq(seq as number)}>#{seq}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium text-muted-foreground">Derived events</p>
            <div className="flex flex-wrap gap-1">
              {explanation.derived.length === 0 ? <span className="text-[10px] text-muted-foreground">None</span> : explanation.derived.map((seq) => (
                <button key={seq} type="button" className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" aria-label={`Open derived event ${seq}`} onClick={() => onNavigateSeq(seq as number)}>#{seq}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailGrid({ record }: { record: TrajectoryRecord }) {
  const entries = [
    ["Status", record.status],
    ["Duration", formatDuration(record.time)],
    ["Scope", formatNesting(record.nesting)],
    ["Source", record.sourceSeqs.length > 0 ? record.sourceSeqs.map(String).join(" → ") : "Session header"],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/60 bg-border/60 text-[11px]">
      {entries.map(([label, value]) => (
        <div key={label} className="min-w-0 bg-background px-2.5 py-2">
          <dt className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 truncate font-mono text-foreground" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StructuredInspector({ record, records }: { record: TrajectoryRecord; records: readonly TrajectoryRecord[] }) {
  const envelope = asObject(record.inspector);
  const data = asObject(envelope.data);
  const recordIndex = records.findIndex((candidate) => candidate.id === record.id);
  const previousRequest = recordIndex <= 0
    ? null
    : [...records.slice(0, recordIndex)].reverse().find((candidate) => candidate.kind === "request") ?? null;
  return (
    <div className="flex flex-col gap-4 text-xs">
      <section>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Record</h4>
        <p className="break-words text-sm leading-5 text-foreground">{record.summary}</p>
      </section>
      <DetailGrid record={record} />
      {record.metrics && Object.keys(record.metrics).length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Metrics</h4>
          <JsonTree value={record.metrics} />
        </section>
      )}
      {record.provenance && (
        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contributor</h4>
          <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 font-mono text-[11px]">
            {record.provenance.pluginId} · {record.provenance.contributionId}
          </div>
        </section>
      )}
      {record.kind === "request" ? <RequestInspector record={record} previous={previousRequest} /> : record.kind === "tool" && envelope.type === "tool/call" ? <ToolInspector record={record} records={records} /> : (
        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Event data</h4>
          <JsonTree value={data} />
        </section>
      )}
    </div>
  );
}

export function Inspector({
  record,
  records,
  startTime,
  onCopy,
  causal,
  causalLoading,
  causalError,
  onNavigateSeq,
}: {
  readonly record: TrajectoryRecord | null;
  readonly records: readonly TrajectoryRecord[];
  readonly startTime: number;
  readonly onCopy: (record: TrajectoryRecord) => void;
  readonly causal: SessionEventExplanation | null;
  readonly causalLoading: boolean;
  readonly causalError: string | null;
  readonly onNavigateSeq: (seq: number) => void;
}) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setRaw(false);
    setCopied(false);
  }, [record?.id]);
  if (!record) {
    return <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">Select a record to inspect.</div>;
  }
  const color = recordColor(record.kind);
  const firstSeq = record.sourceSeqs[0] as number | undefined;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="trajectory-inspector">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">#{firstSeq ?? "–"}</span>
        <span className={`text-xs font-medium ${color.text}`}>{recordKindLabel(record.kind)}</span>
        <Badge variant="outline" className="text-[10px]">{record.status}</Badge>
        <span className="font-mono text-[10px] text-muted-foreground">{formatTimeDelta(record.time.start, startTime)}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" aria-pressed={raw} onClick={() => setRaw((value) => !value)}>
            {raw ? "Details" : "Raw event"}
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => {
            onCopy(record);
            setCopied(true);
          }}>{copied ? "Copied" : "Copy"}</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {raw ? <JsonTree value={record.inspector} /> : <div className="flex flex-col gap-4"><StructuredInspector record={record} records={records} /><CausalInspector explanation={causal} loading={causalLoading} error={causalError} onNavigateSeq={onNavigateSeq} /></div>}
      </div>
    </div>
  );
}
