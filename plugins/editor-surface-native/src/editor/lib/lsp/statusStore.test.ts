import { describe, expect, it, vi } from "vitest";
import {
  editorLspStatus,
  lspStatusKey,
  useLspStatusStore,
} from "./statusStore";

describe("editor LSP status capability", () => {
  it("publishes the editor-owned server id by workspace and document", () => {
    const listener = vi.fn();
    const unsubscribe = editorLspStatus.subscribe(listener);

    useLspStatusStore
      .getState()
      .setActive(lspStatusKey("ssh:rig-1", "/work/main.ts"), "typescript");

    expect(
      editorLspStatus.serverId(
        { kind: "ssh", connectionId: "rig-1", host: "example.test" },
        "/work/main.ts",
      ),
    ).toBe("typescript");
    expect(editorLspStatus.serverId({ kind: "local" }, "/work/main.ts")).toBeNull();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
