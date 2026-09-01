/** Source-owned by the coding-agent-native plugin.
 * The coding-agents surface: a single-column list ↔ detail flow that fits the
 * AI dock's narrow column. The roster lists live runs; "New" opens the spawn
 * form; "History" browses persisted backend sessions.
 * Opening a run OR a saved session pushes to the native transcript.
 */

import type { UiAiDockRuntime } from "@termco/ui-dock-base";
import { useEffect, useState } from "react";
import { pendingAgentRunId, usePendingAgentRun } from "../lib/openRunDetail";
import type { AgentBackend } from "../lib/protocol";
import {
  HISTORY_PREFIX,
  useCodingAgentsStore,
} from "../store/codingAgentsStore";
import { AgentRoster } from "./AgentRoster";
import { AgentRunDetail } from "./AgentRunDetail";
import { McpAgentAccessPanel } from "./McpAgentAccessPanel";
import { NewAgentForm } from "./NewAgentForm";
import { SessionHistory } from "./SessionHistory";
import {
  configureCodingAgentOnboardingRoster,
  notifyCodingAgentPanelVisible,
} from "../onboarding";

/** Remembered agent toggle so the panel reopens on the last-used agent. */
function initialBackend(): AgentBackend {
  try {
    const v = localStorage.getItem("coding-agents:backend");
    if (v === "claude" || v === "codex") return v;
  } catch {
    /* no localStorage */
  }
  return "claude";
}

type Screen =
  | { view: "roster" }
  | { view: "detail"; runId: string; from: "roster" | "history" }
  | { view: "new" }
  | { view: "history" }
  | { view: "connect" };

