export interface WorkspaceRigWorkflowsCapability {
  /** Create and activate a local rig seeded from the focused local terminal. */
  createLocal(): string;
  /** Connect, create, and activate a rig backed by the shared SSH provider. */
  createSsh(connectionId: string): Promise<string | null>;
  /** Remove a rig, its saved layout and sessions, preserving a fallback tab. */
  remove(rigId: string): void;
}
