import type { LspSessionsCapability } from "@termco/editor-base";
import { describe, expect, it, vi } from "vitest";
import { createLspContribution } from "./tools";

describe("LSP tool contribution", () => {
  it("reuses the shared provider and converts model positions to zero-based", async () => {
    const invoke = vi.fn(async () => [{ path: "/w/owner.ts", line: 8, character: 3 }]);
    const lsp = { invoke } as unknown as LspSessionsCapability;
    const tool = createLspContribution(lsp).build({
      getCwd: () => "/w",
      getWorkspaceEnv: () => ({ kind: "local" }),
    }).lsp_definition;
    await expect(tool.execute?.({ path: "use.ts", line: 4, column: 6 }))
      .resolves.toEqual({ definitions: [{ path: "/w/owner.ts", line: 9, column: 4 }] });
    expect(invoke).toHaveBeenCalledWith(
      "lsp_definition",
      expect.objectContaining({
        path: "/w/use.ts",
        position: { line: 3, character: 5 },
      }),
      { senderWebContentsId: 0 },
    );
  });
});