export function CodingAgentsPanel({
  runtime,
}: {
  runtime: UiAiDockRuntime;
}) {
  const defaultCwd = runtime.cwd;
  const workspace = runtime.workspace;
  const runs = useCodingAgentsStore((s) => s.runs);
  const activeRigId = runtime.activeRigId;
  const rigName = runtime.activeRigName;
  const setActive = useCodingAgentsStore((s) => s.setActive);
  const rehydrate = useCodingAgentsStore((s) => s.rehydrate);
  const openSession = useCodingAgentsStore((s) => s.openSession);
  const resumeSession = useCodingAgentsStore((s) => s.resumeSession);
  const loadSessions = useCodingAgentsStore((s) => s.loadSessions);
  const [screen, setScreen] = useState<Screen>({ view: "roster" });
  const [backend, setBackendState] = useState<AgentBackend>(initialBackend);
  useEffect(() => {
    notifyCodingAgentPanelVisible();
  }, []);
  useEffect(
    () => configureCodingAgentOnboardingRoster(() => setScreen({ view: "roster" })),
    [],
  );
  const setBackend = (b: AgentBackend) => {
    setBackendState(b);
    try {
      localStorage.setItem("coding-agents:backend", b);
    } catch {
      /* ignore */
    }
  };

  // Re-attach to any runs the main-process driver still holds (e.g. after a
  // renderer reload) so they reappear in the roster and keep streaming.
  useEffect(() => {
    void rehydrate();
  }, [rehydrate]);

  // Preload the complete history so the roster's per-agent history section is
  // populated the moment the panel opens. An ssh rig lists the sessions that
  // live on ITS host (rig change → reload). Key the effect on a STABLE string
  // (not the workspace object reference) so an incidental env re-creation on an
  // unrelated rig update can't refire the slow ssh round-trip.
  const workspaceKey =
    workspace?.kind === "ssh"
      ? `ssh:${workspace.connectionId}`
      : (workspace?.kind ?? "local");
  // biome-ignore lint/correctness/useExhaustiveDependencies: workspaceKey is the stable identity of `workspace`
  useEffect(() => {
    void loadSessions(workspace);
  }, [loadSessions, workspaceKey]);

  // If the shown run disappears (removed elsewhere), fall back to the roster.
  useEffect(() => {
    if (screen.view === "detail" && !runs[screen.runId]) {
      setScreen({ view: "roster" });
    }
  }, [screen, runs]);

  // A pending open-run request (trajectory "Jump to run") — consume it once
  // the run is known; requests expire on their own (openRunDetail.ts).
  const pendingRun = usePendingAgentRun((s) => s.pending);
  const clearPendingRun = usePendingAgentRun((s) => s.clear);
  useEffect(() => {
    const runId = pendingAgentRunId(pendingRun);
    if (!runId) return;
    if (!runs[runId]) return; // keep pending until rehydrate lands (or TTL)
    clearPendingRun();
    setActive(runId);
    setScreen({ view: "detail", runId, from: "roster" });
  }, [pendingRun, runs, setActive, clearPendingRun]);

  // Switching rigs should CHANGE the agents panel: if you're viewing a run
  // that belongs to a DIFFERENT rig than the one you just switched to, snap
  // back to this rig's roster (the run keeps executing — you'll find it under
  // "Other rigs", and its attention still pings the dock badge). A history
  // detail (no rigId) is left alone. Depend ONLY on the active rig + the shown
  // run id (NOT the whole `runs` map, which churns on every streamed token —
  // reading the run via getState keeps this effect off the hot path).
  const shownRunId = screen.view === "detail" ? screen.runId : null;
  useEffect(() => {
    if (!shownRunId || !activeRigId) return;
    const run = useCodingAgentsStore.getState().runs[shownRunId];
    if (run?.rigId && run.rigId !== activeRigId) {
      setScreen({ view: "roster" });
    }
  }, [activeRigId, shownRunId]);

  const openHistorySession = (summary: Parameters<typeof openSession>[0]) => {
    void openSession(summary).then((runId) =>
      setScreen({ view: "detail", runId, from: "history" }),
    );
  };

  if (screen.view === "new") {
    return (
      <NewAgentForm
        defaultCwd={defaultCwd}
        defaultBackend={backend}
        workspace={workspace}
        rigId={activeRigId ?? undefined}
        onCancel={() => setScreen({ view: "roster" })}
        onStarted={(runId) => {
          setActive(runId);
          setScreen({ view: "detail", runId, from: "roster" });
        }}
      />
    );
  }

  if (screen.view === "history") {
    return (
      <SessionHistory
        backend={backend}
        workspace={workspace}
        onBack={() => setScreen({ view: "roster" })}
        onOpen={openHistorySession}
      />
    );
  }

  if (screen.view === "connect") {
    return <McpAgentAccessPanel onBack={() => setScreen({ view: "roster" })} />;
  }

  if (screen.view === "detail") {
    const run = runs[screen.runId];
    if (run) {
      const back = screen.from;
      const isHistory = screen.runId.startsWith(HISTORY_PREFIX);
      return (
        <AgentRunDetail
          run={run}
          activeRigId={activeRigId}
          activeRigName={rigName}
          onBack={() =>
            setScreen({ view: back === "history" ? "history" : "roster" })
          }
          onOpenTerminal={
            run.cwd
              ? () => void runtime.openTerminal(run.cwd ?? "", run.workspace)
              : undefined
          }
          onResume={
            isHistory
              ? (text) => {
                  void resumeSession(screen.runId, text, workspace).then(
                    (newId) => {
                      if (newId)
                        setScreen({
                          view: "detail",
                          runId: newId,
                          from: "history",
                        });
                    },
                  );
                }
              : undefined
          }
        />
      );
    }
  }

  return (
    <AgentRoster
      backend={backend}
      activeRigId={activeRigId}
      onBackend={setBackend}
      onNew={() => setScreen({ view: "new" })}
      onHistory={() => setScreen({ view: "history" })}
      onConnect={() => setScreen({ view: "connect" })}
      onOpen={(runId) => {
        setActive(runId);
        setScreen({ view: "detail", runId, from: "roster" });
      }}
      onOpenSession={openHistorySession}
    />
  );
}
