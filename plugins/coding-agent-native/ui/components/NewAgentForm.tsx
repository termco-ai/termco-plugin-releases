/** Source-owned by the coding-agent-native plugin.
 * Spawn form for a new run: pick a backend (rich card per CLI, disabled when the
 * binary isn't available), confirm the working directory, and describe the task
 * — with example tasks to seed the prompt. Mirrors the app's card/field styling.
 */

import ui from "@termco/ui";
import {
  ArrowLeft01Icon,
  Folder01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { listBackends } from "../lib/client";
import type {
  AgentBackend,
  AgentPermissionMode,
  AgentWorkspace,
  BackendInfo,
} from "../lib/protocol";
import { useCodingAgentsStore } from "../store/codingAgentsStore";
import { MODEL_CATALOG, PERMISSION_MODES } from "./agentSettings";
import { BackendAvatar, backendMeta } from "./backendMeta";
import { workspaceLabel } from "./runMeta";

const { Button, cn } = ui;

const EXAMPLES = [
  "Review the auth module for bugs and edge cases",
  "Add tests for the untested files in src/lib",
  "Fix the failing CI checks on this branch",
];

export function NewAgentForm({
  defaultCwd,
  defaultBackend,
  workspace,
  rigId,
  onStarted,
  onCancel,
}: {
  defaultCwd: string;
  defaultBackend?: AgentBackend;
  workspace: AgentWorkspace;
  rigId?: string;
  onStarted: (runId: string) => void;
  onCancel: () => void;
}) {
  const startRun = useCodingAgentsStore((s) => s.startRun);
  const [backend, setBackend] = useState<AgentBackend>(
    defaultBackend ?? "claude",
  );
  const [cwd, setCwd] = useState(defaultCwd);
  const [prompt, setPrompt] = useState("");
  const [permissionMode, setPermissionMode] =
    useState<AgentPermissionMode>("acceptEdits");
  const [model, setModel] = useState<string | undefined>(undefined);
  const [backends, setBackends] = useState<BackendInfo[]>([]);

  // A model choice is backend-specific; reset to Default when the backend flips.
  useEffect(() => {
    setModel(undefined);
  }, [backend]);

  const [reprobing, setReprobing] = useState(false);

  useEffect(() => {
    let alive = true;
    listBackends(workspace)
      .then((b) => alive && setBackends(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [workspace]);

  const availability = (b: AgentBackend) =>
    backends.find((x) => x.backend === b)?.available ?? true;

  // Where the run will execute — the SAME workspace/cwd handed to startRun, so
  // this line can't drift from reality. `null` label = local.
  const hostLabel = workspaceLabel(workspace ?? undefined);
  const anyUnavailable = backends.some((b) => !b.available);

  /** "Check again" after installing a CLI: bust the probe cache, re-list. */
  const reprobe = async () => {
    setReprobing(true);
    try {
      setBackends(await listBackends(workspace, { refresh: true }));
    } catch {
      /* keep the previous list */
    } finally {
      setReprobing(false);
    }
  };

  const start = async () => {
    const task = prompt.trim();
    if (!task) return;
    const runId = await startRun({
      backend,
      prompt: task,
      cwd: cwd.trim() || defaultCwd,
      workspace,
      rigId,
      permissionMode,
      model,
      now: performance.now(),
    });
    onStarted(runId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onCancel}
          aria-label="Back"
          title="Back"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
        </Button>
        <span className="text-sm font-semibold text-foreground">
          New coding agent
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Backend picker */}
        <div className="space-y-1.5">
          <FieldLabel>Backend</FieldLabel>
          <div data-onboarding-target="coding-agents.backend" className="grid grid-cols-2 gap-2">
            {(["claude", "codex"] as const).map((b) => {
              const meta = backendMeta(b);
              const enabled = availability(b);
              const selected = backend === b;
              return (
                <button
                  key={b}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setBackend(b)}
                  title={
                    enabled
                      ? meta.label
                      : hostLabel
                        ? `${meta.label} is not installed on ${hostLabel}`
                        : `${meta.label} CLI was not found locally`
                  }
                  className={cn(
                    "relative flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-left transition-colors",
                    selected
                      ? "border-primary"
                      : "border-border/60 hover:border-border",
                    !enabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <BackendAvatar backend={b} size={30} />
                    <span className="text-sm font-semibold text-foreground">
                      {meta.label}
                    </span>
                    {selected && (
                      <span className="ml-auto grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          size={9}
                          strokeWidth={3.5}
                        />
                      </span>
                    )}
                  </div>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {enabled
                      ? meta.blurb
                      : hostLabel
                        ? `Not installed on ${hostLabel}`
                        : "CLI not found locally"}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Installed it just now? Re-probe without an app restart. */}
          {anyUnavailable && (
            <button
              type="button"
              onClick={() => void reprobe()}
              disabled={reprobing}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {reprobing ? "Checking…" : "Check again"}
            </button>
          )}
        </div>

        {/* Working directory */}
        <div className="space-y-1.5">
          <FieldLabel>Working directory</FieldLabel>
          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 focus-within:ring-1 focus-within:ring-ring/40">
            <HugeiconsIcon
              icon={Folder01Icon}
              size={13}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-xs text-foreground focus-visible:outline-none"
            />
          </div>
          {/* Derived from the SAME workspace passed to startRun — cannot drift. */}
          <div className="text-xs text-muted-foreground/80">
            {hostLabel ? (
              <>
                Runs on{" "}
                <span className="font-mono font-medium text-sky-600 dark:text-sky-400">
                  {hostLabel}
                </span>
              </>
            ) : (
              "Runs locally"
            )}
          </div>
        </div>

        {/* Model — hidden when the backend offers only Default */}
        {MODEL_CATALOG[backend].length > 1 && (
          <div className="space-y-1.5">
            <FieldLabel>Model</FieldLabel>
            <div className="flex gap-1.5">
              {MODEL_CATALOG[backend].map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center rounded-lg border px-1.5 py-1.5 text-xs font-medium transition-colors",
                    model === m.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Autonomy / permission mode */}
        <div className="space-y-1.5">
          <FieldLabel>Autonomy</FieldLabel>
          <div data-onboarding-target="coding-agents.autonomy" className="flex gap-1.5">
            {PERMISSION_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPermissionMode(m.id)}
                title={m.hint}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-xs font-medium transition-colors",
                  permissionMode === m.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:bg-accent/50",
                )}
              >
                <span className={cn("size-1.5 rounded-full", m.dot)} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task */}
        <div className="space-y-1.5">
          <FieldLabel>Task</FieldLabel>
          <textarea
            data-onboarding-target="coding-agents.task"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void start();
              }
            }}
            rows={6}
            // biome-ignore lint/a11y/noAutofocus: the task field is the sole purpose of this form screen
            autoFocus
            placeholder="Describe what the agent should do…"
            className="w-full resize-none rounded-lg border border-border/60 bg-background px-2.5 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border/50 px-3 py-2">
        <span className="text-xs text-muted-foreground/70">⌘⏎ to start</span>
        <Button
          type="button"
          size="sm"
          onClick={start}
          disabled={!prompt.trim()}
        >
          Start agent
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  );
}
