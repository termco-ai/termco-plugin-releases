// @vitest-environment jsdom
import type { GitChangedFile, GitStatusSnapshot } from "@termco/git-base";
import { native } from "../../runtime";
import {
  invalidateDiff,
  invalidateRepoDiffs,
} from "../../diffInvalidation";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceControlSummary } from "../useSourceControl";
import type { SourceControlEntry } from "./types";
import { useSourceControlPanel } from "./useSourceControlPanel";

const runtimeMocks = vi.hoisted(() => ({
  native: {
    gitStage: vi.fn(),
    gitUnstage: vi.fn(),
    gitDiscard: vi.fn(),
    gitCommit: vi.fn(),
    gitDiff: vi.fn(),
  },
  generate: vi.fn(),
  session: {
    revision: 0,
    panelOpen: false,
    miniOpen: false,
    selectedModelId: "gpt-5.4-mini",
    activeSessionId: null,
    agent: {
      status: "idle" as "idle" | "thinking" | "streaming" | "error",
      step: null as string | null,
      error: null as string | null,
    },
  },
  configured: ["openai"] as string[],
  models: [
    { id: "openai", models: [{ id: "gpt-5.4-mini" }] },
    { id: "lmstudio", models: [{ id: "lmstudio-local" }] },
    { id: "mlx", models: [{ id: "mlx-local" }] },
    { id: "ollama", models: [{ id: "ollama-local" }] },
    {
      id: "openai-compatible",
      models: [{ id: "openai-compatible-custom" }],
    },
    { id: "openrouter", models: [{ id: "openrouter-custom" }] },
  ],
}));

vi.mock("../../runtime", () => ({
  native: runtimeMocks.native,
  sourceControlRuntime: () => ({
    inference: { generate: runtimeMocks.generate },
    sessions: {
      snapshot: () => runtimeMocks.session,
      subscribe: () => () => {},
    },
    models: {
      subscribe: () => () => {},
      snapshot: () => runtimeMocks.models,
    },
    configuredProviderIds: runtimeMocks.configured,
  }),
}));
vi.mock("../../diffInvalidation", () => ({
  invalidateDiff: vi.fn(),
  invalidateRepoDiffs: vi.fn(),
  workingDiffKey: (root: string, path: string, mode: string) =>
    `${root}|${path}|${mode}`,
}));

type ChatState = {
  selectedModelId: string;
  apiKeys: Record<string, string>;
  agentMeta: { status: string; error: string | null };
};
const chatState: ChatState = {
  selectedModelId: "gpt-5.4-mini",
  apiKeys: { openai: "sk-test", openrouter: "" } as Record<string, string>,
  agentMeta: { status: "idle", error: null },
};
const preferencesState = {
  lmstudioModelId: "",
  mlxModelId: "",
  ollamaModelId: "",
  openaiCompatibleBaseURL: "",
  openaiCompatibleModelId: "",
  openrouterModelId: "",
};

function syncConfiguration() {
  const providers = new Set<string>();
  if (chatState.apiKeys.openai) providers.add("openai");
  if (preferencesState.lmstudioModelId) providers.add("lmstudio");
  if (preferencesState.mlxModelId) providers.add("mlx");
  if (preferencesState.ollamaModelId) providers.add("ollama");
  if (
    preferencesState.openaiCompatibleBaseURL &&
    preferencesState.openaiCompatibleModelId
  ) {
    providers.add("openai-compatible");
  }
  if (chatState.apiKeys.openrouter && preferencesState.openrouterModelId) {
    providers.add("openrouter");
  }
  runtimeMocks.configured.splice(0, runtimeMocks.configured.length, ...providers);
}

const useChatStore = {
  setState(update: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) {
    const patch =
      typeof update === "function"
        ? update(chatState)
        : update;
    Object.assign(chatState, patch);
    runtimeMocks.session.selectedModelId = chatState.selectedModelId;
    runtimeMocks.session.agent = {
      status: chatState.agentMeta.status as typeof runtimeMocks.session.agent.status,
      step: null,
      error: (chatState.agentMeta.error as string | null) ?? null,
    };
    syncConfiguration();
  },
};
const usePreferencesStore = {
  setState(patch: Partial<typeof preferencesState>) {
    Object.assign(preferencesState, patch);
    syncConfiguration();
  },
};
const generateText = runtimeMocks.generate;

