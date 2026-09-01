import {
  type AiSessionsCapability,
  type AiSessionsHostControl,
  type AiSessionsSnapshot,
} from "@termco/ai-sessions-base";
import type {
  UiWorkspaceComposerCapability,
  UiWorkspaceComposerHostControl,
  UiWorkspaceComposerSnapshot,
} from "@termco/ui-workspace-base";
import { createElement } from "react";

class AiSessionHostUnavailableError extends Error {
  readonly code = "AI_SESSION_HOST_UNAVAILABLE";

  constructor() {
    super("AI session execution is unavailable");
    this.name = "AiSessionHostUnavailableError";
  }
}

const EMPTY_SESSION_SNAPSHOT: AiSessionsSnapshot = {
  revision: 0,
  panelOpen: false,
  miniOpen: false,
  selectedModelId: "",
  activeSessionId: null,
  agent: { status: "idle", step: null, error: null },
};

const EMPTY_COMPOSER_SNAPSHOT: UiWorkspaceComposerSnapshot = {
  revision: 0,
  available: false,
  hostedElsewhere: false,
};

export function createSessionStateFacades(): {
  sessions: AiSessionsCapability;
  sessionHost: AiSessionsHostControl;
  composer: UiWorkspaceComposerCapability;
  composerHost: UiWorkspaceComposerHostControl;
} {
  let sessionDelegate: AiSessionsCapability | undefined;
  let sessionSnapshot = EMPTY_SESSION_SNAPSHOT;
  let sessionRevision = 0;
  let offSessionDelegate = () => {};
  const sessionListeners = new Set<() => void>();
  const publishSessions = () => {
    for (const listener of sessionListeners) listener();
  };
  const refreshSessions = () => {
    const next = sessionDelegate?.snapshot();
    if (!next) return;
    sessionSnapshot = { ...next, revision: ++sessionRevision };
    publishSessions();
  };

  const sessions: AiSessionsCapability = {
    snapshot: () => sessionSnapshot,
    subscribe(listener) {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
    openPanel: () => sessionDelegate?.openPanel(),
    closePanel: () => sessionDelegate?.closePanel(),
    togglePanel: () => sessionDelegate?.togglePanel(),
    openMini: () => sessionDelegate?.openMini(),
    closeMini: () => sessionDelegate?.closeMini(),
    focusInput: (prefill) => sessionDelegate?.focusInput(prefill),
    attachSelection: (value, source) =>
      sessionDelegate?.attachSelection(value, source),
    attachFile: (path) => sessionDelegate?.attachFile(path),
    attachImage: (input) => sessionDelegate?.attachImage(input),
    async openSession(sessionId) {
      if (!sessionDelegate) throw new AiSessionHostUnavailableError();
      await sessionDelegate.openSession(sessionId);
    },
    async rerunFrom(input) {
      if (!sessionDelegate) throw new AiSessionHostUnavailableError();
      return sessionDelegate.rerunFrom(input);
    },
    sessionContext: (sessionId) =>
      sessionDelegate?.sessionContext(sessionId) ?? null,
    async sendMessage(sessionId, text) {
      if (!sessionDelegate) throw new AiSessionHostUnavailableError();
      await sessionDelegate.sendMessage(sessionId, text);
    },
    respondToApproval: (approvalId, approved) =>
      sessionDelegate?.respondToApproval(approvalId, approved),
  };

  const sessionHost: AiSessionsHostControl = {
    bind(delegate) {
      offSessionDelegate();
      sessionDelegate = delegate;
      offSessionDelegate = delegate.subscribe(refreshSessions);
      refreshSessions();
      let disposed = false;
      return () => {
        if (disposed || sessionDelegate !== delegate) return;
        disposed = true;
        offSessionDelegate();
        offSessionDelegate = () => {};
        sessionDelegate = undefined;
        sessionSnapshot = { ...sessionSnapshot, revision: ++sessionRevision };
        publishSessions();
      };
    },
  };

  let composerDelegate: UiWorkspaceComposerCapability | undefined;
  let composerSnapshot = EMPTY_COMPOSER_SNAPSHOT;
  let composerRevision = 0;
  let offComposerDelegate = () => {};
  const composerListeners = new Set<() => void>();
  const publishComposer = () => {
    for (const listener of composerListeners) listener();
  };
  const refreshComposer = () => {
    const next = composerDelegate?.snapshot();
    if (!next) return;
    composerSnapshot = { ...next, revision: ++composerRevision };
    publishComposer();
  };
  const EmptyRegion: UiWorkspaceComposerCapability["Region"] = () => null;
  const composer: UiWorkspaceComposerCapability = {
    snapshot: () => composerSnapshot,
    subscribe(listener) {
      composerListeners.add(listener);
      return () => composerListeners.delete(listener);
    },
    focus: () => composerDelegate?.focus(),
    Region(props) {
      const Region = composerDelegate?.Region ?? EmptyRegion;
      return createElement(Region, props);
    },
  };
  const composerHost: UiWorkspaceComposerHostControl = {
    bind(delegate) {
      offComposerDelegate();
      composerDelegate = delegate;
      offComposerDelegate = delegate.subscribe(refreshComposer);
      refreshComposer();
      let disposed = false;
      return () => {
        if (disposed || composerDelegate !== delegate) return;
        disposed = true;
        offComposerDelegate();
        offComposerDelegate = () => {};
        composerDelegate = undefined;
        composerSnapshot = {
          revision: ++composerRevision,
          available: false,
          hostedElsewhere: false,
        };
        publishComposer();
      };
    },
  };

  return { sessions, sessionHost, composer, composerHost };
}
