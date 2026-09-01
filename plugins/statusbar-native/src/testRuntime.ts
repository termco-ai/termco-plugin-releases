import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import { vi } from "vitest";

export function createStatusbarRuntime(
  overrides: Partial<UiStatusbarRuntime> = {},
): UiStatusbarRuntime {
  return {
    platform: "macos",
    zenMode: false,
    cwd: "/Users/dev/repo",
    filePath: null,
    home: "/Users/dev",
    privateActive: false,
    workspace: { kind: "local" },
    wslDistros: [],
    wslLoading: false,
    wslError: null,
    lspServerId: null,
    ai: { status: "idle", step: null, error: null },
    aiSurfaceOpen: false,
    sendCd: vi.fn(),
    changeWorkspace: vi.fn(),
    refreshWslDistros: vi.fn().mockResolvedValue([]),
    openLanguagesSettings: vi.fn(),
    openAi: vi.fn(),
    ...overrides,
  };
}
