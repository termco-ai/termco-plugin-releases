import { describe, expect, it } from "vitest";
import { resolveTerminalPreferences } from "./model";

describe("terminal preference model", () => {
  it("owns defaults and normalizes persisted values", () => {
    expect(resolveTerminalPreferences({ terminalFontWeight: "900", terminalFontSize: 100, terminalScrollback: 1 })).toMatchObject({ terminalFontWeight: "normal", terminalFontSize: 32, terminalScrollback: 200 });
  });
  it("preserves supported shell, font, and WSL selections", () => {
    expect(resolveTerminalPreferences({ terminalShell: " /bin/zsh ", terminalFontFamily: " Hack ", defaultWorkspaceEnv: "wsl:Ubuntu" })).toMatchObject({ terminalShell: "/bin/zsh", terminalFontFamily: "Hack", defaultWorkspaceEnv: "wsl:Ubuntu" });
  });
});
