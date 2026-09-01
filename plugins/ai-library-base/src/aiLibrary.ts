import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { Dispose } from "@termco/kernel";
import type { McpClientsCapability, McpTool } from "@termco/mcp-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export const AI_LIBRARY_EVENTS = {
  changed: "ai.library.changed",
} as const;

export const AI_TOOL_GROUP_IDS = [
  "files",
  "terminal",
  "git",
  "containers",
  "browser",
  "system",
  "agents",
  "ui",
  "plugin-dev",
] as const;

export type AiToolGroupId = (typeof AI_TOOL_GROUP_IDS)[number];

export type AiAgentIconId =
  | "coder"
  | "architect"
  | "reviewer"
  | "security"
  | "designer"
  | "debugger"
  | "tester"
  | "refactor"
  | "devops"
  | "explainer"
  | "interviewer"
  | "spark";

export interface AiLibraryAgent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  icon: AiAgentIconId;
  builtIn: boolean;
  model?: string;
  /** Tool groups whose schemas should be visible on the first model step.
   * Every other authorized group remains discoverable through tool_search. */
  preferredToolGroups?: readonly AiToolGroupId[];
}

export interface AiLibrarySnippet {
  id: string;
  handle: string;
  name: string;
  description: string;
  content: string;
}

export interface AiLibrarySkill {
  id: string;
  name: string;
  description: string;
  whenToUse?: string;
  body: string;
  allowedGroups?: AiToolGroupId[];
  model?: string;
  source: {
    origin: "project" | "global" | "builtin";
    tool?: string;
    path?: string;
  };
}

export interface AiLibraryMcpServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  transport?: "http" | "sse";
  oauthClientId?: string;
  oauthScopes?: string;
}

export interface AiLibraryMcpStatus {
  connecting: boolean;
  connected: boolean;
  tools: McpTool[];
  error?: string;
  authState?: "discovering" | "waiting-for-browser" | "exchanging" | "error";
}

export type AiLibraryArtifactKind =
  | "memory"
  | "skill"
  | "agent"
  | "command"
  | "mcp"
  | "rules"
  | "settings";

export interface AiLibraryDiscoveredArtifact {
  detectorId: string;
  kind: AiLibraryArtifactKind;
  tool: string;
  target: "project-context" | "skill" | "persona" | "slash" | "mcp" | "info";
  path: string;
  name: string;
  description?: string;
}

export interface AiLibraryDiscoveryResult {
  root: string;
  scopeKey: string;
  artifacts: AiLibraryDiscoveredArtifact[];
  counts: Record<AiLibraryArtifactKind, number>;
}

/** Serializable read model returned across the main/renderer capability seam. */
export interface AiLibrarySnapshot {
  agents: AiLibraryAgent[];
  customAgents: AiLibraryAgent[];
  activeAgentId: string;
  snippets: AiLibrarySnippet[];
  skills: AiLibrarySkill[];
  disabledSkillIds: string[];
  enabledProjectSkills: Record<string, string[]>;
  enabledMcpServers: Record<string, string[]>;
  userMcpServers: AiLibraryMcpServer[];
  disabledUserMcpServers: string[];
  mcpStatus: Record<string, AiLibraryMcpStatus>;
}

/** Application-wide personas, snippets, skills, and MCP configuration. The
 * selected provider owns persistence and connection reconciliation; consumers
 * never coordinate stores or create duplicate MCP clients. */
export interface AiLibraryCapability {
  snapshot(): Promise<AiLibrarySnapshot>;
  discover(
    root: string | null,
    workspace: WorkspaceEnv,
    refresh?: boolean,
  ): Promise<AiLibraryDiscoveryResult>;
  setActiveAgent(id: string): Promise<void>;
  upsertAgent(agent: AiLibraryAgent): Promise<void>;
  removeAgent(id: string): Promise<void>;
  upsertSnippet(snippet: AiLibrarySnippet): Promise<void>;
  removeSnippet(id: string): Promise<void>;
  upsertSkill(skill: AiLibrarySkill): Promise<void>;
  removeSkill(id: string): Promise<void>;
  toggleSkill(id: string): Promise<void>;
  setProjectSkillEnabled(scopeRootKey: string, key: string, enabled: boolean): Promise<void>;
  setMcpServerEnabled(scopeRootKey: string, server: AiLibraryMcpServer, enabled: boolean): Promise<void>;
  addMcpServers(servers: AiLibraryMcpServer[]): Promise<void>;
  removeMcpServer(name: string): Promise<void>;
  toggleMcpServer(server: AiLibraryMcpServer): Promise<void>;
  connectMcpServer(server: AiLibraryMcpServer): Promise<void>;
  disconnectMcpServer(name: string): Promise<void>;
  signOutMcpServer(name: string): Promise<void>;
}

export type AiLibrarySourceContribution =
  | {
      id: string;
      kind: "mcp";
      capability: McpClientsCapability;
    }
  | {
      id: string;
      kind: "workspace-files";
      capability: WorkspaceFilesCapability;
    };

/** Stable registry for independently removable AI-library source adapters. */
export interface AiLibrarySourceRegistry {
  register(entry: AiLibrarySourceContribution): Dispose;
  snapshot(): readonly AiLibrarySourceContribution[];
  subscribe(listener: () => void): Dispose;
}
