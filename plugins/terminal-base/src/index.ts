export * from "./history";
export * from "./pty";
export * from "./shell";
export * from "./terminalBlocks";
export * from "./terminalSessions";
export * from "./terminalWorkspaceFooter";

export const TERMINAL_PTY_SERVICE = "terminal.pty" as const;
export const TERMINAL_SESSIONS_SERVICE = "terminal.sessions" as const;
export const TERMINAL_WORKSPACE_FOOTER_SERVICE = "terminal.workspace-footer" as const;
export const SHELL_EXECUTION_SERVICE = "shell.execution" as const;
export const TERMINAL_HISTORY_SERVICE = "terminal.history" as const;

declare module "@termco/kernel" {
  interface Services {
    [TERMINAL_PTY_SERVICE]: import("./pty").PtyCapability;
    [TERMINAL_SESSIONS_SERVICE]: import("./terminalSessions").TerminalSessionsCapability;
    [TERMINAL_WORKSPACE_FOOTER_SERVICE]: import("./terminalWorkspaceFooter").TerminalWorkspaceFooterCapability;
    [SHELL_EXECUTION_SERVICE]: import("./shell").ShellExecutionCapability;
    [TERMINAL_HISTORY_SERVICE]: import("./history").ShellHistoryCapability;
  }
}
