export interface AiContextArtifactSlice {
  content: string;
  /** 1-based line at which this slice starts. */
  offset: number;
  totalLines: number;
  truncated: boolean;
}

/** Shared durable context artifacts used by AI sessions and tools. The
 * selected provider owns storage, redaction, paging, retention, and trace
 * rendering so consumers never create competing caches. */
export interface AiContextArtifactsCapability {
  writeToolOutput(toolName: string, body: string): Promise<string | null>;
  readToolOutput(
    id: string,
    options?: { offset?: number; limit?: number },
  ): Promise<AiContextArtifactSlice | null>;
  readTranscript(
    runId: string,
    options?: { offset?: number; limit?: number },
  ): Promise<AiContextArtifactSlice | null>;
  pruneToolOutputs(now?: number): Promise<string[]>;
}