function file(overrides: Partial<GitChangedFile>): GitChangedFile {
  return {
    path: "src/a.ts",
    originalPath: null,
    indexStatus: " ",
    worktreeStatus: "M",
    staged: false,
    unstaged: true,
    untracked: false,
    statusLabel: "Modified",
    ...overrides,
  };
}

function status(overrides: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles: [],
    ...overrides,
  };
}

function makeSummary(
  overrides: Partial<SourceControlSummary> = {},
): SourceControlSummary {
  const snapshot = overrides.status ?? status();
  return {
    repo: {
      repoRoot: "/repo",
      branch: "main",
      upstream: "origin/main",
      isDetached: false,
    },
    status: snapshot,
    changedCount: snapshot?.changedFiles.length ?? 0,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    hasRepo: true,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
    applyStatus: vi.fn(),
    refresh: vi.fn(async () => {}),
    runRemoteAction: vi.fn(async () => ({ ok: true, action: "push" as const })),
    ...overrides,
  };
}

function renderPanel(summary: SourceControlSummary, isOpen = true) {
  const onOpenDiff = vi.fn();
  const view = renderHook(
    ({ open, s }: { open: boolean; s: SourceControlSummary }) =>
      useSourceControlPanel(open, s, onOpenDiff),
    { initialProps: { open: isOpen, s: summary } },
  );
  return { ...view, onOpenDiff };
}

const stagedFile = file({
  path: "staged.ts",
  indexStatus: "M",
  worktreeStatus: " ",
  staged: true,
  unstaged: false,
});
const unstagedFile = file({ path: "unstaged.ts" });
const untrackedFile = file({
  path: "new.ts",
  worktreeStatus: "?",
  untracked: true,
  statusLabel: "Untracked",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(native.gitStage).mockResolvedValue(undefined);
  vi.mocked(native.gitUnstage).mockResolvedValue(undefined);
  vi.mocked(native.gitDiscard).mockResolvedValue(undefined);
  vi.mocked(native.gitCommit).mockResolvedValue({
    commitSha: "abcdef1234567890",
    summary: "feat: change",
  });
  vi.mocked(native.gitDiff).mockResolvedValue({
    diffText: "diff --git a/staged.ts",
    truncated: false,
  });
  vi.mocked(generateText).mockResolvedValue({
    text: "feat: generated message",
  } as never);
  useChatStore.setState((s) => ({
    selectedModelId: "gpt-5.4-mini",
    apiKeys: { ...s.apiKeys, openai: "sk-test" },
    agentMeta: { ...s.agentMeta, status: "idle", error: null },
  }));
});

afterEach(cleanup);

describe("panel state machine", () => {
  it("is closed while the panel is not open", () => {
    const { result } = renderPanel(makeSummary(), false);
    expect(result.current.panelState).toBe("closed");
  });

  it("is loading during the initial fetch", () => {
    const { result } = renderPanel(
      makeSummary({
        hasRepo: false,
        isLoading: true,
        repo: null,
        status: null,
      }),
    );
    expect(result.current.panelState).toBe("loading");
  });

  it("is no-repo when the summary has none", () => {
    const { result } = renderPanel(
      makeSummary({ hasRepo: false, repo: null, status: null }),
    );
    expect(result.current.panelState).toBe("no-repo");
    expect(result.current.repo).toBeNull();
  });

  it("is error when a local error arrives without a status", () => {
    const { result } = renderPanel(
      makeSummary({ localError: "fatal: broken", status: null }),
    );
    expect(result.current.panelState).toBe("error");
    expect(result.current.statusError).toBe("fatal: broken");
    expect(result.current.repo?.repoRoot).toBe("/repo");
  });

  it("is ready with a repo and status", () => {
    const { result } = renderPanel(makeSummary());
    expect(result.current.panelState).toBe("ready");
    expect(result.current.allClean).toBe(true);
  });

  it("stays loading when the repo is known but the status is still missing", () => {
    const { result } = renderPanel(
      makeSummary({ hasRepo: true, isLoading: true, status: null }),
    );
    expect(result.current.panelState).toBe("loading");
  });

  it("ignores actions before the repo is ready", async () => {
    const { result } = renderPanel(
      makeSummary({ hasRepo: false, repo: null, status: null }),
    );
    const entry: SourceControlEntry = {
      key: "-:a.ts",
      path: "a.ts",
      mode: "-",
      indexStatus: " ",
      worktreeStatus: "M",
      statusLabel: "Modified",
      statusCode: "M",
      originalPath: null,
      untracked: false,
    };
    await act(async () => {
      await result.current.stageEntry(entry);
      await result.current.unstageEntry(entry);
      await result.current.stageAllEntries();
      await result.current.unstageAllEntries();
      await result.current.confirmPendingDiscard();
      await result.current.selectEntry(entry);
      await result.current.commit();
      await result.current.push();
      await result.current.generateCommitMessage();
    });
    expect(native.gitStage).not.toHaveBeenCalled();
    expect(native.gitUnstage).not.toHaveBeenCalled();
    expect(native.gitDiscard).not.toHaveBeenCalled();
    expect(native.gitCommit).not.toHaveBeenCalled();
  });

  it("closes and clears selection state when the panel closes", () => {
    const summary = makeSummary();
    const { result, rerender } = renderPanel(summary);
    expect(result.current.panelState).toBe("ready");
    rerender({ open: false, s: summary });
    expect(result.current.panelState).toBe("closed");
  });
});

