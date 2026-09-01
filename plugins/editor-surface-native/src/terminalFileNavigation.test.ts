import type { EditorNavigationCapability } from "@termco/editor-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import { TERMINAL_BLOCK_EVENTS } from "@termco/terminal-base";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installTerminalFileNavigation } from "./terminalFileNavigation";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function setup() {
  let listener: ((payload: unknown) => void) | null = null;
  const events = {
    subscribe: vi.fn((event: string, next: (payload: unknown) => void) => {
      expect(event).toBe(TERMINAL_BLOCK_EVENTS.openFile);
      listener = next;
      return vi.fn();
    }),
  } as unknown as ApplicationEventsCapability;
  const files = {
    stat: vi.fn(async () => ({ isFile: true })),
  } as unknown as WorkspaceFilesCapability;
  const navigation = {
    openFile: vi.fn(() => 1),
    openFileAt: vi.fn(() => 1),
  } as unknown as EditorNavigationCapability;
  const workspace = { kind: "local" } as const;
  installTerminalFileNavigation(
    events,
    files,
    navigation,
    () => workspace,
  );
  return {
    emit: (payload: unknown) => listener?.(payload),
    files,
    navigation,
    workspace,
  };
}

afterEach(() => vi.clearAllMocks());

describe("terminal block file navigation", () => {
  it("opens the file plainly when no line is given", async () => {
    const result = setup();
    result.emit({ path: "/proj/a.ts" });
    await vi.waitFor(() =>
      expect(result.navigation.openFile).toHaveBeenCalledWith(
        "/proj/a.ts",
        true,
      ),
    );
    expect(result.navigation.openFileAt).not.toHaveBeenCalled();
  });

  it("lands on the line when the chip carries one", async () => {
    const result = setup();
    result.emit({ path: "/proj/a.ts", line: 42 });
    await vi.waitFor(() =>
      expect(result.navigation.openFileAt).toHaveBeenCalledWith(
        "/proj/a.ts",
        42,
        true,
      ),
    );
    expect(result.navigation.openFile).not.toHaveBeenCalled();
  });

  it("ignores a nonsensical line instead of jumping to it", async () => {
    const result = setup();
    result.emit({ path: "/proj/a.ts", line: 0 });
    await vi.waitFor(() =>
      expect(result.navigation.openFile).toHaveBeenCalledWith(
        "/proj/a.ts",
        true,
      ),
    );
    expect(result.navigation.openFileAt).not.toHaveBeenCalled();
  });

  it("says so instead of opening a file that does not exist", async () => {
    const result = setup();
    vi.mocked(result.files.stat).mockResolvedValueOnce(null);
    result.emit({ path: "/proj/ghost.ts", line: 3 });
    await vi.waitFor(() => expect(result.files.stat).toHaveBeenCalled());
    expect(result.navigation.openFile).not.toHaveBeenCalled();
    expect(result.navigation.openFileAt).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("File not found", {
      description: "/proj/ghost.ts",
    });
  });

  it("still opens when the probe itself fails", async () => {
    const result = setup();
    vi.mocked(result.files.stat).mockRejectedValueOnce(new Error("rig offline"));
    result.emit({ path: "/proj/a.ts" });
    await vi.waitFor(() =>
      expect(result.navigation.openFile).toHaveBeenCalledWith(
        "/proj/a.ts",
        true,
      ),
    );
  });
});
