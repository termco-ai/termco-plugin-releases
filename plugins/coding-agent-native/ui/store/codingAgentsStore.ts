/** Source-owned by the coding-agent-native plugin.
 * Coding-agents store: the renderer-side registry of native coding-agent runs
 * each holding a transcript folded from the driver's
 * normalized event stream. Runs are keyed by a client-generated `runId` — fully
 * decoupled from the terminal `leafId` model the old managed-agent flow used.
 *
 * The store owns run *state*; the driver lives in the main process and streams
 * events back over IPC (see ../lib/client). Actions are thin: they mutate local
 * state optimistically (e.g. appending a user follow-up) and invoke IPC.
 */

import { create } from "zustand";
import type { TurnOverrides } from "../lib/client";
import {
  abortAgentRun,
  approveAgentTool,
  archiveAgentRun,
  endAgentRun,
  forgetAgentRun,
  listAllSessions,
  listRuns,
  loadSessionEvents,
  renameAgentRun,
  resubscribeRun,
  sendAgentInput,
  setSessionMeta,
  startRun as startRunIpc,
} from "../lib/client";
import type {
  AgentBackend,
  AgentEffort,
  AgentEvent,
  AgentPermissionMode,
  AgentRunStatus,
  AgentSessionSummary,
  AgentWorkspace,
} from "../lib/protocol";
import {
  appendUserMessage,
  applyEvent,
  createTranscript,
  resolveApproval,
  type TranscriptState,
} from "../lib/transcript";

/** A run plus display metadata the roster needs at a glance. */
export type AgentRunView = TranscriptState & {
  backend: AgentBackend;
  title: string;
  permissionMode: AgentPermissionMode;
  /** Reasoning effort applied to the NEXT turn (mid-session adjustable). */
  effort?: AgentEffort;
  /** The model ALIAS the user picked (e.g. "opus") — distinct from the resolved
   * `model` the backend reports in its `session` event. Drives the control-row
   * selection and the per-turn `--model` override. */
  requestedModel?: string;
  createdAt: number;
  /** A follow-up the user submitted while the run was busy — auto-sent when the
   * current turn completes. */
  queuedInput?: string;
  /** Background activity the user hasn't looked at yet (finished a turn, needs
   * approval, or errored while another run was open) — drives the roster dot
   * and the dock tab badge. Cleared when the run is opened. */
  unseen?: boolean;
  /** The rig env the run executes in — retained so the "open terminal" button
   * (and a remote resume) can target the right host. (`cwd` comes from
   * TranscriptState.) */
  workspace?: AgentWorkspace;
  /** The rig this run belongs to — the roster is rig-scoped, so the panel
   * shows the active rig's runs and marks others clearly. */
  rigId?: string;
};

type StartArgs = {
  backend: AgentBackend;
  prompt: string;
  cwd: string;
  model?: string;
  permissionMode?: AgentPermissionMode;
  effort?: AgentEffort;
  supervisorChatId?: string;
  /** Resume a prior backend session instead of starting fresh (--resume). */
  resumeSessionId?: string;
  /** The rig env to run in — ssh runs remotely (see useActiveAgentContext). */
  workspace?: AgentWorkspace;
  /** Rig selected by the host runtime at the moment the run is created. */
  rigId?: string;
  /** Injected so the store stays deterministic in tests. */
  now?: number;
  runId?: string;
};

/** Id prefix marking a read-only run folded from a saved session transcript. */
export const HISTORY_PREFIX = "hist:";

