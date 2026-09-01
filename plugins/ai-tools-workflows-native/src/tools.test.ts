import { describe, expect, it, vi } from "vitest";
import type {
  WorkflowDefinition,
  WorkflowsLibraryCapability,
} from "@termco/workflows-base";
import { buildWorkflowTools } from "./tools";

const definition: WorkflowDefinition = {
  id: "deploy",
  name: "Deploy",
  description: "Deploy the current service.",
  command: "deploy --environment {{environment}}",
  parameters: [{ name: "environment", source: "enum", required: true }],
  tags: ["release"],
  target: { kind: "focused_terminal" },
  source: "user",
};

function library(): WorkflowsLibraryCapability {
  return {
    snapshot: () => ({ hydrated: true, workflows: [definition], userWorkflows: [definition], favoriteIds: [], recent: [] }),
    subscribe: () => () => {},
    all: () => [definition],
    visible: () => [definition],
    get: (id) => id === definition.id ? definition : undefined,
    isFavorite: () => false,
    lastValues: () => undefined,
    newId: () => "new-id",
    extractPlaceholders: (template) => [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]),
    renderSteps: (workflow, values) => [workflow.command.replace("{{environment}}", values.environment ?? "")],
    missingRequired: (_workflow, values) => values.environment ? [] : ["environment"],
    availability: () => ({ available: true }),
    run: undefined as never,
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    toggleFavorite: vi.fn(async () => {}),
    recordRun: vi.fn(async () => {}),
  };
}

describe("workflow AI tools", () => {
  it("lists searchable explanations and parameters", async () => {
    const tools = buildWorkflowTools(library(), { injectIntoActivePty: () => false });
    const result = await tools.list_workflows.execute({ query: "release" }) as { workflows: Array<{ id: string }> };
    expect(result.workflows).toEqual([expect.objectContaining({ id: "deploy" })]);
  });

  it("approval-gates execution and uses the active terminal context", async () => {
    const runInTerminal = vi.fn(async () => ({ output: "ok", cwd: "/repo" }));
    const capability = library();
    const tools = buildWorkflowTools(capability, { injectIntoActivePty: () => false, runInTerminal });
    expect(tools.run_workflow.needsApproval).toBe(true);
    await tools.run_workflow.execute({ id: "deploy", values: { environment: "prod" } });
    expect(runInTerminal).toHaveBeenCalledWith("deploy --environment prod");
    expect(capability.recordRun).toHaveBeenCalled();
  });

  it("refuses catastrophic commands even after approval", async () => {
    const catastrophic = { ...definition, command: "rm -rf /", parameters: [] };
    const capability = { ...library(), get: () => catastrophic, renderSteps: () => [catastrophic.command], missingRequired: () => [] };
    const tools = buildWorkflowTools(capability, { injectIntoActivePty: () => true });
    await expect(tools.run_workflow.execute({ id: "deploy" })).resolves.toEqual(expect.objectContaining({ error: expect.stringContaining("filesystem root") }));
  });
});