describe("derived entries", () => {
  it("splits staged and unstaged entries and dedupes file entries", () => {
    const both = file({
      path: "both.ts",
      indexStatus: "M",
      worktreeStatus: "M",
      staged: true,
      unstaged: true,
    });
    const { result } = renderPanel(
      makeSummary({
        status: status({ changedFiles: [stagedFile, unstagedFile, both] }),
      }),
    );
    expect(result.current.stagedEntries.map((e) => e.path)).toEqual([
      "staged.ts",
      "both.ts",
    ]);
    expect(result.current.unstagedEntries.map((e) => e.path)).toEqual([
      "unstaged.ts",
      "both.ts",
    ]);
    expect(result.current.fileEntries.map((e) => e.path)).toEqual([
      "staged.ts",
      "unstaged.ts",
      "both.ts",
    ]);
    const bothEntry = result.current.fileEntries[2];
    expect(bothEntry.checkState).toBe("indeterminate");
    expect(result.current.headerCheckState).toBe("indeterminate");
    expect(result.current.allClean).toBe(false);
  });

  it("marks the header checked when everything is staged", () => {
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [stagedFile] }) }),
    );
    expect(result.current.headerCheckState).toBe("checked");
    expect(result.current.fileEntries[0].checkState).toBe("checked");
  });

  it("marks the header unchecked when nothing is staged", () => {
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [unstagedFile] }) }),
    );
    expect(result.current.headerCheckState).toBe("unchecked");
  });

  it("uses the untracked status code for unstaged untracked files", () => {
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [untrackedFile] }) }),
    );
    expect(result.current.fileEntries[0].statusCode).toBe("U");
  });

  it("derives push availability and hints", () => {
    const noUpstream = renderPanel(
      makeSummary({ status: status({ upstream: null }) }),
    );
    expect(noUpstream.result.current.canPush).toBe(false);
    expect(noUpstream.result.current.pushHint).toContain(
      "Configure or publish this branch",
    );

    const behind = renderPanel(makeSummary({ status: status({ behind: 2 }) }));
    expect(behind.result.current.canPush).toBe(false);
    expect(behind.result.current.pushHint).toBe(
      "Pull remote changes before pushing local commits.",
    );

    const inSync = renderPanel(makeSummary({ status: status({ ahead: 0 }) }));
    expect(inSync.result.current.canPush).toBe(true);
    expect(inSync.result.current.pushHint).toBe(
      "No local commits to push to origin/main.",
    );

    const ahead = renderPanel(makeSummary({ status: status({ ahead: 3 }) }));
    expect(ahead.result.current.pushHint).toBe("Pushes to origin/main.");
  });

  it("explains why commit message generation is unavailable", () => {
    const empty = renderPanel(makeSummary());
    expect(empty.result.current.canGenerateCommitMessage).toBe(false);
    expect(empty.result.current.generateCommitMessageHint).toBe(
      "Stage changes to generate a commit message",
    );

    const staged = renderPanel(
      makeSummary({ status: status({ changedFiles: [stagedFile] }) }),
    );
    expect(staged.result.current.canGenerateCommitMessage).toBe(true);
    expect(staged.result.current.generateCommitMessageHint).toBe(
      "Generate commit message",
    );
  });

  it("requires a provider key for the selected model", () => {
    useChatStore.setState((s) => ({
      apiKeys: { ...s.apiKeys, openai: "" },
    }));
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [stagedFile] }) }),
    );
    expect(result.current.generateCommitMessageHint).toBe(
      "Connect an AI provider to generate commit messages",
    );
  });
});

