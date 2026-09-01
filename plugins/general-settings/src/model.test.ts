import { describe, expect, it } from "vitest";
import { clampZoom, resolveGeneralPreferences } from "./model";

describe("general preference model", () => {
  it("owns safe defaults for missing and malformed values", () => {
    expect(resolveGeneralPreferences({ autostart: "yes", zoomLevel: null })).toEqual({
      autostart: false,
      restoreWindowState: true,
      showHidden: false,
      explorerGitDecorations: true,
      agentNotifications: true,
      agentAutoApprove: false,
      richChatUi: true,
      zoomLevel: 1,
    });
  });

  it("clamps zoom to 50–200 percent in five-percent steps", () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(1.073)).toBe(1.05);
    expect(clampZoom(3)).toBe(2);
  });
});
