import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";
import type { McpClientsCapability, McpTool } from "@termco/mcp-base";

export type McpToolEntry = { server: string; tool: McpTool };
export type McpToolContext = { getMcpTools?(): McpToolEntry[] };

/** Tool names accept only letters, numbers, underscore, and hyphen. */
export function sanitizeToolName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Flatten all-text MCP content while preserving mixed/rich blocks. */
export function normalizeMcpContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  const texts = content
    .filter(
      (block): block is { type: string; text: string } =>
        Boolean(block) &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text);
  return texts.length === content.length ? texts.join("\n") : content;
}

export function buildMcpTools(
  clients: Pick<McpClientsCapability, "call">,
  context: McpToolContext,
): Record<string, AiToolDefinition> {
  const tools: Record<string, AiToolDefinition> = {};
  const seen = new Set<string>();
  for (const { server, tool: definition } of context.getMcpTools?.() ?? []) {
    const base = `mcp__${sanitizeToolName(server)}__${sanitizeToolName(definition.name)}`;
    let name = base;
    let suffix = 2;
    while (seen.has(name)) name = `${base}_${suffix++}`;
    seen.add(name);

    tools[name] = {
      description:
        definition.description ??
        `MCP tool "${definition.name}" from server "${server}".`,
      inputSchema:
        (definition.inputSchema as Record<string, unknown> | undefined) ??
        {
          type: "object",
          properties: {},
        },
      needsApproval: true,
      execute: async (argumentsValue: unknown) => {
        const raw = await clients.call(server, definition.name, argumentsValue);
        const result =
          raw && typeof raw === "object"
            ? (raw as Record<string, unknown>)
            : { content: raw };
        if ("error" in result) return { error: String(result.error) };
        return {
          content: normalizeMcpContent(result.content),
          ...(result.isError ? { isError: true } : {}),
        };
      },
    };
  }
  return tools;
}

export function createMcpToolContribution(
  clients: Pick<McpClientsCapability, "call">,
): AiToolContribution {
  return {
    id: "mcp",
    group: "mcp",
    order: 210,
    build: (context) => buildMcpTools(clients, context as McpToolContext),
  };
}
