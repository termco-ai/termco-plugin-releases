import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@termco/workflows-base";
import { BUILTIN_TAGS, BUILTIN_WORKFLOWS } from "./builtins";
import {
  extractPlaceholders,
  missingRequired,
  renderSteps,
} from "./domain";

const workflow = (patch: Partial<WorkflowDefinition>): WorkflowDefinition => ({
  id: "test",
  name: "Test",
  command: "",
  parameters: [],
  tags: [],
  target: { kind: "focused_terminal" },
  source: "user",
  ...patch,
});

describe("workflow domain", () => {
  it("ships the complete categorized built-in library", () => {
    expect(BUILTIN_WORKFLOWS.length).toBeGreaterThan(100);
    expect(new Set(BUILTIN_WORKFLOWS.map((entry) => entry.id)).size).toBe(
      BUILTIN_WORKFLOWS.length,
    );
    expect(BUILTIN_TAGS).toContain("git");
    expect(BUILTIN_TAGS).toContain("docker");
  });

  it("extracts distinct parameters and renders defaults and quoted values", () => {
    const definition = workflow({
      command: "echo {{ value }} {{count}} {{value}}",
      parameters: [
        { name: "value", source: "text", quote: true },
        { name: "count", source: "text", default: "2" },
      ],
    });
    expect(extractPlaceholders(definition.command)).toEqual(["value", "count"]);
    expect(renderSteps(definition, { value: "hello world" })).toEqual([
      "echo 'hello world' 2 'hello world'",
    ]);
  });

  it("reports only required parameters without values or defaults", () => {
    const definition = workflow({
      parameters: [
        { name: "host", source: "ssh_host", required: true },
        { name: "port", source: "port", required: true, default: "22" },
      ],
    });
    expect(missingRequired(definition, {})).toEqual(["host"]);
  });
});
