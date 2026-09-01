import { describe, expect, it, vi } from "vitest";
import type { UiTabsRuntime } from "@termco/ui-tabs-base";
import { updateFocusedTerminalLeaf } from "./focusOwnership";

describe("terminal focus ownership", () => {
  it("does not allow a retained hidden terminal to select its old tab", async () => {
    // Document the behavior expected from the public runtime seam: leaf
    // focus is tab-local state. Application tab selection is owned by the
    // rig/tab state machine, not by a terminal retained behind another rig.
    const runtime = {
      selectTab: vi.fn(),
      updateTab: vi.fn(),
    } as unknown as Pick<UiTabsRuntime, "selectTab" | "updateTab">;
    updateFocusedTerminalLeaf(runtime, 9, 10);
    expect(runtime.updateTab).toHaveBeenCalledWith(9, { activeLeafId: 10 });
    expect(runtime.selectTab).not.toHaveBeenCalled();
  });
});
