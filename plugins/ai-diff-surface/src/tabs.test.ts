import type { UiTabDescriptor } from "@termco/ui-tabs-base";
import { describe, expect, it } from "vitest";
import { toAiDiffTab } from "./tabs";

const tab = (patch: Partial<UiTabDescriptor> = {}): UiTabDescriptor => ({
  id: 7,
  rigId: "remote-rig",
  kind: "ai-diff",
  title: "Review app.ts",
  cold: false,
  path: "/repo/app.ts",
  data: {
    originalContent: "before",
    proposedContent: "after",
    approvalId: "approval-1",
    status: "pending",
    isNewFile: false,
  },
  ...patch,
});

describe("AI diff tab adaptation", () => {
  it("preserves the complete review payload and rig identity", () => {
    expect(toAiDiffTab(tab())).toEqual({
      id: 7,
      rigId: "remote-rig",
      kind: "ai-diff",
      title: "Review app.ts",
      path: "/repo/app.ts",
      originalContent: "before",
      proposedContent: "after",
      approvalId: "approval-1",
      status: "pending",
      isNewFile: false,
    });
  });

  it("does not mount cold or malformed review tabs", () => {
    expect(toAiDiffTab(tab({ cold: true }))).toBeNull();
    expect(toAiDiffTab(tab({ data: {} }))).toBeNull();
  });
});
