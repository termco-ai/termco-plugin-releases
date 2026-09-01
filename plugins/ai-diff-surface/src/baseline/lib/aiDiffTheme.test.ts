import type { AiDiffStatus } from "../../tabTypes";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { DIFF_THEME, STATUS_CHIP_CLASS, STATUS_LABEL } from "./aiDiffTheme";

const STATUSES: AiDiffStatus[] = ["pending", "approved", "rejected"];

describe("status lookups", () => {
  it("labels every status", () => {
    for (const s of STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
    expect(STATUS_LABEL.pending).toBe("Pending review");
    expect(STATUS_LABEL.approved).toBe("Applied");
    expect(STATUS_LABEL.rejected).toBe("Rejected");
  });

  it("maps every status to a chip class", () => {
    for (const s of STATUSES) {
      expect(STATUS_CHIP_CLASS[s]).toBeTruthy();
    }
    expect(STATUS_CHIP_CLASS.pending).toContain("text-yellow-500");
    expect(STATUS_CHIP_CLASS.approved).toContain("text-chart-5");
    expect(STATUS_CHIP_CLASS.rejected).toContain("text-destructive");
  });
});

describe("DIFF_THEME", () => {
  it("is a valid CodeMirror extension", () => {
    expect(() => EditorState.create({ extensions: DIFF_THEME })).not.toThrow();
  });
});