describe("local provider configuration", () => {
  const stagedSummary = () =>
    makeSummary({ status: status({ changedFiles: [stagedFile] }) });

  beforeEach(() => {
    usePreferencesStore.setState({
      lmstudioModelId: "",
      mlxModelId: "",
      ollamaModelId: "",
      openaiCompatibleBaseURL: "",
      openaiCompatibleModelId: "",
      openrouterModelId: "",
    });
  });

  const connectHint = "Connect an AI provider to generate commit messages";

  it("requires a model id for each local provider", () => {
    for (const modelId of ["lmstudio-local", "mlx-local", "ollama-local"]) {
      useChatStore.setState({ selectedModelId: modelId });
      const { result, unmount } = renderPanel(stagedSummary());
      expect(result.current.generateCommitMessageHint).toBe(connectHint);
      unmount();
    }
  });

  it("requires base URL and model id for openai-compatible", () => {
    useChatStore.setState({ selectedModelId: "openai-compatible-custom" });
    const missingBoth = renderPanel(stagedSummary());
    expect(missingBoth.result.current.generateCommitMessageHint).toBe(
      connectHint,
    );
    missingBoth.unmount();

    usePreferencesStore.setState({
      openaiCompatibleBaseURL: "http://localhost:8080/v1",
      openaiCompatibleModelId: "phi-4",
    });
    const configured = renderPanel(stagedSummary());
    expect(configured.result.current.generateCommitMessageHint).toBe(
      "Generate commit message",
    );
  });

  it("requires a model id for openrouter", () => {
    useChatStore.setState((s) => ({
      selectedModelId: "openrouter-custom",
      apiKeys: { ...s.apiKeys, openrouter: "sk-or-test" },
    }));
    const missing = renderPanel(stagedSummary());
    expect(missing.result.current.generateCommitMessageHint).toBe(connectHint);
    missing.unmount();

    usePreferencesStore.setState({ openrouterModelId: "meta/llama" });
    const configured = renderPanel(stagedSummary());
    expect(configured.result.current.generateCommitMessageHint).toBe(
      "Generate commit message",
    );
  });

  it("accepts a configured local provider without an api key", () => {
    useChatStore.setState({ selectedModelId: "ollama-local" });
    usePreferencesStore.setState({ ollamaModelId: "llama3" });
    const { result } = renderPanel(stagedSummary());
    expect(result.current.generateCommitMessageHint).toBe(
      "Generate commit message",
    );
    expect(result.current.canGenerateCommitMessage).toBe(true);
  });
});

describe("refresh", () => {
  it("invalidates repo diffs and delegates while open", async () => {
    const summary = makeSummary();
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.refresh();
    });
    expect(invalidateRepoDiffs).toHaveBeenCalledWith("/repo");
    expect(summary.refresh).toHaveBeenCalledWith({ remote: "never" });
  });

  it("closes without touching the summary while hidden", async () => {
    const summary = makeSummary();
    const { result } = renderPanel(summary, false);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.panelState).toBe("closed");
    expect(summary.refresh).not.toHaveBeenCalled();
  });
});

