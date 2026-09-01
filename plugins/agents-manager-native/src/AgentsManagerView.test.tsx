// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type {
  AiLibraryAgent,
  AiLibraryCapability,
} from "@termco/ai-library-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsManagerView } from "./AgentsManagerView";
import { configureLibraryRuntime, hydrate, snapshot } from "./runtime";

const BASELINE_NAMES = [
  "Coder",
  "Architect",
  "Code Reviewer",
  "Security",
  "Designer",
  "Debugger",
  "Tester",
  "Refactorer",
  "DevOps",
  "Explainer",
  "Interviewer",
] as const;

function agent(name: string, index: number): AiLibraryAgent {
  return {
    id:
      index === 0
        ? "builtin:coder"
        : name === "Plugin Creator"
          ? "builtin:plugin-creator"
          : `builtin:fixture-${index}`,
    name,
    description: `${name} fixture`,
    instructions: `${name} instructions`,
    icon: index === 0 ? "coder" : "spark",
    builtIn: true,
    preferredToolGroups: name === "Plugin Creator"
      ? ["plugin-dev", "files"]
      : undefined,
  };
}

function fixture(options: { customAgent?: boolean } = {}) {
  const builtIns = [
    ...BASELINE_NAMES.map(agent),
    agent("Plugin Creator", BASELINE_NAMES.length),
  ];
  const customAgent: AiLibraryAgent = {
    id: "custom:writer",
    name: "Custom Writer",
    description: "Writes release notes",
    instructions: "Write concise release notes.",
    icon: "spark",
    builtIn: false,
  };
  const customAgents = options.customAgent ? [customAgent] : [];
  const agents = [...builtIns, ...customAgents];
  const library = {
    snapshot: vi.fn(async () => ({
      agents,
      customAgents,
      activeAgentId: "builtin:coder",
      snippets: [],
      skills: [],
      disabledSkillIds: [],
      enabledProjectSkills: {},
      enabledMcpServers: {},
      userMcpServers: [],
      disabledUserMcpServers: [],
      mcpStatus: {},
    })),
  } as unknown as AiLibraryCapability;
  const preferences = {
    get: vi.fn(async () => ""),
  } as unknown as PreferencesCapability;
  const events = {
    subscribe: vi.fn(() => () => {}),
  } as unknown as ApplicationEventsCapability;
  return { agents, library, preferences, events };
}

afterEach(cleanup);

describe("agents manager visual defaults", () => {
  it("projects the 11 baseline built-ins while retaining Plugin Creator in the library", async () => {
    const visual = fixture();
    const dispose = configureLibraryRuntime(
      visual.library,
      visual.preferences,
      visual.events,
    );
    await hydrate();

    render(<AgentsManagerView onClose={() => {}} />);

    expect(visual.agents).toHaveLength(12);
    expect(snapshot().agents).toContainEqual(
      expect.objectContaining({
        id: "builtin:plugin-creator",
        name: "Plugin Creator",
        preferredToolGroups: ["plugin-dev", "files"],
      }),
    );
    expect(screen.getAllByText("11 agents")).toHaveLength(1);
    for (const name of BASELINE_NAMES) {
      expect(screen.getByText(name)).toBeVisible();
    }
    expect(screen.queryByText("Plugin Creator")).toBeNull();
    dispose();
  });

  it("keeps custom agents searchable, editable, and creatable", async () => {
    const visual = fixture({ customAgent: true });
    const dispose = configureLibraryRuntime(
      visual.library,
      visual.preferences,
      visual.events,
    );
    await hydrate();

    render(<AgentsManagerView onClose={() => {}} />);

    expect(screen.getAllByText("12 agents")).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText("Filter agents…"), {
      target: { value: "Custom Writer" },
    });
    expect(screen.getByText("1 agent")).toBeVisible();
    expect(screen.getByText("Custom Writer")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit agent" })).toBeVisible();
    fireEvent.click(screen.getByTitle("Close (Esc)"));
    fireEvent.change(screen.getByPlaceholderText("Filter agents…"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "New agent" })[0]);
    expect(screen.getByRole("heading", { name: "New agent" })).toBeVisible();
    dispose();
  });
});
