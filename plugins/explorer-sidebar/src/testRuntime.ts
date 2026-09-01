import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { GitCapability } from "@termco/git-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { vi, type Mock } from "vitest";
import { installExplorerRuntime, type ExplorerRuntime } from "./runtime";

type MockedCapability<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : T[K];
};

export type ExplorerRuntimeMocks = Omit<
  ExplorerRuntime,
  "files" | "desktop" | "git"
> & {
  files: MockedCapability<WorkspaceFilesCapability>;
  desktop: MockedCapability<DesktopIntegrationCapability>;
  git: MockedCapability<GitCapability>;
};

const asyncMock = (value?: unknown) => vi.fn(async () => value);

export function createTestExplorerRuntime(): ExplorerRuntimeMocks {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const files = {
    readFile: asyncMock(), writeFile: asyncMock(), canonicalize: vi.fn(async (path: string) => path),
    stat: asyncMock(), readDir: asyncMock([]), listSubdirs: asyncMock([]),
    createFile: asyncMock(), createDir: asyncMock(), rename: asyncMock(),
    delete: asyncMock(), copy: asyncMock(), watchAdd: asyncMock(),
    watchRemove: asyncMock(), search: asyncMock({ hits: [], truncated: false }),
    listFiles: asyncMock(), grep: asyncMock(), grepInteractive: asyncMock(),
    glob: asyncMock(), readFileLocal: vi.fn(), ripgrepPath: "rg",
  } as unknown as ExplorerRuntimeMocks["files"];
  const preferences = {
    get: asyncMock(), getMany: asyncMock({}), set: asyncMock(), delete: asyncMock(false),
  } as unknown as PreferencesCapability;
  const desktop = {
    openUrl: asyncMock(), openPath: asyncMock(), revealItem: vi.fn(),
    relaunch: vi.fn(), exit: vi.fn(), setAutostart: vi.fn(),
    autostartEnabled: vi.fn(() => false), readClipboardText: vi.fn(() => ""),
    writeClipboardText: vi.fn(), notify: vi.fn(), log: vi.fn(),
    subscribeDragDrop: vi.fn(() => () => {}),
  } as unknown as ExplorerRuntimeMocks["desktop"];
  const events: ApplicationEventsCapability = {
    emit(event, payload) { for (const listener of listeners.get(event) ?? []) listener(payload); },
    subscribe(event, listener) {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(listener); listeners.set(event, bucket);
      return () => bucket.delete(listener);
    },
    subscribeAll: () => () => {},
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
  };
  const git = {
    resolveRepo: asyncMock(null),
    panelSnapshot: asyncMock({ repo: null, status: null }),
    status: asyncMock(), diff: asyncMock(), diffContent: asyncMock(),
    stage: asyncMock(), unstage: asyncMock(), discard: asyncMock(),
    commit: asyncMock(), commitFiles: asyncMock([]), commitFileDiff: asyncMock(),
    fetch: asyncMock(), pullFfOnly: asyncMock(), push: asyncMock(),
    log: asyncMock([]), showCommit: asyncMock(), listBranches: asyncMock({ branches: [] }),
    checkoutBranch: asyncMock(), remoteUrl: asyncMock(null),
  } as unknown as ExplorerRuntimeMocks["git"];
  const shortcuts: ShortcutRegistryCapability = {
    snapshot: () => ({ revision: 0, groups: [], shortcuts: [], overrides: {} }),
    subscribe: () => () => {}, bindings: () => [], match: () => false,
    format: () => [], useHandlers: () => {}, setBindings: async () => {}, reset: async () => {},
    resetAll: async () => {},
  };
  const runtime = { files, preferences, desktop, events, git, shortcuts };
  installExplorerRuntime(runtime);
  return runtime;
}