type CodingAgentsState = {
  runs: Record<string, AgentRunView>;
  /** The run currently shown in the detail pane. */
  activeRunId: string | null;
  /** Past coding-agent sessions on disk for the history browser. */
  sessions: AgentSessionSummary[];
  /** Why the last `loadSessions` failed (unreachable ssh host) — the history
   * browser shows this banner instead of a lying empty list. */
  sessionsError: string | null;
  /** A session list load is in flight (localized spinner; never blocks the
   * run roster or the rest of the app). */
  sessionsLoading: boolean;
  /** The rig identity the current `sessions` belong to — distinguishes a rig
   * SWITCH (clear stale + spinner) from a same-rig REFRESH (keep, no flash). */
  sessionsWorkspaceKey: string | null;

  startRun: (args: StartArgs) => Promise<string>;
  /** Load complete cross-backend history into `sessions`.
   * An ssh `workspace` lists the sessions living on that host. */
  loadSessions: (workspace?: AgentWorkspace) => Promise<void>;
  /** Open a saved session read-only (folds its transcript); returns the runId. */
  openSession: (summary: AgentSessionSummary) => Promise<string>;
  /** Continue a read-only history run: spawn a live run that resumes its backend
   * session (seeding the prior transcript for context). Returns the new runId. */
  resumeSession: (
    historyRunId: string,
    text: string,
    workspace: AgentWorkspace,
  ) => Promise<string | null>;
  /** Rebuild runs the driver still holds after a renderer reload (idempotent). */
  rehydrate: () => Promise<void>;
  sendInput: (runId: string, text: string) => Promise<void>;
  /** Change the run's model / permission mode / effort for the NEXT turn
   * (mid-session control row). Applied to the driver on the next `sendInput`. */
  setRunSettings: (
    runId: string,
    patch: {
      model?: string;
      permissionMode?: AgentPermissionMode;
      effort?: AgentEffort;
    },
  ) => void;
  /** Set or clear the queued follow-up (edit/remove from the queued card). */
  setQueued: (runId: string, text: string) => void;
  abort: (runId: string) => Promise<void>;
  end: (runId: string) => Promise<void>;
  /** Answer a pending tool-approval request (from AiToolApproval). `always`
   * remembers the allow so matching future calls in the run auto-approve. */
  respondApproval: (
    runId: string,
    approvalId: string,
    allow: boolean,
    always?: boolean,
  ) => Promise<void>;
  remove: (runId: string) => void;
  /** Rename a run (or a read-only history session). */
  rename: (runId: string, title: string) => Promise<void>;
  /** Archive a run (hide from the roster) or a history session. */
  archive: (runId: string) => Promise<void>;
  /** Fork a run at a message into a NEW run that resumes the same backend
   * session, seeded with messages 0..messageIndex, then continues with `text`
   * (the possibly-edited message). The original run is kept. Returns the new id. */
  forkRun: (
    runId: string,
    messageIndex: number,
    text: string,
    workspace: AgentWorkspace,
  ) => Promise<string | null>;
  setActive: (runId: string | null) => void;

  /** Apply one streamed event to a run (exposed for the bridge + tests). */
  ingest: (runId: string, event: AgentEvent) => void;
};

let runCounter = 0;
/** Monotonic guard so a slow (ssh) session load that resolves after the user
 * has switched rigs again is ignored instead of clobbering the current view. */
let sessionsLoadSeq = 0;

/** A stable identity for a rig env — used to tell a rig SWITCH (clear stale
 * history + spinner) from a same-rig REFRESH (keep the list, no flash). */
function workspaceKeyOf(workspace: AgentWorkspace | undefined): string {
  return workspace?.kind === "ssh"
    ? `ssh:${workspace.connectionId}`
    : (workspace?.kind ?? "local");
}

/** The per-turn overrides carried from a run's current control-row settings.
 * `model: null` (not yet resolved) becomes undefined so the driver keeps its
 * own value; permission mode always rides along (it's always set). */
function overridesFrom(run: AgentRunView): TurnOverrides {
  return {
    model: run.requestedModel,
    permissionMode: run.permissionMode,
    effort: run.effort,
  };
}

/** Derive a short human title from the first line of the prompt. */
function titleFromPrompt(prompt: string): string {
  const firstLine = prompt.trim().split("\n")[0] ?? "";
  return firstLine.length > 48
    ? `${firstLine.slice(0, 48)}…`
    : firstLine || "New agent";
}

