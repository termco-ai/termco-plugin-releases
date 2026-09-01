import { describe, expect, it } from "vitest";
import type { AiToolContribution, AiToolEntry } from "@termco/ai-tools-base";
import {
  buildMcpSurface,
  MCP_EXPOSED_TOOL_NAMES,
  mcpSurfaceNames,
} from "./toolSurface";

const approvalTools = new Set([
  "terminal_run",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_press_key",
  "browser_network_body",
  "browser_evaluate",
  "browser_select_option",
  "browser_file_upload",
  "browser_open_tab",
  "container_action",
  "port_forward_add",
  "port_forward_start",
  "port_forward_stop",
  "port_forward_remove",
  "run_workflow",
  "save_workflow",
]);

function definition(name: string): AiToolEntry {
  return {
    description: `Description for ${name}`,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    ...(approvalTools.has(name) ? { needsApproval: true } : {}),
    ...(["ask_user", "show_ui"].includes(name)
      ? {}
      : { execute: async () => ({ ok: true }) }),
  };
}

function contributions(): AiToolContribution[] {
  const byId: Record<string, string[]> = {
    view: ["list_tabs", "focus_view"],
    terminal: ["terminal_run"],
    browser: MCP_EXPOSED_TOOL_NAMES.filter((name) =>
      name.startsWith("browser_"),
    ),
    containers: MCP_EXPOSED_TOOL_NAMES.filter((name) =>
      name.startsWith("container_"),
    ),
    ports: MCP_EXPOSED_TOOL_NAMES.filter(
      (name) => name.startsWith("port_") || name.startsWith("ports_"),
    ),
    workflows: ["list_workflows", "run_workflow", "save_workflow"],
    "ask-user": ["ask_user"],
    ui: ["show_ui"],
  };
  return Object.entries(byId).map(([id, names]) => ({
    id,
    group: id,
    build: () =>
      Object.fromEntries(names.map((name) => [name, definition(name)])),
  }));
}

describe("MCP tool surface", () => {
  it("exposes exactly the curated set", () => {
    expect(mcpSurfaceNames(contributions()).sort()).toEqual(
      [...MCP_EXPOSED_TOOL_NAMES].sort(),
    );
  });

  it("never exposes broad internal chat tools", () => {
    const names = new Set(mcpSurfaceNames(contributions()));
    for (const forbidden of [
      "read_file",
      "write_file",
      "edit_file",
      "bash_run",
      "git_status",
      "grep",
      "lsp_hover",
      "run_subagent",
      "todo_write",
      "read_transcript",
      "skill",
    ]) {
      expect(names.has(forbidden)).toBe(false);
    }
  });

  it("marks only ask_user and show_ui as run-only", () => {
    expect(
      buildMcpSurface(contributions())
        .filter((entry) => entry.runOnly)
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(["ask_user", "show_ui"]);
  });

  it("preserves descriptions, schemas, and approval metadata", () => {
    const surface = buildMcpSurface(contributions());
    expect(surface.every((entry) => entry.description.length > 0)).toBe(true);
    expect(surface.find((entry) => entry.name === "terminal_run")).toMatchObject(
      {
        needsApproval: true,
        inputSchema: { type: "object" },
      },
    );
    expect(surface.find((entry) => entry.name === "list_tabs")?.needsApproval)
      .toBe(false);
  });
});