describe("selection", () => {
  it("selects an entry and opens its diff", async () => {
    const { result, onOpenDiff } = renderPanel(
      makeSummary({ status: status({ changedFiles: [unstagedFile] }) }),
    );
    const entry = result.current.unstagedEntries[0];
    await act(async () => {
      await result.current.selectEntry(entry);
    });
    expect(result.current.selected).toEqual({ path: "unstaged.ts", mode: "-" });
    expect(onOpenDiff).toHaveBeenCalledWith({
      path: "unstaged.ts",
      repoRoot: "/repo",
      mode: "-",
      originalPath: null,
    });
  });

  it("does not reopen the diff for the same selection", async () => {
    const { result, onOpenDiff } = renderPanel(
      makeSummary({ status: status({ changedFiles: [unstagedFile] }) }),
    );
    const entry = result.current.unstagedEntries[0];
    await act(async () => {
      await result.current.selectEntry(entry);
    });
    await act(async () => {
      await result.current.selectEntry(entry);
    });
    expect(onOpenDiff).toHaveBeenCalledTimes(1);
  });

  it("selects a merged file entry using its unstaged side first", async () => {
    const { result, onOpenDiff } = renderPanel(
      makeSummary({ status: status({ changedFiles: [stagedFile] }) }),
    );
    await act(async () => {
      await result.current.selectFile(result.current.fileEntries[0]);
    });
    expect(result.current.selected).toEqual({ path: "staged.ts", mode: "+" });
    expect(onOpenDiff).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "+" }),
    );
  });

  it("does not reopen the diff for the same file selection", async () => {
    const { result, onOpenDiff } = renderPanel(
      makeSummary({ status: status({ changedFiles: [unstagedFile] }) }),
    );
    await act(async () => {
      await result.current.selectFile(result.current.fileEntries[0]);
    });
    await act(async () => {
      await result.current.selectFile(result.current.fileEntries[0]);
    });
    expect(onOpenDiff).toHaveBeenCalledTimes(1);
  });

  it("moves the selection to the other group when the file switches sides", async () => {
    const first = makeSummary({
      status: status({ changedFiles: [unstagedFile] }),
    });
    const { result, rerender } = renderPanel(first);
    await act(async () => {
      await result.current.selectEntry(result.current.unstagedEntries[0]);
    });
    const moved = makeSummary({
      status: status({
        changedFiles: [
          file({
            path: "unstaged.ts",
            indexStatus: "M",
            worktreeStatus: " ",
            staged: true,
            unstaged: false,
          }),
        ],
      }),
    });
    rerender({ open: true, s: moved });
    expect(result.current.selected).toEqual({ path: "unstaged.ts", mode: "+" });
    expect(result.current.selectionTransition).toBe("moved-group");
  });

  it("resets the selection when the file disappears", async () => {
    const first = makeSummary({
      status: status({ changedFiles: [unstagedFile] }),
    });
    const { result, rerender } = renderPanel(first);
    await act(async () => {
      await result.current.selectEntry(result.current.unstagedEntries[0]);
    });
    rerender({ open: true, s: makeSummary({ status: status() }) });
    expect(result.current.selected).toBeNull();
    expect(result.current.selectionTransition).toBe("reset");
  });
});

describe("stage and unstage mutations", () => {
  function entryFor(path: string, mode: "+" | "-"): SourceControlEntry {
    return {
      key: `${mode}:${path}`,
      path,
      mode,
      indexStatus: mode === "+" ? "M" : " ",
      worktreeStatus: mode === "+" ? " " : "M",
      statusLabel: "Modified",
      statusCode: "M",
      originalPath: null,
      untracked: false,
    };
  }

  it("stages an entry optimistically and reconciles", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [unstagedFile] }),
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.stageEntry(entryFor("unstaged.ts", "-"));
    });
    expect(native.gitStage).toHaveBeenCalledWith("/repo", ["unstaged.ts"]);
    expect(summary.applyStatus).toHaveBeenCalledTimes(1);
    expect(invalidateDiff).toHaveBeenCalledWith("/repo|unstaged.ts|+");
    expect(invalidateDiff).toHaveBeenCalledWith("/repo|unstaged.ts|-");
    await waitFor(() => {
      expect(summary.refresh).toHaveBeenCalledWith({ remote: "never" });
    });
    expect(result.current.actionBusy).toBeNull();
    expect(result.current.actionError).toBeNull();
  });

  it("surfaces stage failures and refreshes immediately", async () => {
    vi.mocked(native.gitStage).mockRejectedValue(new Error("index locked"));
    const summary = makeSummary({
      status: status({ changedFiles: [unstagedFile] }),
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.stageEntry(entryFor("unstaged.ts", "-"));
    });
    expect(result.current.actionError).toBe("index locked");
    expect(summary.refresh).toHaveBeenCalledWith({ remote: "never" });
  });

  it("unstages an entry", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [stagedFile] }),
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.unstageEntry(entryFor("staged.ts", "+"));
    });
    expect(native.gitUnstage).toHaveBeenCalledWith("/repo", ["staged.ts"]);
  });

  it("skips mutations while a remote action is busy", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [unstagedFile] }),
      busyAction: "push",
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.stageEntry(entryFor("unstaged.ts", "-"));
    });
    expect(native.gitStage).not.toHaveBeenCalled();
  });

  it("stages and unstages everything at once", async () => {
    const summary = makeSummary({
      status: status({
        changedFiles: [stagedFile, unstagedFile, untrackedFile],
      }),
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.stageAllEntries();
    });
    expect(native.gitStage).toHaveBeenCalledWith("/repo", [
      "unstaged.ts",
      "new.ts",
    ]);
    await act(async () => {
      await result.current.unstageAllEntries();
    });
    expect(native.gitUnstage).toHaveBeenCalledWith("/repo", ["staged.ts"]);
  });

  it("toggleStageFile stages unchecked and unstages checked entries", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [stagedFile, unstagedFile] }),
    });
    const { result } = renderPanel(summary);
    const checked = result.current.fileEntries.find(
      (e) => e.path === "staged.ts",
    );
    const unchecked = result.current.fileEntries.find(
      (e) => e.path === "unstaged.ts",
    );
    if (!checked || !unchecked) throw new Error("entries missing");
    await act(async () => {
      await result.current.toggleStageFile(checked);
    });
    expect(native.gitUnstage).toHaveBeenCalledWith("/repo", ["staged.ts"]);
    await act(async () => {
      await result.current.toggleStageFile(unchecked);
    });
    expect(native.gitStage).toHaveBeenCalledWith("/repo", ["unstaged.ts"]);
  });

  it("toggleAll unstages when everything is checked, stages otherwise", async () => {
    const allStaged = renderPanel(
      makeSummary({ status: status({ changedFiles: [stagedFile] }) }),
    );
    await act(async () => {
      await allStaged.result.current.toggleAll();
    });
    expect(native.gitUnstage).toHaveBeenCalledWith("/repo", ["staged.ts"]);

    const mixed = renderPanel(
      makeSummary({ status: status({ changedFiles: [unstagedFile] }) }),
    );
    await act(async () => {
      await mixed.result.current.toggleAll();
    });
    expect(native.gitStage).toHaveBeenCalledWith("/repo", ["unstaged.ts"]);
  });
});

