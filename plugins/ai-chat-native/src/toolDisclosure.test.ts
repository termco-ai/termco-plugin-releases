import type { AiToolEntry } from "@termco/ai-tools-base";
import { describe, expect, it } from "vitest";
import { createToolDisclosure } from "./toolDisclosure";

function definition(description: string): AiToolEntry {
  return {
    description,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => ({ ok: true }),
  };
}

const definitions = {
  ask_user: definition("Ask the user a short decision question."),
  read_file: definition("Read a UTF-8 source file."),
  grep: definition("Search file contents with a regular expression."),
  bash_run: definition("Run a shell command and return its output."),
  git_status: definition("Show repository status and changed files."),
  browser_open: definition("Open a web page in the application browser."),
  plugin_create: definition("Create a new independent managed plugin."),
  plugin_fork: definition("Fork an existing plugin without replacing it."),
} satisfies Record<string, AiToolEntry>;

const groups = new Map<string, string>([
  ["ask_user", "core"],
  ["read_file", "files"],
  ["grep", "files"],
  ["bash_run", "terminal"],
  ["git_status", "git"],
  ["browser_open", "browser"],
  ["plugin_create", "plugin-dev"],
  ["plugin_fork", "plugin-dev"],
]);

describe("tool disclosure", () => {
  it("starts with a small useful core while every authorized tool stays searchable", () => {
    const disclosure = createToolDisclosure({ definitions, groups });

    expect(disclosure.activeToolNames()).toEqual([
      "ask_user",
      "read_file",
      "grep",
      "bash_run",
      "tool_search",
    ]);
    expect(disclosure.catalogSize).toBe(8);
    expect(disclosure.activeToolNames()).not.toContain("browser_open");

    const result = disclosure.search("open web page");
    expect(result.matches).toEqual([
      expect.objectContaining({ name: "browser_open", group: "browser" }),
    ]);
    expect(disclosure.activeToolNames()).toContain("browser_open");
  });

  it("uses persona groups as eager hints rather than capability restrictions", () => {
    const disclosure = createToolDisclosure({
      definitions,
      groups,
      preferredGroups: ["plugin-dev", "files"],
    });

    expect(disclosure.activeToolNames()).toEqual(expect.arrayContaining([
      "plugin_create",
      "plugin_fork",
      "read_file",
      "grep",
    ]));
    expect(disclosure.activeToolNames()).not.toContain("git_status");

    expect(disclosure.search("repository changed files").matches[0]).toEqual(
      expect.objectContaining({ name: "git_status" }),
    );
    expect(disclosure.activeToolNames()).toContain("git_status");
  });

  it("keeps discovered tools for the current turn and releases them for the next", () => {
    const currentTurn = createToolDisclosure({ definitions, groups });
    currentTurn.search("browser");
    expect(currentTurn.activeToolNames()).toContain("browser_open");

    const nextTurn = createToolDisclosure({ definitions, groups });
    expect(nextTurn.activeToolNames()).not.toContain("browser_open");
  });

  it("indexes nested schema parameter names and descriptions with ranked partial matching", () => {
    const schemaOnly = definition("");
    schemaOnly.inputSchema = {
      type: "object",
      properties: {
        destinationUrl: {
          type: "string",
          description: "Navigate to an HTTP address in a visible browser tab.",
        },
      },
    };
    const disclosure = createToolDisclosure({
      definitions: { ...definitions, browser_navigate: schemaOnly },
      groups: new Map([...groups, ["browser_navigate", "browser"]]),
    });

    expect(disclosure.search("navigate address").matches[0]).toMatchObject({
      name: "browser_navigate",
    });
    expect(disclosure.search("HTTP destination URL").matches[0]).toMatchObject({
      name: "browser_navigate",
    });
  });

  it("reports disclosure telemetry without exposing the hidden definitions", () => {
    const disclosure = createToolDisclosure({ definitions, groups });
    disclosure.search("web page");
    disclosure.search("capability that does not exist");

    expect(disclosure.telemetry()).toMatchObject({
      catalogSize: 8,
      searches: 2,
      zeroMatchSearches: 1,
      loadedCount: 1,
    });
    expect(disclosure.telemetry().eagerCount).toBeLessThan(8);
  });

  it("never reveals tools hidden by product policy", () => {
    const disclosure = createToolDisclosure({
      definitions,
      groups,
      hiddenGroups: ["browser"],
    });

    expect(disclosure.search("open web page")).toMatchObject({
      matches: [],
      loaded: [],
    });
    expect(disclosure.catalogSize).toBe(7);
  });
});
