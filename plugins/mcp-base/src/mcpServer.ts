export interface McpServerCapabilityCaller {
  senderWebContentsId: number;
}

export type McpRunApprovalHandler = (
  runId: string,
  request: { name: string; input: unknown; catastrophic: boolean },
) => Promise<{ allow: boolean; always?: boolean }>;

/** One application-wide MCP control server shared by managed and external agents. */
export interface McpServerCapability {
  /** Mirrors application workspaces into the shared MCP server. Consumers do
   * not own tokens or server state; the selected provider reconciles removals. */
  syncRigs(rigs: ReadonlyArray<{ id: string; name: string; root: string }>): Promise<void>;
  commands(): readonly string[];
  invoke(
    command: string,
    payload: Record<string, unknown>,
    /** Supplied by the platform IPC boundary for renderer consumers. */
    caller?: McpServerCapabilityCaller,
  ): Promise<unknown>;
  url(): string | null;
  mintRunToken(runId: string, rigId: string, autoApprove?: boolean): string;
  releaseRunToken(runId: string): void;
  setRunApprovalHandler(handler: McpRunApprovalHandler | null): void;
  setRunFullAutoResolver(resolver: ((runId: string) => boolean) | null): void;
  liveResources(): Array<{ id: string; label: string }>;
}
