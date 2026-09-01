import type { SshClientCapability } from "@termco/ssh-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { UiCommandSourceContribution } from "@termco/ui-commands-base";
import type { UiAiDockRuntime, UiAiDockViewContribution } from "@termco/ui-dock-base";
import type { UiOverlayContribution } from "@termco/ui-overlays-base";
import type {
  WorkflowDefinition,
  WorkflowParameter,
  WorkflowParameterSourceRegistry,
  WorkflowParamSource,
  WorkflowRunnerRegistry,
  WorkflowsLibraryCapability,
  WorkflowTarget,
  WorkflowValues,
} from "@termco/workflows-base";
import type {
  WorkspaceEnv,
  WorkspacePresentationCapability,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import ui from "@termco/ui";
import {
  Add01Icon,
  PlayIcon,
  Search01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BUILTIN_TAGS } from "./builtins";
import {
  chainWorkflow,
  containerExecPrefix,
  type ResourceOption,
  type WorkflowRunnerDependencies,
} from "./domain";
import type { WorkflowSheetController } from "./sheet";
import { notifyWorkflowPanelVisible } from "./onboarding";

const { Button, Input, cn } = ui;
const { useEffect, useMemo, useState, useSyncExternalStore } = ui.React;

const button = {
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--card)",
  color: "var(--foreground)",
  cursor: "pointer",
  padding: "6px 9px",
  fontSize: 12,
} as const;
const primaryButton = {
  ...button,
  borderColor: "var(--primary)",
  background: "var(--primary)",
  color: "var(--primary-foreground)",
} as const;
const input = {
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  minHeight: 32,
  border: "1px solid var(--border)",
  borderRadius: 7,
  outline: 0,
  background: "var(--background)",
  color: "var(--foreground)",
  padding: "6px 8px",
  fontSize: 12,
} as const;
const muted = { color: "var(--muted-foreground)", fontSize: 11 } as const;

type Services = {
  presentation: WorkspacePresentationCapability;
  runners: WorkflowRunnerRegistry;
  parameterSources: WorkflowParameterSourceRegistry;
};

type WorkflowOverlayRuntime = {
  workspace: NonNullable<WorkspaceEnv>;
  rootPath: string | null;
};

function createTerminalRunnerDependencies(
  tabs: WorkspaceTabsCapability,
  terminals: TerminalSessionsCapability,
): Pick<
  WorkflowRunnerDependencies,
  "getActiveLeafId" | "openTerminal" | "runInLeaf"
> {
  return {
    getActiveLeafId() {
      const snapshot = tabs.snapshot();
      const focusedId =
        snapshot.focusedPane === "right" && snapshot.splitTabId !== 0
          ? snapshot.splitTabId
          : snapshot.activeId;
      const tab = snapshot.tabs.find((candidate) => candidate.id === focusedId);
      return tab?.kind === "terminal" &&
        typeof tab.data?.activeLeafId === "number"
        ? tab.data.activeLeafId
        : null;
    },
    async openTerminal(cwd) {
      const opened = terminals.open({ cwd });
      await terminals.whenReady(opened.leafId);
      return opened.leafId;
    },
    runInLeaf(leafId, command) {
      if (!terminals.write(leafId, `${command}\r`)) return;
      terminals.focus(leafId);
    },
  };
}

export function createWorkflowRunnerDependencies(
  tabs: WorkspaceTabsCapability,
  terminals: TerminalSessionsCapability,
  ssh: SshClientCapability,
): WorkflowRunnerDependencies {
  return {
    ...createTerminalRunnerDependencies(tabs, terminals),
    containerExecPrefix,
    async runOnSshHost(connectionId, command) {
      const result = await ssh.runSsh(
        ssh.resolveTarget({ connectionId }),
        command,
      );
      if (!ssh.ok(result)) {
        throw new Error(
          result.stderr || `SSH command exited with ${result.exitCode}`,
        );
      }
    },
  };
}

