/**
 * The chat store: a single Zustand store holding the live AI capability,
 * API keys, selected model, panel/mini UI state, pending selections, agent-run
 * metadata, and the persisted session list. Session mutations coordinate with
 * the chat registry (cached `Chat` instances) and the debounced persistence
 * queue in `./chatRegistry`.
 */

import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import { SessionId } from "@termco/session-base";
import { create } from "zustand";
import {
  DEFAULT_RIG_ID,
  deriveTitle,
  loadActiveByRig,
  newSessionId,
  type SessionMeta,
  saveActiveByRig,
} from "../sessions";
import {
  ensureOwnedSession,
  findOwnedMessageSeq,
  forkOwnedSession,
  forkOwnedRerun,
  listOwnedSessions,
  pushRecentModel,
  readOwnedSession,
  removeOwnedSession,
  resendOwnedSessionMessage,
  selectedDefaultModelId,
  setOwnedSessionRig,
  setOwnedSessionTitle,
} from "../runtime";
import { EMPTY_PROVIDER_KEYS, IDLE_META, NOOP_LIVE } from "./constants";
import { chats, seedMessages, toolContexts } from "./registry";
import type { StoreState } from "./types";

export const useChatStore = create<StoreState>((set, get) => {
  // Point `activeSessionId` at an EXISTING session, seeding its restored
  // messages first so `makeChat` builds the `Chat` with its history. Seeding
  // must happen before `set(activeSessionId)` — that render builds/consumes the
  // Chat. A session whose Chat is already cached (or seeded) needs no reload.
  //
  // Restore from the canonical session surface on every activation path —
  // hydrate, rig switch, session switch — or old chats open empty.
  const seedThenActivate = (id: string, rigId: string): void => {
    const doSet = () => {
      const activeByRig = { ...get().activeByRig, [rigId]: id };
      set({ activeSessionId: id, activeByRig, agentMeta: IDLE_META });
      void saveActiveByRig(activeByRig);
    };
    if (chats.has(id) || seedMessages.has(id)) {
      doSet();
      return;
    }
    void readOwnedSession(id)
      .then((restored) => {
        if (restored.messages.length > 0 && !chats.has(id)) {
          seedMessages.set(id, [...restored.messages]);
        }
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== id) return session;
            const { compaction: _discardedCompaction, compactionPolicy: _discardedPolicy, ...base } = session;
            return {
              ...base,
              title: restored.title,
              rigId: restored.header.rigId ?? rigId,
              createdAt: restored.header.createdAt,
              updatedAt: restored.updatedAt,
              ...(restored.compaction === undefined
                ? {}
                : { compaction: restored.compaction }),
              ...(restored.compactionPolicy === undefined
                ? {}
                : { compactionPolicy: restored.compactionPolicy }),
            };
          }),
        }));
        doSet();
      }, (error: unknown) => {
        set({
          agentMeta: {
            ...IDLE_META,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          },
        });
        doSet();
      });
  };

  // Resolve (or create) the active session for a rig and point
  // `activeSessionId` at it. Shared by hydrate and rig switches.
  const ensureActiveForRig = (rigId: string): void => {
    const state = get();
    const current = state.activeByRig[rigId];
    const valid =
      current != null &&
      state.sessions.some((s) => s.id === current && s.rigId === rigId);
    if (valid) {
      if (state.activeSessionId !== current) seedThenActivate(current, rigId);
      return;
    }
    // Newest existing session for this rig (sessions are newest-first), else
    // a fresh "New chat" tagged to the rig.
    const existing = state.sessions.find((s) => s.rigId === rigId);
    if (existing) {
      seedThenActivate(existing.id, rigId);
      return;
    }
    const fresh: SessionMeta = {
      id: newSessionId(),
      title: "New chat",
      rigId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const sessions = [fresh, ...state.sessions];
    const activeByRig = { ...state.activeByRig, [rigId]: fresh.id };
    set({
      sessions,
      activeSessionId: fresh.id,
      activeByRig,
      agentMeta: IDLE_META,
    });
    void ensureOwnedSession(fresh.id, {
      title: fresh.title,
      rigId: fresh.rigId,
      createdAt: fresh.createdAt,
    });
    void saveActiveByRig(activeByRig);
  };

  return {
    live: NOOP_LIVE,
    setLive: (live) => set({ live }),

    approvalResponder: null,
    setApprovalResponder: (fn) => set({ approvalResponder: fn }),
    respondToApproval: (approvalId, approved) => {
      const fn = get().approvalResponder;
      if (fn) fn(approvalId, approved);
    },

    apiKeys: { ...EMPTY_PROVIDER_KEYS },
    setApiKeys: (keys) => set({ apiKeys: keys }),
    setApiKey: (provider, key) => {
      set({ apiKeys: { ...get().apiKeys, [provider]: key } });
    },

    keysLoaded: false,
    setKeysLoaded: (v) => set({ keysLoaded: v }),

    customEndpointKeys: {},
    setCustomEndpointKeys: (keys) => set({ customEndpointKeys: keys }),

    selectedModelId: selectedDefaultModelId(),
    setSelectedModelId: (id) => {
      set({ selectedModelId: id });
      void pushRecentModel(id);
    },

    // The dock (`panelOpen`) and the floating mini window (`mini.open`) are two
    // views of one chat and must never be open at once. Every "open" transition
    // routes through these setters, so enforcing exclusivity here closes every
    // double-open path (submit, approvals, focusInput/attachSelection, buttons).
    mini: { open: false },
    openMini: () => set({ mini: { open: true }, panelOpen: false }),
    closeMini: () => set({ mini: { open: false } }),
    toggleMini: () =>
      set((s) =>
        s.mini.open
          ? { mini: { open: false } }
          : { mini: { open: true }, panelOpen: false },
      ),

    panelOpen: false,
    openPanel: () => set({ panelOpen: true, mini: { open: false } }),
    closePanel: () => set({ panelOpen: false }),
    togglePanel: () =>
      set((s) =>
        s.panelOpen
          ? { panelOpen: false }
          : { panelOpen: true, mini: { open: false } },
      ),

    focusSignal: 0,
    pendingPrefill: null,
    focusInput: (prefill = null) =>
      set((s) => ({
        panelOpen: true,
        mini: { open: false },
        focusSignal: s.focusSignal + 1,
        pendingPrefill: prefill ?? null,
      })),
    consumePrefill: () => {
      const v = get().pendingPrefill;
      if (v != null) set({ pendingPrefill: null });
      return v;
    },

    pendingSelections: [],
    attachSelection: (text, source) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const id = `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      set((s) => ({
        panelOpen: true,
        mini: { open: false },
        focusSignal: s.focusSignal + 1,
        pendingSelections: [
          ...s.pendingSelections,
          { id, text: trimmed, source },
        ],
      }));
    },
    consumeSelections: () => {
      const v = get().pendingSelections;
      if (v.length > 0) set({ pendingSelections: [] });
      return v;
    },

    agentMeta: IDLE_META,
    patchAgentMeta: (patch) =>
      set((s) => ({ agentMeta: { ...s.agentMeta, ...patch } })),
    resetAgentMeta: () => set({ agentMeta: IDLE_META }),

    sessionsHydrated: false,
    sessions: [],
    activeSessionId: null,
    currentRigId: DEFAULT_RIG_ID,
    activeByRig: {},

    hydrateSessions: async () => {
      if (get().sessionsHydrated) return;
      const [sessions, activeByRig] = await Promise.all([
        listOwnedSessions(),
        loadActiveByRig(),
      ]);
      set({ sessions: [...sessions], activeByRig, sessionsHydrated: true });
      // Resolve (or create) the active session for whatever rig is current.
      ensureActiveForRig(get().currentRigId);
    },

    setCurrentRig: (rigId) => {
      if (get().currentRigId !== rigId) set({ currentRigId: rigId });
      // Before hydration completes, just record the rig; hydrate resolves it.
      if (!get().sessionsHydrated) return;
      ensureActiveForRig(rigId);
    },

    newSession: () => {
      const rigId = get().currentRigId;
      const id = newSessionId();
      const meta: SessionMeta = {
        id,
        title: "New chat",
        rigId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const next = [meta, ...get().sessions];
      const activeByRig = { ...get().activeByRig, [rigId]: id };
      set({
        sessions: next,
        activeSessionId: id,
        activeByRig,
        agentMeta: IDLE_META,
      });
      void ensureOwnedSession(id, {
        title: meta.title,
        rigId: meta.rigId,
        createdAt: meta.createdAt,
      });
      void saveActiveByRig(activeByRig);
      return id;
    },

    // The canonical session owner resolves and commits the boundary before the
    // child is published to presentation state.
    forkSession: async ({ sourceSessionId, boundary, title, origin = "fork", extra }) => {
      const srcId = sourceSessionId ?? get().activeSessionId;
      if (!srcId) throw new Error("No active canonical session is available to fork");
      const result = await forkOwnedSession({
        sessionId: SessionId(srcId),
        boundary,
        ...(title === undefined ? {} : { title }),
        origin,
      });
      await aiSessionsCapability.openSession(result.childSessionId);
      if (extra) get().patchSession(result.childSessionId, extra);
      return result.childSessionId;
    },

    branchFrom: async (messageId) => {
      const srcId = get().activeSessionId;
      if (!srcId) return null;
      const messages = chats.get(srcId)?.messages ?? seedMessages.get(srcId);
      if (!messages) return null;
      const idx = messages.findIndex(
        (message) =>
          typeof message === "object" &&
          message !== null &&
          (message as { id?: unknown }).id === messageId,
      );
      if (idx < 0) return null;
      const eventSeq = await findOwnedMessageSeq(srcId, messageId);
      if (eventSeq === undefined) return null;
      return get().forkSession({
        sourceSessionId: srcId,
        boundary: { kind: "surface-node", seq: eventSeq },
        title: deriveTitle(messages.slice(0, idx + 1)) || "Branch",
        origin: "fork",
      });
    },

    patchSession: (id, patch) => {
      const next = get().sessions.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
      );
      set({ sessions: next });
    },

    switchSession: (id) => {
      if (get().activeSessionId === id) return;
      const rigId = get().currentRigId;
      // Only switch within the current rig (the picker is rig-filtered).
      if (!get().sessions.some((s) => s.id === id && s.rigId === rigId)) {
        return;
      }
      // Lazily seed the chat with persisted messages the first time we open it;
      // subsequent switches reuse the cached Chat instance.
      seedThenActivate(id, rigId);
    },

    deleteSession: async (id) => {
      const target = get().sessions.find((s) => s.id === id);
      const rigId = target?.rigId ?? get().currentRigId;
      const remaining = get().sessions.filter((s) => s.id !== id);
      if (chats.has(id)) {
        const { stopOwnedChat } = await import("../chatRuntime");
        await stopOwnedChat(id);
      }
      await removeOwnedSession(id);
      chats.delete(id);
      seedMessages.delete(id);
      toolContexts.delete(id);
      const activeByRig = { ...get().activeByRig };
      let nextSessions = remaining;
      const wasActiveInRig = activeByRig[rigId] === id;

      if (wasActiveInRig) {
        const replacement = remaining.find((s) => s.rigId === rigId);
        if (replacement) {
          activeByRig[rigId] = replacement.id;
        } else {
          // Last chat in this rig — keep the rig chattable with a fresh one.
          const fresh: SessionMeta = {
            id: newSessionId(),
            title: "New chat",
            rigId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          nextSessions = [fresh, ...remaining];
          activeByRig[rigId] = fresh.id;
        }
      }

      const activeSessionId =
        rigId === get().currentRigId
          ? (activeByRig[rigId] ?? get().activeSessionId)
          : get().activeSessionId;

      set({ sessions: nextSessions, activeByRig, activeSessionId });
      const active = nextSessions.find((session) => session.id === activeSessionId);
      if (active) {
        void ensureOwnedSession(active.id, {
          title: active.title,
          rigId: active.rigId,
          createdAt: active.createdAt,
        });
      }
      void saveActiveByRig(activeByRig);
    },

    reassignRig: (fromRigId, toRigId = DEFAULT_RIG_ID) => {
      if (fromRigId === toRigId) return;
      const next = get().sessions.map((s) =>
        s.rigId === fromRigId ? { ...s, rigId: toRigId } : s,
      );
      for (const session of next) {
        if (get().sessions.find((candidate) => candidate.id === session.id)?.rigId === fromRigId) {
          void setOwnedSessionRig(session.id, toRigId);
        }
      }
      const activeByRig = { ...get().activeByRig };
      delete activeByRig[fromRigId];
      set({ sessions: next, activeByRig });
      void saveActiveByRig(activeByRig);
    },

    renameSession: (id, title) => {
      const next = get().sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
      );
      set({ sessions: next });
      const session = next.find((candidate) => candidate.id === id);
      if (session) {
        void setOwnedSessionTitle({
          sessionId: id,
          title,
          rigId: session.rigId,
          createdAt: session.createdAt,
          source: "user",
        });
      }
    },

    snapshotAvailable: false,
    setSnapshotAvailable: (v) => set({ snapshotAvailable: v }),

    persistMessages: (id, messages) => {
      // Message durability lives in session history; this action only keeps the derived
      // session title in step with the conversation.
      if (messages.length === 0) return;
      // Update zustand session list only when the derived title actually
      // changes — otherwise we'd rewrite the sessions array (and trigger
      // re-renders + a store write) on every token.
      const sessions = get().sessions;
      const meta = sessions.find((s) => s.id === id);
      if (!meta) return;
      const isUntitled = !meta.title || meta.title === "New chat";
      if (!isUntitled) return;
      const nextTitle = deriveTitle(messages);
      if (nextTitle === meta.title) return;
      const next = sessions.map((s) =>
        s.id === id ? { ...s, title: nextTitle, updatedAt: Date.now() } : s,
      );
      set({ sessions: next });
      void setOwnedSessionTitle({
        sessionId: id,
        title: nextTitle,
        rigId: meta.rigId,
        createdAt: meta.createdAt,
        source: "system",
      });
    },
  };
});

let publicRevision = 0;
let publicSnapshot = (() => {
  const state = useChatStore.getState();
  return {
    revision: publicRevision,
    panelOpen: state.panelOpen,
    miniOpen: state.mini.open,
    selectedModelId: state.selectedModelId,
    activeSessionId: state.activeSessionId,
    agent: {
      status: state.agentMeta.status,
      step: state.agentMeta.step,
      error: state.agentMeta.error,
    },
  };
})();

const refreshPublicSnapshot = () => {
  const state = useChatStore.getState();
  publicRevision += 1;
  publicSnapshot = {
    revision: publicRevision,
    panelOpen: state.panelOpen,
    miniOpen: state.mini.open,
    selectedModelId: state.selectedModelId,
    activeSessionId: state.activeSessionId,
    agent: {
      status: state.agentMeta.status,
      step: state.agentMeta.step,
      error: state.agentMeta.error,
    },
  };
};
useChatStore.subscribe(refreshPublicSnapshot);

function publicComposerAvailable(): boolean {
  const state = useChatStore.getState();
  return [
    ...Object.values(state.apiKeys),
    ...Object.values(state.customEndpointKeys),
  ].some(Boolean);
}

export const aiSessionsCapability: AiSessionsCapability = {
  snapshot: () => publicSnapshot,
  subscribe(listener) {
    return useChatStore.subscribe(listener);
  },
  openPanel: () => useChatStore.getState().openPanel(),
  closePanel: () => useChatStore.getState().closePanel(),
  togglePanel: () => {
    const state = useChatStore.getState();
    if (state.panelOpen || state.mini.open) {
      state.closePanel();
      state.closeMini();
      return;
    }
    if (publicComposerAvailable()) state.focusInput(null);
    else state.openPanel();
  },
  openMini: () => useChatStore.getState().openMini(),
  closeMini: () => useChatStore.getState().closeMini(),
  focusInput: (prefill) => {
    const state = useChatStore.getState();
    if (publicComposerAvailable()) state.focusInput(prefill);
    else state.openPanel();
  },
  attachSelection: (text, source) => {
    const state = useChatStore.getState();
    state.openPanel();
    if (publicComposerAvailable()) state.attachSelection(text, source);
  },
  attachFile(path) {
    const state = useChatStore.getState();
    state.openPanel();
    if (!publicComposerAvailable()) return;
    window.dispatchEvent(
      new CustomEvent<string>("termco:ai-attach-file", { detail: path }),
    );
    state.focusInput(null);
  },
  attachImage(input) {
    useChatStore.getState().openPanel();
    window.dispatchEvent(
      new CustomEvent("termco:ai-attach-image", { detail: input }),
    );
  },
  async openSession(sessionId) {
    const restored = await readOwnedSession(sessionId);
    const id = String(restored.header.id);
    const rigId = restored.rigId;
    if (chats.has(id)) {
      const { stopOwnedChat } = await import("../chatRuntime");
      await stopOwnedChat(id);
    }
    chats.delete(id);
    seedMessages.set(id, [...restored.messages]);
    const current = useChatStore.getState();
    const meta: SessionMeta = {
      id,
      title: restored.title,
      rigId,
      createdAt: restored.header.createdAt,
      updatedAt: restored.updatedAt,
      ...(restored.compaction === undefined
        ? {}
        : { compaction: restored.compaction }),
      ...(restored.compactionPolicy === undefined
        ? {}
        : { compactionPolicy: restored.compactionPolicy }),
    };
    const sessions = [
      meta,
      ...current.sessions.filter((candidate) => candidate.id !== id),
    ].sort((left, right) => right.updatedAt - left.updatedAt);
    const activeByRig = { ...current.activeByRig, [rigId]: id };
    useChatStore.setState({
      sessions,
      activeSessionId: id,
      currentRigId: rigId,
      activeByRig,
      agentMeta: IDLE_META,
      panelOpen: true,
      mini: { open: false },
    });
    void saveActiveByRig(activeByRig);
  },
  async rerunFrom(input) {
    const rerun = await forkOwnedRerun(input);
    await aiSessionsCapability.openSession(rerun.childSessionId);
    await resendOwnedSessionMessage(rerun.childSessionId, rerun.message);
    return { childSessionId: rerun.childSessionId };
  },
  sessionContext(sessionId) {
    const session = useChatStore
      .getState()
      .sessions.find((candidate) => candidate.id === sessionId);
    return session ? { rigId: session.rigId } : null;
  },
  async sendMessage(sessionId, text) {
    const { sendOwnedMessage } = await import("../chatRuntime");
    await sendOwnedMessage(sessionId, text);
  },
  respondToApproval: (approvalId, approved) =>
    useChatStore.getState().respondToApproval(approvalId, approved),
};