describe("discard flow", () => {
  it("requests, describes and confirms a single discard", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [unstagedFile, untrackedFile] }),
    });
    const { result } = renderPanel(summary);
    const entry = result.current.unstagedEntries.find(
      (e) => e.path === "new.ts",
    );
    if (!entry) throw new Error("entry missing");
    act(() => {
      result.current.requestDiscardEntry(entry);
    });
    expect(result.current.pendingDiscard).toEqual({
      scope: "single",
      count: 1,
      label: "new.ts",
    });
    await act(async () => {
      await result.current.confirmPendingDiscard();
    });
    expect(native.gitDiscard).toHaveBeenCalledWith("/repo", [
      { path: "new.ts", untracked: true },
    ]);
    expect(result.current.pendingDiscard).toBeNull();
  });

  it("requests a discard-all with a pluralized label", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [unstagedFile, untrackedFile] }),
    });
    const { result } = renderPanel(summary);
    act(() => {
      result.current.requestDiscardAll();
    });
    expect(result.current.pendingDiscard).toEqual({
      scope: "all",
      count: 2,
      label: "2 unstaged files",
    });
    await act(async () => {
      await result.current.confirmPendingDiscard();
    });
    expect(native.gitDiscard).toHaveBeenCalledWith("/repo", [
      { path: "unstaged.ts", untracked: false },
      { path: "new.ts", untracked: true },
    ]);
  });

  it("does nothing when there is nothing to discard", () => {
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [stagedFile] }) }),
    );
    act(() => {
      result.current.requestDiscardAll();
    });
    expect(result.current.pendingDiscard).toBeNull();
  });

  it("cancels a pending discard", () => {
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [unstagedFile] }) }),
    );
    act(() => {
      result.current.requestDiscardAll();
    });
    expect(result.current.pendingDiscard).not.toBeNull();
    act(() => {
      result.current.cancelPendingDiscard();
    });
    expect(result.current.pendingDiscard).toBeNull();
    expect(native.gitDiscard).not.toHaveBeenCalled();
  });

  it("requestDiscardFile targets the unstaged side of a file entry", () => {
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [untrackedFile] }) }),
    );
    act(() => {
      result.current.requestDiscardFile(result.current.fileEntries[0]);
    });
    expect(result.current.pendingDiscard).toEqual({
      scope: "single",
      count: 1,
      label: "new.ts",
    });
  });
});

