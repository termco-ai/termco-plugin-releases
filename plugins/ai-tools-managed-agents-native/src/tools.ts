import type {
  AiToolContribution,
  AiToolDefinition,
  AiToolRuntime,
} from "@termco/ai-tools-base";

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

export function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function tailLines(value: string, count: number): string {
  const lines = value.split("\n");
  return lines.length <= count ? value : lines.slice(-count).join("\n");
}

export function createManagedAgentTools(
  runtime: AiToolRuntime,
): Record<string, AiToolDefinition> {
  return {
    spawn_coding_agent: {
      description:
        "Spawn a coding agent in a new terminal tab and bind it to this chat session. Use when the user wants delegated implementation and no managed agent is active. Provide a complete self-contained prompt; the user approves it before launch.",
      inputSchema: objectSchema({
        prompt: { type: "string", minLength: 1, maxLength: 50_000 },
      }, ["prompt"]),
      needsApproval: true,
      execute: (input) => {
        if (runtime.getManagedCodingAgent?.()) {
          return {
            error: "a coding agent is already active in this session; use send_to_agent",
          };
        }
        const prompt = String((input as { prompt?: unknown }).prompt ?? "");
        const spawned = runtime.spawnManagedCodingAgent?.(prompt);
        return spawned
          ? {
              ok: true,
              tab_id: spawned.tabId,
              message: "Coding agent spawned. It will start working shortly.",
            }
          : { error: "could not spawn the agent in this session" };
      },
    },
    send_to_agent: {
      description:
        "Send one informed follow-up instruction to the active coding agent. Read its latest output first. Newlines are normalized and control characters are rejected before the user approves submission.",
      inputSchema: objectSchema({
        instruction: { type: "string", minLength: 1, maxLength: 20_000 },
      }, ["instruction"]),
      needsApproval: true,
      execute: async (input) => {
        if (!runtime.getManagedCodingAgent?.()) {
          return { error: "no coding agent is active in this session; use spawn_coding_agent" };
        }
        const instruction = String(
          (input as { instruction?: unknown }).instruction ?? "",
        ).replace(/\s*\r?\n\s*/g, " ").trim();
        if (!instruction) return { error: "empty instruction" };
        if (hasControlCharacters(instruction)) {
          return { error: "instruction contains control characters" };
        }
        const sent = await runtime.sendManagedCodingAgentInstruction?.(instruction);
        if (!sent) return { error: "managed agent input is unavailable" };
        if (!sent.ok) return { error: sent.error ?? "could not send instruction" };
        return { ok: true, sent: instruction, round: sent.round };
      },
    },
    read_agent_output: {
      description:
        "Inspect the coding agent bound to this chat: whether it is active, its phase and round budget, and a bounded tail of its terminal output. Call this before spawning or following up.",
      inputSchema: objectSchema({
        lines: { type: "integer", minimum: 1, maximum: 400 },
      }),
      execute: (input) => {
        const managed = runtime.getManagedCodingAgent?.();
        if (!managed) return { active: false };
        const requested = (input as { lines?: unknown }).lines;
        const lines = typeof requested === "number" ? requested : 120;
        const output = runtime.readManagedCodingAgentOutput?.() ?? "";
        return {
          active: true,
          phase: managed.phase,
          rounds: managed.rounds,
          max_rounds: managed.maxRounds,
          output: tailLines(output, lines),
        };
      },
    },
  };
}

export function createManagedAgentContribution(): AiToolContribution {
  return {
    id: "managed-agent",
    group: "agents",
    order: 180,
    build: (runtime) => createManagedAgentTools(runtime),
  };
}