export function createWorkflowTerminalActions(
  tabs: WorkspaceTabsCapability,
  terminals: TerminalSessionsCapability,
): {
  runInFocusedTerminal(command: string): Promise<void>;
  runInNewTerminal(command: string, cwd?: string): Promise<void>;
} {
  const runner = createTerminalRunnerDependencies(tabs, terminals);
  const runInNewTerminal = async (command: string, cwd?: string) => {
    const leafId = await runner.openTerminal(cwd);
    runner.runInLeaf(leafId, command);
  };
  return {
    runInNewTerminal,
    async runInFocusedTerminal(command: string) {
      const leafId = runner.getActiveLeafId();
      if (leafId === null) {
        await runInNewTerminal(command);
        return;
      }
      runner.runInLeaf(leafId, command);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useLibrary(library: WorkflowsLibraryCapability) {
  return useSyncExternalStore(
    library.subscribe,
    library.snapshot,
    library.snapshot,
  );
}

export function createPanel(
  library: WorkflowsLibraryCapability,
  sheet: WorkflowSheetController,
) {
  return function WorkflowsPanel({ runtime }: { runtime: UiAiDockRuntime }) {
    useEffect(() => {
      notifyWorkflowPanelVisible();
    }, []);
    const snapshot = useLibrary(library);
    const workflows = useMemo(
      () => library.visible(runtime.activeRigId),
      [snapshot, runtime.activeRigId],
    );
    const [screen, setScreen] = useState<
      | { view: "list" }
      | { view: "detail"; id: string }
      | { view: "new" }
      | { view: "edit"; id: string }
    >({ view: "list" });
    const [query, setQuery] = useState("");
    const [tag, setTag] = useState<string | null>(null);
    const [notice, setNotice] = useState("");

    const tagCounts = useMemo(() => {
      const counts = new Map<string, number>();
      for (const workflow of workflows) {
        for (const value of workflow.tags) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      const order = [
        ...BUILTIN_TAGS.filter((value) => counts.has(value)),
        ...[...counts.keys()]
          .filter((value) => !BUILTIN_TAGS.includes(value))
          .sort(),
      ];
      return order.map((value) => ({ value, count: counts.get(value) ?? 0 }));
    }, [workflows]);
    const visible = useMemo(() => {
      const needle = query.trim().toLowerCase();
      return workflows.filter((workflow) => {
        if (tag === "favorites" && !snapshot.favoriteIds.includes(workflow.id)) {
          return false;
        }
        if (tag && tag !== "favorites" && !workflow.tags.includes(tag)) return false;
        return (
          !needle ||
          workflow.name.toLowerCase().includes(needle) ||
          workflow.description?.toLowerCase().includes(needle) ||
          workflow.command.toLowerCase().includes(needle) ||
          workflow.tags.some((value) => value.toLowerCase().includes(needle))
        );
      });
    }, [workflows, query, tag, snapshot.favoriteIds]);

    if (screen.view === "new" || screen.view === "edit") {
      const initial =
        screen.view === "edit" ? library.get(screen.id) : undefined;
      return (
        <WorkflowForm
          library={library}
          initial={initial}
          onCancel={() => setScreen({ view: "list" })}
          onDone={(id) => setScreen({ view: "detail", id })}
        />
      );
    }

    if (screen.view === "detail") {
      const workflow = library.get(screen.id);
      if (workflow) {
        const builtin = workflow.source === "builtin" || workflow.source === "plugin";
        return (
          <div data-testid="workflows-detail" style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}>
            <header style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", padding: 10 }}>
              <button type="button" style={button} onClick={() => setScreen({ view: "list" })}>← Back</button>
              <strong style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workflow.name}</strong>
              <button type="button" style={button} onClick={() => void library.toggleFavorite(workflow.id)}>{library.isFavorite(workflow.id) ? "★" : "☆"}</button>
            </header>
            <div style={{ minHeight: 0, flex: 1, overflow: "auto", padding: 14 }}>
              {workflow.description ? <p style={{ ...muted, lineHeight: 1.5 }}>{workflow.description}</p> : null}
              <SectionLabel>Command</SectionLabel>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", border: "1px solid var(--border)", borderRadius: 8, background: "var(--muted)", padding: 10, fontSize: 11 }}>{(workflow.steps ?? [workflow.command]).join("\n")}</pre>
              {workflow.parameters.length ? <><SectionLabel>Parameters</SectionLabel>{workflow.parameters.map((parameter) => <div key={parameter.name} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", padding: "7px 2px" }}><code style={{ minWidth: 0, flex: 1 }}>{parameter.name}{parameter.required ? " *" : ""}</code><span style={muted}>{parameter.source}{parameter.default ? ` = ${parameter.default}` : ""}</span></div>)}</> : null}
              <SectionLabel>What it does</SectionLabel>
              <p style={muted}>Runs in {targetLabel(workflow.target)}. {workflow.confirm ? "The workflow requires a second confirmation because it can make destructive changes." : "It runs after you review its values and generated command."}</p>
            </div>
            <footer style={{ display: "flex", flexWrap: "wrap", gap: 7, borderTop: "1px solid var(--border)", padding: 10 }}>
              <button type="button" style={primaryButton} onClick={() => sheet.open(workflow)}>Run</button>
              <button type="button" style={button} onClick={() => { const copy = { ...workflow, id: library.newId(), name: `${workflow.name} (copy)`, source: "user" as const }; void library.upsert(copy); setScreen({ view: "detail", id: copy.id }); }}>Duplicate</button>
              {!builtin ? <button type="button" style={button} onClick={() => setScreen({ view: "edit", id: workflow.id })}>Edit</button> : null}
              <button type="button" style={button} onClick={() => { void navigator.clipboard.writeText(JSON.stringify(workflow, null, 2)); setNotice("Workflow JSON copied."); }}>Export</button>
              {!builtin ? <button type="button" style={{ ...button, color: "var(--destructive)" }} onClick={() => { if (window.confirm(`Delete “${workflow.name}”?`)) { void library.remove(workflow.id); setScreen({ view: "list" }); } }}>Delete</button> : null}
              {notice ? <span role="status" style={{ ...muted, alignSelf: "center" }}>{notice}</span> : null}
            </footer>
          </div>
        );
      }
    }

    const favoriteCount = workflows.filter((workflow) =>
      snapshot.favoriteIds.includes(workflow.id),
    ).length;
    const grouped = tag === null && query.trim() === "";
    const groups = grouped
      ? tagCounts
          .map(({ value }) => ({
            label: value,
            workflows: visible.filter(
              (workflow) => (workflow.tags[0] ?? "other") === value,
            ),
          }))
          .filter((group) => group.workflows.length)
      : [{ label: null, workflows: visible }];

    return (
      <div
        data-onboarding-target="workflows.panel"
        data-testid="workflows-panel"
        data-source-plugin="workflows-native"
        className="termco-panel flex h-full min-h-0 flex-col"
      >
        <div className="termco-toolbar flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search workflows"
              placeholder="Search workflows"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            data-onboarding-target="workflows.new"
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1"
            onClick={() => setScreen({ view: "new" })}
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
            New
          </Button>
        </div>
        <div
          aria-label="Workflow categories"
          className="no-scrollbar-deep flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2"
        >
          <Chip active={tag === null} onClick={() => setTag(null)}>All</Chip>
          {favoriteCount ? <Chip active={tag === "favorites"} onClick={() => setTag("favorites")}>★ {favoriteCount}</Chip> : null}
          {tagCounts.map((entry) => (
            <Chip
              key={entry.value}
              active={tag === entry.value}
              onClick={() => setTag(tag === entry.value ? null : entry.value)}
            >
              {entry.value}
              <span className="ml-1 opacity-50">{entry.count}</span>
            </Chip>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3 pt-1">
          {!visible.length ? (
            <div className="px-1 py-8 text-center text-xs text-muted-foreground">
              No workflows match.
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label ?? "results"} className="space-y-1.5">
                {group.label ? (
                  <div className="px-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                    {group.label}
                  </div>
                ) : null}
                {group.workflows.map((workflow) => (
                  <WorkflowRow
                    key={workflow.id}
                    workflow={workflow}
                    favorite={library.isFavorite(workflow.id)}
                    onOpen={() => setScreen({ view: "detail", id: workflow.id })}
                    onRun={() => sheet.open(workflow)}
                    onToggleFavorite={() => void library.toggleFavorite(workflow.id)}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    );
  };
}

function WorkflowForm({
  library,
  initial,
  onCancel,
  onDone,
}: {
  library: WorkflowsLibraryCapability;
  initial?: WorkflowDefinition;
  onCancel(): void;
  onDone(id: string): void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [target, setTarget] = useState<WorkflowTarget["kind"]>(initial?.target.kind ?? "focused_terminal");
  const [confirm, setConfirm] = useState(initial?.confirm ?? false);
  const [parameters, setParameters] = useState<Record<string, { source: WorkflowParamSource; default: string }>>(() => Object.fromEntries((initial?.parameters ?? []).map((parameter) => [parameter.name, { source: parameter.source, default: parameter.default ?? "" }])));
  const placeholders = useMemo(() => library.extractPlaceholders(command), [library, command]);
  const save = async () => {
    if (!name.trim() || !command.trim()) return;
    const definition: WorkflowDefinition = {
      id: initial?.id ?? library.newId(),
      name: name.trim(),
      description: description.trim() || undefined,
      command: command.trim(),
      parameters: placeholders.map((parameter) => {
        const meta = parameters[parameter] ?? { source: "text" as const, default: "" };
        return { name: parameter, source: meta.source, ...(meta.default ? { default: meta.default } : {}), ...(!["text", "cwd"].includes(meta.source) ? { required: true } : {}) };
      }),
      tags: tags.split(",").map((value) => value.trim()).filter(Boolean),
      target: target === "new_terminal" ? { kind: "new_terminal", cwd: "inherit" } : { kind: target } as WorkflowTarget,
      source: initial?.source === "rig" ? "rig" : "user",
      ...(initial?.rigId ? { rigId: initial.rigId } : {}),
      ...(confirm ? { confirm: true } : {}),
    };
    await library.upsert(definition);
    onDone(definition.id);
  };
  return <div data-testid="workflow-form" style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column", gap: 11, overflowY: "auto", padding: 14 }}>
    <strong>{initial ? "Edit workflow" : "Create workflow"}</strong>
    <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} style={input} /></Field>
    <Field label="Description — shown in search results and the detail view"><input value={description} onChange={(event) => setDescription(event.target.value)} style={input} /></Field>
    <Field label={'Command — use {{name}} for parameters'}><textarea rows={4} value={command} onChange={(event) => setCommand(event.target.value)} style={{ ...input, resize: "vertical", fontFamily: "monospace" }} /></Field>
    {placeholders.map((parameter) => { const meta = parameters[parameter] ?? { source: "text" as WorkflowParamSource, default: "" }; return <div key={parameter} style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 130px minmax(80px,1fr)", gap: 6 }}><code style={{ alignSelf: "center" }}>{parameter}</code><select aria-label={`${parameter} source`} value={meta.source} onChange={(event) => setParameters((current) => ({ ...current, [parameter]: { ...meta, source: event.target.value as WorkflowParamSource } }))} style={input}>{PARAM_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select><input aria-label={`${parameter} default`} placeholder="Default" value={meta.default} onChange={(event) => setParameters((current) => ({ ...current, [parameter]: { ...meta, default: event.target.value } }))} style={input} /></div>; })}
    <Field label="Run destination"><select value={target} onChange={(event) => setTarget(event.target.value as WorkflowTarget["kind"])} style={input}>{TARGETS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></Field>
    <Field label="Categories — comma-separated"><input value={tags} onChange={(event) => setTags(event.target.value)} style={input} /></Field>
    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />Ask for a second confirmation before destructive execution</label>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 7 }}><button type="button" style={button} onClick={onCancel}>Cancel</button><button type="button" style={primaryButton} disabled={!name.trim() || !command.trim()} onClick={() => void save()}>{initial ? "Save" : "Create"}</button></div>
  </div>;
}

const PARAM_SOURCES: WorkflowParamSource[] = ["text", "enum", "container", "container_image", "ssh_host", "terminal", "port", "branch", "git_remote", "file", "cwd"];
const TARGETS: Array<{ value: WorkflowTarget["kind"]; label: string }> = [
  { value: "focused_terminal", label: "Focused terminal" },
  { value: "new_terminal", label: "New terminal" },
  { value: "container", label: "Container" },
  { value: "ssh", label: "SSH host" },
  { value: "ai", label: "Send to AI" },
];

function createOverlay(
  library: WorkflowsLibraryCapability,
  sheet: WorkflowSheetController,
  services: Services,
) {
  const subscribePresentation = (listener: () => void) =>
    services.presentation.subscribe(listener);
  const presentationSnapshot = () => services.presentation.snapshot();
  return function WorkflowRunSheet() {
    const state = useSyncExternalStore(sheet.subscribe, sheet.snapshot, sheet.snapshot);
    const presentation = useSyncExternalStore(
      subscribePresentation,
      presentationSnapshot,
      presentationSnapshot,
    );
    if (!state.open || !state.workflow) return null;
    const runtime: WorkflowOverlayRuntime = {
      workspace: presentation.sidebar.workspace,
      rootPath: presentation.sidebar.rootPath,
    };
    return <RunSheetBody key={`${state.workflow.id}:${state.open}`} library={library} sheet={sheet} services={services} runtime={runtime} workflow={state.workflow} prebind={state.prebind} />;
  };
}

function RunSheetBody({ library, sheet, services, runtime, workflow, prebind }: { library: WorkflowsLibraryCapability; sheet: WorkflowSheetController; services: Services; runtime: WorkflowOverlayRuntime; workflow: WorkflowDefinition; prebind: WorkflowValues }) {
  const last = library.lastValues(workflow.id);
  const [values, setValues] = useState<WorkflowValues>(() => Object.fromEntries(workflow.parameters.map((parameter) => [parameter.name, prebind[parameter.name] ?? last?.[parameter.name] ?? parameter.default ?? (parameter.source === "cwd" ? runtime.rootPath ?? "" : "")])));
  const [targetKind, setTargetKind] = useState(workflow.target.kind);
  const [running, setRunning] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");
  const command = chainWorkflow(workflow, values);
  const missing = library.missingRequired(workflow, values);
  const run = async () => {
    if (missing.length) { setError(`Fill in: ${missing.join(", ")}`); return; }
    if (workflow.confirm && !armed) { setArmed(true); return; }
    setRunning(true); setError("");
    try {
      let target = resolveTarget(targetKind, workflow.target);
      if (target.kind === "container" && !target.ref) {
        const selected = workflow.parameters.find(
          (parameter) => parameter.source === "container",
        )?.name;
        target = { ...target, ref: selected ? values[selected] : undefined };
      }
      if (target.kind === "ssh" && !target.ref) {
        const selected = workflow.parameters.find(
          (parameter) => parameter.source === "ssh_host",
        )?.name;
        target = { ...target, ref: selected ? values[selected] : undefined };
      }
      const outcome = await library.run(workflow, values, target);
      if (!outcome.ok) throw new Error(outcome.error);
      await library.recordRun({ workflowId: workflow.id, command: outcome.command, values, target, at: Date.now() });
      sheet.close();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setRunning(false); }
  };
  return <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) sheet.close(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "rgba(0,0,0,.48)", padding: 18 }}>
    <section role="dialog" aria-modal="true" aria-label={`Run ${workflow.name}`} data-testid="workflow-run-sheet" style={{ display: "flex", width: "min(720px, calc(100vw - 36px))", maxHeight: "min(720px, calc(100vh - 36px))", flexDirection: "column", overflow: "hidden", border: "1px solid var(--border)", borderRadius: 12, background: "var(--background)", color: "var(--foreground)", boxShadow: "0 20px 70px rgba(0,0,0,.35)" }}>
      <header style={{ borderBottom: "1px solid var(--border)", padding: "14px 16px" }}><span style={{ ...muted, textTransform: "uppercase", letterSpacing: ".1em" }}>Run workflow</span><strong style={{ display: "block", marginTop: 3, fontSize: 16 }}>{workflow.name}</strong>{workflow.description ? <span style={muted}>{workflow.description}</span> : null}</header>
      <div style={{ display: "grid", minHeight: 0, gridTemplateColumns: "minmax(0,1fr) minmax(220px,.7fr)", overflow: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>{workflow.parameters.filter((parameter) => parameter.source !== "cwd").map((parameter) => <ParameterField key={parameter.name} parameter={parameter} value={values[parameter.name] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [parameter.name]: value }))} runtime={runtime} services={services} />)}{workflow.parameters.every((parameter) => parameter.source === "cwd") ? <span style={muted}>This workflow does not need input.</span> : null}</div>
        <aside style={{ borderLeft: "1px solid var(--border)", background: "var(--muted)", padding: 16 }}><Field label="Run in"><select value={targetKind} onChange={(event) => setTargetKind(event.target.value as WorkflowTarget["kind"])} style={input}>{targetOptions(workflow).map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></Field><SectionLabel>Generated command</SectionLabel><code style={{ display: "block", maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", border: "1px solid var(--border)", borderRadius: 7, background: "var(--background)", padding: 9, fontSize: 11 }}>{command || "—"}</code>{workflow.confirm ? <p style={{ color: "#d97706", fontSize: 11 }}>This workflow can make destructive changes. Running requires a second click.</p> : null}</aside>
      </div>
      <footer style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", padding: "11px 16px" }}><span role="alert" style={{ minWidth: 0, flex: 1, color: error ? "var(--destructive)" : "var(--muted-foreground)", fontSize: 11 }}>{error || (missing.length ? `${missing.length} required value(s) missing` : "Ready to run")}</span><button type="button" style={button} onClick={sheet.close}>Cancel</button><button type="button" disabled={running} style={primaryButton} onClick={() => void run()}>{workflow.confirm && armed ? "Confirm & run" : running ? "Running…" : "Run"}</button></footer>
    </section>
  </div>;
}

function ParameterField({ parameter, value, onChange, runtime, services }: { parameter: WorkflowParameter; value: string; onChange(value: string): void; runtime: WorkflowOverlayRuntime; services: Services }) {
  const options = useResourceOptions(parameter.source, runtime, services);
  return <Field label={`${parameter.name}${parameter.required ? " *" : ""}${parameter.description ? ` — ${parameter.description}` : ""}`}>{parameter.source === "enum" ? <select value={value} onChange={(event) => onChange(event.target.value)} style={input}><option value="">Select…</option>{(parameter.enumValues ?? []).map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select> : <><input list={`workflow-options-${parameter.name}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={parameter.default ?? resourceHint(parameter.source)} style={input} />{options.length ? <datalist id={`workflow-options-${parameter.name}`}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}{option.hint ? ` — ${option.hint}` : ""}</option>)}</datalist> : null}</>}</Field>;
}

function useResourceOptions(source: WorkflowParamSource, runtime: WorkflowOverlayRuntime, services: Services): ResourceOption[] {
  const [options, setOptions] = useState<ResourceOption[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const provider = services.parameterSources.resolve(source);
        const next = provider
          ? await provider.options({
              source,
              workspace: runtime.workspace,
              rootPath: runtime.rootPath,
            })
          : [];
        if (active) setOptions([...next]);
      } catch { if (active) setOptions([]); }
    };
    void load();
    const unsubscribe = services.parameterSources.subscribe(() => void load());
    return () => { active = false; unsubscribe(); };
  }, [source, runtime.rootPath, runtime.workspace, services]);
  return options;
}

function targetOptions(workflow: WorkflowDefinition) {
  const options = [
    { value: "focused_terminal", label: "Focused terminal" },
    { value: "new_terminal", label: "New terminal" },
  ];
  if (workflow.target.kind === "container") options.unshift({ value: "container", label: "Container" });
  if (workflow.target.kind === "ssh") options.unshift({ value: "ssh", label: "SSH host" });
  if (workflow.target.kind === "ai") options.push({ value: "ai", label: "Send to AI" });
  return options;
}

function resolveTarget(kind: WorkflowTarget["kind"], original: WorkflowTarget): WorkflowTarget {
  if (kind === "new_terminal") return { kind, cwd: "inherit" };
  if (kind === "container" && original.kind === "container") return original;
  if (kind === "ssh" && original.kind === "ssh") return original;
  return { kind } as WorkflowTarget;
}

function targetLabel(target: WorkflowTarget): string {
  return target.kind === "new_terminal" ? "a new terminal" : target.kind === "container" ? "a selected container" : target.kind === "ssh" ? "a shared SSH connection" : target.kind === "ai" ? "the AI agent" : "the focused terminal";
}

function resourceHint(source: WorkflowParamSource): string {
  return source === "container" ? "container id or name" : source === "container_image" ? "image reference" : source === "ssh_host" ? "SSH host" : source === "port" ? "port" : source === "branch" ? "branch" : source === "file" ? "path" : source;
}

function Chip({ active, onClick, children }: { active: boolean; onClick(): void; children: unknown }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/60 text-muted-foreground hover:bg-accent/50",
      )}
    >
      {children as never}
    </button>
  );
}

function WorkflowRow({
  workflow,
  favorite,
  onOpen,
  onRun,
  onToggleFavorite,
}: {
  workflow: WorkflowDefinition;
  favorite: boolean;
  onOpen(): void;
  onRun(): void;
  onToggleFavorite(): void;
}) {
  const liveSources = new Set([
    "container",
    "container_image",
    "ssh_host",
    "terminal",
    "port",
    "branch",
    "git_remote",
  ]);
  const hasLive = workflow.parameters.some((parameter) =>
    liveSources.has(parameter.source),
  );
  return (
    <article className="group/row flex items-center gap-1.5 rounded-lg border border-border/60 bg-card pr-1.5 shadow-[var(--shadow-control)] transition-colors hover:border-[var(--hairline-strong)]">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 py-2 pl-2.5 text-left"
      >
        <span className="flex w-full items-center gap-1.5">
          {favorite ? (
            <HugeiconsIcon icon={StarIcon} size={11} className="shrink-0 text-amber-500" />
          ) : null}
          <span className="truncate text-xs font-medium leading-tight">
            {workflow.name}
          </span>
          {hasLive ? (
            <span className="shrink-0 rounded bg-primary/10 px-1 text-xs font-medium text-primary">
              live
            </span>
          ) : null}
        </span>
        <code className="w-full truncate font-mono text-xs text-muted-foreground/80">
          {workflow.command}
        </code>
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        title="Favourite"
        aria-label={`Favourite ${workflow.name}`}
        className={cn(
          "shrink-0 rounded-md p-1 transition-opacity",
          favorite
            ? "text-amber-500"
            : "text-muted-foreground opacity-0 hover:text-foreground group-hover/row:opacity-100",
        )}
      >
        <HugeiconsIcon icon={StarIcon} size={14} />
      </button>
      <button
        data-onboarding-target="workflows.run"
        type="button"
        onClick={onRun}
        title="Run"
        aria-label={`Run ${workflow.name}`}
        className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <HugeiconsIcon icon={PlayIcon} size={12} />
        Run
      </button>
    </article>
  );
}
function Field({ label, children }: { label: string; children: unknown }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}><span style={muted}>{label}</span>{children as never}</label>;
}
function SectionLabel({ children }: { children: unknown }) {
  return <div style={{ ...muted, margin: "14px 0 6px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>{children as never}</div>;
}

export function createWorkflowUi(
  library: WorkflowsLibraryCapability,
  sheet: WorkflowSheetController,
  services: Services,
): {
  dock: UiAiDockViewContribution;
  overlay: UiOverlayContribution;
  commands: UiCommandSourceContribution;
} {
  return {
    dock: createWorkflowDock(library, sheet),
    overlay: createWorkflowOverlay(library, sheet, services),
    commands: createWorkflowCommands(library, sheet),
  };
}

export function createWorkflowDock(
  library: WorkflowsLibraryCapability,
  sheet: WorkflowSheetController,
): UiAiDockViewContribution {
  return {
    id: "workflows",
    label: "Workflows",
    description: "Search, explain, author, and run reusable command workflows.",
    order: 30,
    Component: createPanel(library, sheet),
  };
}

export function createWorkflowOverlay(
  library: WorkflowsLibraryCapability,
  sheet: WorkflowSheetController,
  services: Services,
): UiOverlayContribution {
  return {
    id: "workflows-run-sheet",
    label: "Run workflow",
    description: "Collects parameters, previews the command, confirms destructive actions, and executes through shared providers.",
    order: 30,
    Component: createOverlay(library, sheet, services),
  };
}

export function createWorkflowCommands(
  library: WorkflowsLibraryCapability,
  sheet: WorkflowSheetController,
): UiCommandSourceContribution {
  return {
    id: "workflows",
    order: 70,
    subscribe: library.subscribe,
    commands(runtime) {
      return library.visible(runtime.activeRigId()).map((workflow) => ({
        id: `workflow.${workflow.id}`,
        title: workflow.name,
        description: workflow.description ?? `Run ${workflow.command}`,
        group: "Workflows",
        keywords: [...workflow.tags, "workflow", "run", "command"],
        trailing: workflow.tags[0],
        run: () => sheet.open(workflow),
      }));
    },
  };
}