export const useCodingAgentsStore = create<CodingAgentsState>((set, get) => ({
  runs: {},
  activeRunId: null,
  sessions: [],
  sessionsError: null,
  sessionsLoading: false,
  sessionsWorkspaceKey: null,

  loadSessions: async (workspace) => {
    // A rig switch triggers this; for an SSH rig it's a remote round-trip (slow
    // + can hang). Keep it NON-BLOCKING and LOCALIZED: the run roster renders
    // instantly from local state; only the history area loads.
    //   • A DIFFERENT rig → drop the previous rig's sessions IMMEDIATELY (never
    //     show the wrong rig's history) and show the localized spinner.
    //   • The SAME rig (a refresh) → keep the current list (no flash).
    //   • A monotonic sequence ignores a slow reply that lands after the user
    //     has switched again (it must not clobber the newer rig's view).
    const seq = ++sessionsLoadSeq;
    const key = workspaceKeyOf(workspace);
    if (key !== get().sessionsWorkspaceKey) {
      set({ sessions: [], sessionsError: null, sessionsLoading: true });
    } else {
      set({ sessionsLoading: true });
    }
    try {
      const sessions = await listAllSessions(workspace);
      if (seq !== sessionsLoadSeq) return; // superseded by a newer switch
      set({
        sessions: sessions.filter((s) => !s.archived),
        sessionsError: null,
        sessionsLoading: false,
        sessionsWorkspaceKey: key,
      });
    } catch (err) {
      if (seq !== sessionsLoadSeq) return;
      // Unreachable ssh host — show the reason, never an empty "success".
      set({
        sessions: [],
        sessionsError: err instanceof Error ? err.message : String(err),
        sessionsLoading: false,
        sessionsWorkspaceKey: key,
      });
    }
  },

  openSession: async (summary) => {
    const runId = `${HISTORY_PREFIX}${summary.backend}:${summary.sessionId}`;
    if (get().runs[runId]) {
      set({ activeRunId: runId });
      return runId;
    }
    const events = await loadSessionEvents(summary).catch(
      () => [] as AgentEvent[],
    );
    let view: AgentRunView = {
      ...createTranscript(runId),
      backend: summary.backend,
      title: summary.name,
      permissionMode: "default",
      createdAt: summary.updatedAt,
      cwd: summary.cwd,
      // Where the session lives (remote listing) — resume continues THERE.
      workspace: summary.workspace,
    };
    for (const ev of events) view = { ...view, ...applyEvent(view, ev) };
    // A saved session is read-only; mark it done, pin its real session id, and
    // restore cwd (the folded events don't carry a `session` event → cwd would
    // otherwise be null, breaking resume + the terminal button).
    view = {
      ...view,
      status: "done",
      sessionId: summary.sessionId,
      cwd: summary.cwd,
    };
    set((s) => ({ runs: { ...s.runs, [runId]: view }, activeRunId: runId }));
    return runId;
  },

  resumeSession: async (historyRunId, text, workspace) => {
    const trimmed = text.trim();
    const hist = get().runs[historyRunId];
    if (!trimmed || !hist?.sessionId) return null;
    // Resume where the session actually lives: a history run opened from a
    // remote host carries that workspace; only workspace-less (local-disk)
    // sessions fall back to the caller's active rig.
    const target = hist.workspace ?? workspace;
    runCounter += 1;
    const runId = `run-${runCounter}-${hist.createdAt}`;
    // Seed the prior transcript for visual continuity, then append the new turn.
    // Live message ids are run-…:mN, distinct from the seeded hist:…:mN ids.
    const base: AgentRunView = {
      ...createTranscript(runId),
      backend: hist.backend,
      title: hist.title,
      permissionMode: "default",
      createdAt: hist.createdAt,
      cwd: hist.cwd,
      workspace: target,
      rigId: hist.rigId,
      sessionId: hist.sessionId,
      messages: hist.messages,
    };
    const view = { ...base, ...appendUserMessage(base, trimmed) };
    set((s) => ({ runs: { ...s.runs, [runId]: view }, activeRunId: runId }));

    await startRunIpc(
      {
        runId,
        backend: hist.backend,
        prompt: trimmed,
        cwd: hist.cwd ?? "",
        resumeSessionId: hist.sessionId,
        workspace: target,
        rigId: hist.rigId,
      },
      (event) => get().ingest(runId, event),
    );
    return runId;
  },

  startRun: async (args) => {
    runCounter += 1;
    const runId = args.runId ?? `run-${runCounter}-${args.now ?? 0}`;
    const view: AgentRunView = {
      ...createTranscript(runId),
      backend: args.backend,
      title: titleFromPrompt(args.prompt),
      permissionMode: args.permissionMode ?? "default",
      effort: args.effort,
      requestedModel: args.model,
      createdAt: args.now ?? 0,
      cwd: args.cwd,
      workspace: args.workspace,
      rigId: args.rigId,
    };
    set((s) => ({
      runs: { ...s.runs, [runId]: view },
      activeRunId: runId,
    }));

    await startRunIpc(
      {
        runId,
        backend: args.backend,
        prompt: args.prompt,
        cwd: args.cwd,
        model: args.model,
        permissionMode: args.permissionMode,
        effort: args.effort,
        resumeSessionId: args.resumeSessionId,
        supervisorChatId: args.supervisorChatId,
        workspace: args.workspace,
        rigId: args.rigId,
      },
      (event) => get().ingest(runId, event),
    );
    return runId;
  },

  rehydrate: async () => {
    const summaries = await listRuns().catch(() => []);
    for (let i = 0; i < summaries.length; i++) {
      const s = summaries[i];
      if (s.archived) continue; // archived runs are hidden from the roster
      const existing = get().runs[s.runId];
      if (existing) {
        if (s.live === false) {
          // Hot replacement can destroy the main-process driver while the
          // renderer store survives. A persisted busy status then becomes a
          // lie: there is no process left to stop or approval left to answer.
          const persistedStatus = s.status ?? existing.status;
          set((state) => {
            const current = state.runs[s.runId];
            if (!current) return state;
            return {
              runs: {
                ...state.runs,
                [s.runId]: {
                  ...current,
                  status: isRunBusy(persistedStatus)
                    ? "idle"
                    : persistedStatus,
                  pendingApprovalId: null,
                  queuedInput: undefined,
                },
              },
            };
          });
        }
        continue;
      }
      const view: AgentRunView = {
        ...createTranscript(s.runId),
        sessionId: s.sessionId,
        backend: s.backend,
        title: titleFromPrompt(s.title ?? s.prompt),
        // Carried on the summary so a reload doesn't reset the mode; the
        // resolved model repopulates from the replayed `session` event.
        permissionMode: s.permissionMode ?? "default",
        effort: s.effort,
        model: s.model ?? null,
        // Where the run executes — persisted across restarts so a follow-up
        // (revive) targets the same host+cwd, never the currently-active rig.
        // (cwd would otherwise only arrive via a replayed `session` event,
        // which persisted-only runs never get.)
        cwd: s.cwd,
        workspace: s.workspace,
        rigId: s.rigId,
        createdAt: i, // preserve driver order; new runs sort above these
      };
      set((state) => ({ runs: { ...state.runs, [s.runId]: view } }));
      if (s.live === false) {
        // A persisted run recovered after an app restart — the driver no longer
        // holds it. Reopen its transcript from the backend session file
        // otherwise leave a metadata-only roster row with its last status.
        if (s.sessionId && s.projectSlug) {
          const events = await loadSessionEvents({
            backend: s.backend,
            sessionId: s.sessionId,
            projectSlug: s.projectSlug,
            name: "",
            cwd: s.cwd,
            updatedAt: 0,
            messageCount: 0,
          }).catch(() => [] as AgentEvent[]);
          for (const ev of events) get().ingest(s.runId, ev);
        }
        set((state) => {
          const cur = state.runs[s.runId];
          if (!cur) return state;
          return {
            runs: {
              ...state.runs,
              [s.runId]: {
                ...cur,
                status: isRunBusy(s.status ?? "done") ? "idle" : (s.status ?? "done"),
                pendingApprovalId: null,
              },
            },
          };
        });
        continue;
      }
      // A live driver run → replay its buffered events.
      await resubscribeRun(s.runId, (event) => get().ingest(s.runId, event));
    }
  },

  sendInput: async (runId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const run = get().runs[runId];
    if (!run) return;
    // While a turn is running the single-shot CLI can't take input — queue it
    // instead of dropping; `ingest` auto-sends it when the turn goes idle.
    if (isRunBusy(run.status)) {
      set((s) => {
        const cur = s.runs[runId];
        if (!cur) return s;
        return {
          runs: { ...s.runs, [runId]: { ...cur, queuedInput: trimmed } },
        };
      });
      return;
    }
    // Carry the run's current control-row settings as per-turn overrides so the
    // driver applies any mid-session model/mode/effort change to this turn.
    const { ok } = await sendAgentInput(runId, trimmed, overridesFrom(run));
    if (!ok) {
      // The driver doesn't hold this run (app restarted since it finished) —
      // revive it under the SAME runId by resuming its backend session, in the
      // run's PERSISTED workspace/cwd (never the currently-active rig: an ssh
      // run must continue on its host).
      if (!run.sessionId) return;
      set((s) => {
        const cur = s.runs[runId];
        if (!cur) return s;
        return {
          runs: {
            ...s.runs,
            [runId]: { ...cur, ...appendUserMessage(cur, trimmed) },
          },
        };
      });
      await startRunIpc(
        {
          runId,
          backend: run.backend,
          prompt: trimmed,
          cwd: run.cwd ?? "",
          model: run.requestedModel,
          permissionMode: run.permissionMode,
          effort: run.effort,
          resumeSessionId: run.sessionId,
          workspace: run.workspace,
          rigId: run.rigId,
        },
        (event) => get().ingest(runId, event),
      );
      return;
    }
    // The driver accepted it → optimistically show it; the response streams in.
    set((s) => {
      const cur = s.runs[runId];
      if (!cur) return s;
      return {
        runs: {
          ...s.runs,
          [runId]: { ...cur, ...appendUserMessage(cur, trimmed) },
        },
      };
    });
  },

  setRunSettings: (runId, patch) =>
    set((s) => {
      const cur = s.runs[runId];
      if (!cur) return s;
      return {
        runs: {
          ...s.runs,
          [runId]: {
            ...cur,
            ...(patch.model !== undefined
              ? { requestedModel: patch.model || undefined }
              : {}),
            ...(patch.permissionMode !== undefined
              ? { permissionMode: patch.permissionMode }
              : {}),
            ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
          },
        },
      };
    }),

  setQueued: (runId, text) =>
    set((s) => {
      const cur = s.runs[runId];
      if (!cur) return s;
      const t = text.trim();
      return {
        runs: { ...s.runs, [runId]: { ...cur, queuedInput: t || undefined } },
      };
    }),

  abort: async (runId) => {
    await abortAgentRun(runId);
  },

  end: async (runId) => {
    await endAgentRun(runId);
  },

  respondApproval: async (runId, approvalId, allow, always) => {
    // Optimistically clear the block; the backend then streams the tool (allow)
    // or continues past it (deny).
    set((s) => {
      const run = s.runs[runId];
      if (!run || run.pendingApprovalId !== approvalId) return s;
      return {
        runs: { ...s.runs, [runId]: { ...run, ...resolveApproval(run) } },
      };
    });
    await approveAgentTool(runId, approvalId, allow, { always });
  },

  remove: (runId) => {
    const run = get().runs[runId];
    if (!run) return;
    // Stop the backend so we never orphan its `Run` (and any live child) in the
    // main process; a busy run is aborted, an idle one is ended cleanly.
    void (isRunBusy(run.status) ? abortAgentRun(runId) : endAgentRun(runId));
    // Also drop it from on-disk history so it doesn't reappear after a restart.
    void forgetAgentRun(runId);
    set((s) => {
      if (!s.runs[runId]) return s;
      const runs = { ...s.runs };
      delete runs[runId];
      const activeRunId =
        s.activeRunId === runId
          ? (Object.keys(runs)[0] ?? null)
          : s.activeRunId;
      return { runs, activeRunId };
    });
  },

  rename: async (runId, title) => {
    const t = title.trim();
    const run = get().runs[runId];
    if (!run || !t) return;
    set((s) => {
      const cur = s.runs[runId];
      return cur ? { runs: { ...s.runs, [runId]: { ...cur, title: t } } } : s;
    });
    if (runId.startsWith(HISTORY_PREFIX) && run.sessionId) {
      await setSessionMeta(run.backend, run.sessionId, { title: t }).catch(
        () => null,
      );
      // Reflect the rename in the loaded history list too.
      set((s) => ({
        sessions: s.sessions.map((x) =>
          x.backend === run.backend && x.sessionId === run.sessionId
            ? { ...x, name: t }
            : x,
        ),
      }));
    } else {
      await renameAgentRun(runId, t).catch(() => null);
    }
  },

  archive: async (runId) => {
    const run = get().runs[runId];
    if (!run) return;
    if (runId.startsWith(HISTORY_PREFIX) && run.sessionId) {
      await setSessionMeta(run.backend, run.sessionId, {
        archived: true,
      }).catch(() => null);
      set((s) => ({
        sessions: s.sessions.filter(
          (x) => !(x.backend === run.backend && x.sessionId === run.sessionId),
        ),
      }));
    } else {
      await archiveAgentRun(runId, true).catch(() => null);
    }
    // Hide it from the roster (a live run keeps running in the background).
    set((s) => {
      if (!s.runs[runId]) return s;
      const runs = { ...s.runs };
      delete runs[runId];
      const activeRunId =
        s.activeRunId === runId
          ? (Object.keys(runs)[0] ?? null)
          : s.activeRunId;
      return { runs, activeRunId };
    });
  },

  forkRun: async (runId, messageIndex, text, workspace) => {
    const src = get().runs[runId];
    const trimmed = text.trim();
    if (!src?.sessionId || !trimmed) return null;
    // Seed messages 0..messageIndex-1 (the edited/continued message is re-added
    // as the new turn), then resume the SAME backend session so context carries.
    // The original run is kept — this is a branch. (Concurrent use of both
    // branches isn't supported: they share one CLI session id.)
    runCounter += 1;
    const newId = `run-${runCounter}-${src.createdAt}`;
    const base: AgentRunView = {
      ...createTranscript(newId),
      backend: src.backend,
      title: src.title,
      permissionMode: src.permissionMode,
      effort: src.effort,
      requestedModel: src.requestedModel,
      createdAt: src.createdAt,
      cwd: src.cwd,
      workspace,
      rigId: src.rigId,
      sessionId: src.sessionId,
      messages: src.messages.slice(0, Math.max(0, messageIndex)),
    };
    const view = { ...base, ...appendUserMessage(base, trimmed) };
    set((s) => ({ runs: { ...s.runs, [newId]: view }, activeRunId: newId }));

    await startRunIpc(
      {
        runId: newId,
        backend: src.backend,
        prompt: trimmed,
        cwd: src.cwd ?? "",
        model: src.requestedModel,
        permissionMode: src.permissionMode,
        effort: src.effort,
        resumeSessionId: src.sessionId,
        workspace,
        rigId: src.rigId,
      },
      (event) => get().ingest(newId, event),
    );
    return newId;
  },

  setActive: (runId) =>
    set((s) => {
      // Opening a run clears its unseen-activity flag.
      if (runId && s.runs[runId]?.unseen) {
        return {
          activeRunId: runId,
          runs: { ...s.runs, [runId]: { ...s.runs[runId], unseen: false } },
        };
      }
      return { activeRunId: runId };
    }),

  ingest: (runId, event) => {
    const prev = get().runs[runId];
    if (!prev) return;
    const next = applyEvent(prev, event);
    // Attention-worthy background activity while another run is open.
    const attention =
      event.type === "approval-request" ||
      event.type === "turn-end" ||
      event.type === "exit" ||
      (event.type === "error" && event.fatal === true);
    const markUnseen = attention && get().activeRunId !== runId;
    set((s) => {
      const cur = s.runs[runId];
      if (!cur) return s;
      return {
        runs: {
          ...s.runs,
          [runId]: { ...cur, ...next, ...(markUnseen ? { unseen: true } : {}) },
        },
      };
    });
    // The moment a turn completes, flush a queued follow-up (if any).
    if (prev.status !== "idle" && next.status === "idle") {
      const cur = get().runs[runId];
      const queued = cur?.queuedInput;
      if (cur && queued) {
        set((s) => {
          const c = s.runs[runId];
          if (!c) return s;
          return {
            runs: { ...s.runs, [runId]: { ...c, queuedInput: undefined } },
          };
        });
        void get().sendInput(runId, queued);
      }
    }
  },
}));

/** Sort a runs record newest-first for the roster. Call inside a `useMemo`
 * keyed on the record — never as a raw zustand selector, which would return a
 * fresh array each render and loop. */
export function sortRuns(runs: Record<string, AgentRunView>): AgentRunView[] {
  return Object.values(runs).sort((a, b) => b.createdAt - a.createdAt);
}

/** Number of runs with unseen background activity — for the dock tab badge. */
export function countUnseen(runs: Record<string, AgentRunView>): number {
  let n = 0;
  for (const r of Object.values(runs)) if (r.unseen) n++;
  return n;
}

/** Whether a run is still doing work (roster spinner). */
export function isRunBusy(status: AgentRunStatus): boolean {
  return (
    status === "starting" ||
    status === "running" ||
    status === "awaiting-approval"
  );
}