describe("commit and push", () => {
  it("commits, clears the message and reports the short sha", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [stagedFile] }),
    });
    const { result } = renderPanel(summary);
    act(() => {
      result.current.setCommitMessage("feat: change");
    });
    await act(async () => {
      await result.current.commit();
    });
    expect(native.gitCommit).toHaveBeenCalledWith("/repo", "feat: change");
    expect(result.current.commitMessage).toBe("");
    expect(result.current.actionMessage).toBe("Committed abcdef1 feat: change");
    expect(invalidateRepoDiffs).toHaveBeenCalledWith("/repo");
    expect(summary.refresh).toHaveBeenCalledWith({ remote: "never" });
  });

  it("keeps the message and reports commit failures", async () => {
    vi.mocked(native.gitCommit).mockRejectedValue(new Error("hook failed"));
    const { result } = renderPanel(
      makeSummary({ status: status({ changedFiles: [stagedFile] }) }),
    );
    act(() => {
      result.current.setCommitMessage("feat: change");
    });
    await act(async () => {
      await result.current.commit();
    });
    expect(result.current.actionError).toBe("hook failed");
    expect(result.current.commitMessage).toBe("feat: change");
  });

  it("pushes through the summary remote action", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [stagedFile] }),
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.push();
    });
    expect(summary.runRemoteAction).toHaveBeenCalledWith("push");
    expect(result.current.actionMessage).toBe("Pushed to origin/main");
  });

  it("falls back to a generic push message without an upstream", async () => {
    const summary = makeSummary({
      status: status({ upstream: null, changedFiles: [stagedFile] }),
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.push();
    });
    expect(result.current.actionMessage).toBe("Push completed");
  });

  it("reports push failures", async () => {
    const summary = makeSummary({
      status: status({ changedFiles: [stagedFile] }),
      runRemoteAction: vi.fn(async () => ({
        ok: false,
        action: "push" as const,
        error: "remote rejected",
      })),
    });
    const { result } = renderPanel(summary);
    await act(async () => {
      await result.current.push();
    });
    expect(result.current.actionError).toBe("remote rejected");
    expect(result.current.actionMessage).toBeNull();
  });
});

describe("generateCommitMessage", () => {
  const stagedSummary = () =>
    makeSummary({ status: status({ changedFiles: [stagedFile] }) });

  it("generates and applies a valid commit message", async () => {
    const { result } = renderPanel(stagedSummary());
    await act(async () => {
      await result.current.generateCommitMessage();
    });
    expect(native.gitDiff).toHaveBeenCalledWith("/repo", null, true);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.current.commitMessage).toBe("feat: generated message");
    expect(result.current.actionError).toBeNull();
  });

  it("repairs an invalid first attempt", async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce({ text: "not conventional" } as never)
      .mockResolvedValueOnce({ text: "fix: repaired" } as never);
    const { result } = renderPanel(stagedSummary());
    await act(async () => {
      await result.current.generateCommitMessage();
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.current.commitMessage).toBe("fix: repaired");
  });

  it("errors when the repair is still invalid", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "garbage" } as never);
    const { result } = renderPanel(stagedSummary());
    await act(async () => {
      await result.current.generateCommitMessage();
    });
    expect(result.current.actionError).toContain(
      "AI returned an invalid commit message",
    );
    expect(result.current.commitMessage).toBe("");
  });

  it("refuses while the agent is busy", async () => {
    useChatStore.setState((s) => ({
      agentMeta: { ...s.agentMeta, status: "thinking" },
    }));
    const { result } = renderPanel(stagedSummary());
    await act(async () => {
      await result.current.generateCommitMessage();
    });
    expect(result.current.actionError).toBe(
      "Wait for the current AI action to finish",
    );
    expect(native.gitDiff).not.toHaveBeenCalled();
  });

  it("refuses without a provider key", async () => {
    useChatStore.setState((s) => ({
      apiKeys: { ...s.apiKeys, openai: "" },
    }));
    const { result } = renderPanel(stagedSummary());
    await act(async () => {
      await result.current.generateCommitMessage();
    });
    expect(result.current.actionError).toBe(
      "Connect an AI provider to generate commit messages",
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does nothing without staged entries", async () => {
    const { result } = renderPanel(makeSummary());
    await act(async () => {
      await result.current.generateCommitMessage();
    });
    expect(native.gitDiff).not.toHaveBeenCalled();
    expect(result.current.actionError).toBeNull();
  });
});
