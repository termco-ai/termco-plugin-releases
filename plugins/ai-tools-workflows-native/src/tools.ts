import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";
import type {
  WorkflowDefinition,
  WorkflowsLibraryCapability,
  WorkflowValues,
} from "@termco/workflows-base";
import { checkShellCommand } from "./security";

export interface WorkflowToolContext {
  injectIntoActivePty(text: string): boolean;
  runInTerminal?(command: string): Promise<{ output: string; cwd: string | null } | { error: string }>;
}

function object(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

const stringMapSchema = {
  type: "object",
  additionalProperties: { type: "string" },
};

export function buildWorkflowTools(
  library: WorkflowsLibraryCapability,
  context: WorkflowToolContext,
): Record<string, AiToolDefinition> {
  return {
    list_workflows: {
      description: "List reusable command workflows with their explanations, categories, and required parameters. Use this before run_workflow.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Optional name, category, explanation, or command filter." } },
        additionalProperties: false,
      },
      execute(input) {
        const query = typeof object(input).query === "string" ? String(object(input).query).trim().toLowerCase() : "";
        return {
          workflows: library.all().filter((workflow) => !query || workflow.name.toLowerCase().includes(query) || workflow.description?.toLowerCase().includes(query) || workflow.command.toLowerCase().includes(query) || workflow.tags.some((tag) => tag.toLowerCase().includes(query))).map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            tags: workflow.tags,
            target: workflow.target,
            availability: library.availability(workflow),
            parameters: workflow.parameters.map((parameter) => ({ name: parameter.name, description: parameter.description, source: parameter.source, required: parameter.required ?? false, default: parameter.default })),
          })),
        };
      },
    },
    run_workflow: {
      description: "Run a saved workflow by id in the user's visible terminal. Always asks the user for approval first.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Workflow id returned by list_workflows." },
          values: stringMapSchema,
        },
        required: ["id"],
        additionalProperties: false,
      },
      needsApproval: true,
      async execute(input) {
        const values = object(input);
        const id = String(values.id ?? "");
        const workflow = library.get(id);
        if (!workflow) return { error: `No workflow with id ${id}` };
        const parameters = values.values && typeof values.values === "object" ? values.values as WorkflowValues : {};
        const missing = library.missingRequired(workflow, parameters);
        if (missing.length) return { error: `Missing required parameters: ${missing.join(", ")}` };
        const command = library.renderSteps(workflow, parameters).filter((part) => part.trim()).join(" && ").replace(/\r?\n/g, " ").trim();
        const safety = checkShellCommand(command);
        if (!safety.ok) return { error: safety.reason };
        if (typeof library.run === "function") {
          const outcome = await library.run(
            workflow,
            parameters,
            { kind: "focused_terminal" },
          );
          if (!outcome.ok) {
            return {
              error: outcome.error,
              unavailable: outcome.unavailable ?? false,
            };
          }
        } else if (context.runInTerminal) {
          const result = await context.runInTerminal(command);
          if ("error" in result) return result;
        } else if (!context.injectIntoActivePty(`${command}\r`)) {
          return { error: "No active terminal to run in." };
        }
        await library.recordRun({ workflowId: workflow.id, command, values: parameters, target: { kind: "focused_terminal" }, at: Date.now() });
        return { ran: command };
      },
    },
    save_workflow: {
      description: "Save a command as a reusable workflow. Use {{name}} placeholders for parameters. Always asks the user for approval first.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          command: { type: "string", minLength: 1, description: "Command template with optional {{name}} placeholders." },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["name", "command"],
        additionalProperties: false,
      },
      needsApproval: true,
      async execute(input) {
        const values = object(input);
        const name = String(values.name ?? "").trim();
        const command = String(values.command ?? "").trim();
        const safety = checkShellCommand(command.replace(/\{\{[^}]+\}\}/g, "value"));
        if (!safety.ok) return { error: safety.reason };
        const workflow: WorkflowDefinition = {
          id: library.newId(),
          name,
          command,
          description: typeof values.description === "string" ? values.description.trim() || undefined : undefined,
          parameters: library.extractPlaceholders(command).map((parameter) => ({ name: parameter, source: "text" })),
          tags: Array.isArray(values.tags) ? values.tags.map(String) : [],
          target: { kind: "focused_terminal" },
          source: "user",
        };
        await library.upsert(workflow);
        return { saved: workflow.id, name: workflow.name };
      },
    },
  };
}

export function createWorkflowToolContribution(
  library: WorkflowsLibraryCapability,
): AiToolContribution {
  return {
    id: "workflows",
    group: "terminal",
    order: 110,
    build: (context) => buildWorkflowTools(library, context as WorkflowToolContext),
  };
}
