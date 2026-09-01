import type {
  AiToolContribution,
  AiToolEntry,
  AiToolRuntime,
} from "@termco/ai-tools-base";

/** The deliberately narrow application-control surface offered to external
 * coding agents. Internal chat tools are broader; additions here are a public
 * protocol decision and must be explicit. */
export const MCP_EXPOSED_TOOL_NAMES = [
  "list_tabs",
  "focus_view",
  "terminal_run",
  "browser_navigate",
  "browser_read_page",
  "browser_screenshot",
  "browser_scroll",
  "browser_back",
  "browser_click",
  "browser_type",
  "browser_press_key",
  "browser_console",
  "browser_network",
  "browser_network_body",
  "browser_evaluate",
  "browser_forward",
  "browser_reload",
  "browser_wait_for",
  "browser_hover",
  "browser_select_option",
  "browser_file_upload",
  "browser_handle_dialog",
  "browser_list_tabs",
  "browser_open_tab",
  "browser_switch_tab",
  "browser_close_tab",
  "container_list",
  "container_logs",
  "container_logs_search",
  "container_inspect",
  "container_stats",
  "container_action",
  "ports_list",
  "ports_scan",
  "port_forward_add",
  "port_forward_start",
  "port_forward_stop",
  "port_forward_remove",
  "list_workflows",
  "run_workflow",
  "save_workflow",
  "ask_user",
  "show_ui",
] as const;

const EXPOSED_CONTRIBUTION_IDS = new Set([
  "terminal",
  "view",
  "browser",
  "containers",
  "ports",
  "workflows",
  "ask-user",
  "ui",
]);

const RUN_ONLY_NAMES = new Set(["ask_user", "show_ui"]);

export type McpSurfaceEntry = {
  name: string;
  description: string;
  inputSchema: unknown;
  needsApproval: boolean;
  runOnly: boolean;
};

export function buildExposedTools(
  contributions: readonly AiToolContribution[],
  runtime: AiToolRuntime,
): Record<string, AiToolEntry> {
  const tools: Record<string, AiToolEntry> = {};
  for (const contribution of contributions) {
    if (!EXPOSED_CONTRIBUTION_IDS.has(contribution.id)) continue;
    Object.assign(tools, contribution.build(runtime));
  }
  return tools;
}

function permissiveSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

/** Build the advertised surface from the exact same public definitions used
 * by chat. Contribution builders may inspect runtime only from execute
 * closures, so an empty metadata runtime is sufficient here. */
export function buildMcpSurface(
  contributions: readonly AiToolContribution[],
): McpSurfaceEntry[] {
  const tools = buildExposedTools(contributions, {});
  const entries: McpSurfaceEntry[] = [];
  for (const name of MCP_EXPOSED_TOOL_NAMES) {
    const tool = tools[name];
    if (!tool) continue;
    entries.push({
      name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? permissiveSchema(),
      needsApproval:
        tool.needsApproval === true ||
        typeof tool.needsApproval === "function",
      runOnly: RUN_ONLY_NAMES.has(name),
    });
  }
  return entries;
}

export function mcpSurfaceNames(
  contributions: readonly AiToolContribution[],
): string[] {
  return buildMcpSurface(contributions).map((entry) => entry.name);
}

export function isRunOnlyTool(name: string): boolean {
  return RUN_ONLY_NAMES.has(name);
}
