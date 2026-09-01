// Kept with the source-owning terminal plugin.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  historyCommands,
  historyList,
  historyRecord,
  historySuggest,
} from "./history";

const backend = vi.hoisted(() => ({
  suggest: vi.fn(),
  commands: vi.fn(),
  list: vi.fn(),
  record: vi.fn(),
}));
vi.mock("../../../runtime", () => ({
  terminalRuntime: () => ({ history: backend }),
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));

beforeEach(() => {
  for (const operation of Object.values(backend)) operation.mockReset();
});

describe("historySuggest", () => {
  it("returns the backend suggestion", async () => {
    backend.suggest.mockResolvedValue("git status");
    await expect(historySuggest("git st")).resolves.toBe("git status");
    expect(backend.suggest).toHaveBeenCalledWith("git st", { kind: "local" });
  });

  it("falls back to null on failure", async () => {
    backend.suggest.mockRejectedValue(new Error("no db"));
    await expect(historySuggest("git")).resolves.toBeNull();
  });
});

describe("historyCommands", () => {
  it("returns the command list with the default limit", async () => {
    backend.commands.mockResolvedValue(["git", "gh"]);
    await expect(historyCommands("g")).resolves.toEqual(["git", "gh"]);
    expect(backend.commands).toHaveBeenCalledWith("g", 50, { kind: "local" });
  });

  it("passes a custom limit and falls back to [] on failure", async () => {
    backend.commands.mockRejectedValue(new Error("boom"));
    await expect(historyCommands("g", 5)).resolves.toEqual([]);
    expect(backend.commands).toHaveBeenCalledWith("g", 5, { kind: "local" });
  });
});

describe("historyList", () => {
  it("returns matches with the default limit", async () => {
    backend.list.mockResolvedValue(["ls -la"]);
    await expect(historyList("ls")).resolves.toEqual(["ls -la"]);
    expect(backend.list).toHaveBeenCalledWith("ls", 200, { kind: "local" });
  });

  it("falls back to [] on failure", async () => {
    backend.list.mockRejectedValue(new Error("boom"));
    await expect(historyList("ls", 10)).resolves.toEqual([]);
  });
});

describe("historyRecord", () => {
  it("records fire-and-forget", () => {
    backend.record.mockResolvedValue(undefined);
    historyRecord("make build");
    expect(backend.record).toHaveBeenCalledWith("make build", { kind: "local" });
  });

  it("swallows backend failures", async () => {
    backend.record.mockRejectedValue(new Error("boom"));
    expect(() => historyRecord("make")).not.toThrow();
    await Promise.resolve();
  });
});
