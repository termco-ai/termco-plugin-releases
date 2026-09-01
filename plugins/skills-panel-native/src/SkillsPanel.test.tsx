// @vitest-environment jsdom

import type {
  AiLibraryArtifactKind as ArtifactKind,
  AiLibraryDiscoveredArtifact as DiscoveredArtifact,
  AiLibraryDiscoveryResult as DiscoveryResult,
} from "@termco/ai-library-base";
import type { SkillsDetector } from "./detector";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsPanel } from "./SkillsPanel";

vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: () => <svg aria-hidden="true" />,
}));

const h = vi.hoisted(() => ({
  state: {
    hydrate: vi.fn(async () => {}),
    enabledProject: {} as Record<string, string[]>,
    setProjectEnabled: vi.fn(),
    importSkill: vi.fn(),
    library: [] as {
      id: string;
      name: string;
      description?: string;
      source: { path?: string };
    }[],
    libraryDisabled: [] as string[],
    toggleLibrary: vi.fn(),
    removeFromLibrary: vi.fn(),
  },
  agents: {
    customAgents: [] as { id: string; name: string; description?: string }[],
    upsert: vi.fn(),
    hydrate: vi.fn(async () => {}),
    activeId: "",
    setActiveId: vi.fn(),
    remove: vi.fn(),
  },
  snippets: {
    snippets: [] as {
      id: string;
      handle: string;
      name?: string;
      description?: string;
    }[],
    upsert: vi.fn(),
    hydrate: vi.fn(async () => {}),
    remove: vi.fn(),
  },
  mcp: {
    hydrate: vi.fn(async () => {}),
    status: {} as Record<string, unknown>,
    enabledServers: {} as Record<string, string[]>,
    setServerEnabled: vi.fn(async () => {}),
    connectServer: vi.fn(async () => {}),
    userServers: [] as { name: string; url?: string }[],
    addUserServers: vi.fn(async () => {}),
    isUserDisabled: vi.fn(() => false),
    toggleUserServer: vi.fn(async () => {}),
    removeUserServer: vi.fn(async () => {}),
  },
  readFile: vi.fn(),
}));

vi.mock("./libraryStore", () => ({
  newSkillId: () => "sk-new",
  useSkillsStore: (sel: (s: typeof h.state) => unknown) => sel(h.state),
  newAgentId: () => "a-new",
  useAgentsStore: (sel: (s: typeof h.agents) => unknown) => sel(h.agents),
  newSnippetId: () => "s-new",
  useSnippetsStore: (sel: (s: typeof h.snippets) => unknown) => sel(h.snippets),
  useMcpStore: (sel: (s: typeof h.mcp) => unknown) => sel(h.mcp),
}));
vi.mock("./fileRuntime", () => ({
  native: { readFile: h.readFile },
}));

afterEach(cleanup);
beforeEach(() => {
  h.state.enabledProject = {};
  h.state.library = [];
  h.agents.customAgents = [];
  h.snippets.snippets = [];
  h.mcp.status = {};
  h.mcp.enabledServers = {};
  h.mcp.userServers = [];
  h.agents.activeId = "";
  h.mcp.isUserDisabled = vi.fn(() => false);
  vi.clearAllMocks();
});

const art = (
  kind: DiscoveredArtifact["kind"],
  name: string,
  target: DiscoveredArtifact["target"],
  path = `/repo/${name}`,
): DiscoveredArtifact => ({
  detectorId: `d-${name}`,
  kind,
  tool: "Claude Code",
  target,
  path,
  name,
});

const withArtifacts = (artifacts: DiscoveredArtifact[]): DiscoveryResult => {
  const counts = {
    memory: 0,
    skill: 0,
    agent: 0,
    command: 0,
    mcp: 0,
    rules: 0,
    settings: 0,
  } satisfies Record<ArtifactKind, number>;
  for (const a of artifacts) counts[a.kind] += 1;
  return { root: "/repo", scopeKey: "local", artifacts, counts };
};

function detector(over: Partial<SkillsDetector> = {}): SkillsDetector {
  return { count: 0, result: null, loading: false, refresh: vi.fn(), ...over };
}

describe("SkillsPanel", () => {
  it("prompts to open a folder when there is no result", () => {
    render(<SkillsPanel detector={detector()} />);
    expect(screen.getByText(/Open a folder/)).toBeDefined();
  });

  it("shows an empty state when a folder has nothing recognized", () => {
    render(<SkillsPanel detector={detector({ result: withArtifacts([]) })} />);
    expect(screen.getByText(/Nothing recognized/)).toBeDefined();
  });

  it("shows a pill per kind (with counts) and defaults to the first kind", () => {
    const result = withArtifacts([
      art("skill", "pdf-fill", "skill"),
      art("agent", "Reviewer", "persona"),
    ]);
    render(<SkillsPanel detector={detector({ count: 2, result })} />);
    // pills exist for both kinds, with counts…
    expect(screen.getByRole("button", { name: /Skills\s*1/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Subagents\s*1/ })).toBeDefined();
    // …and only the first kind's rows show by default
    expect(screen.getByText("pdf-fill")).toBeDefined();
    expect(screen.queryByText("Reviewer")).toBeNull();
  });

  it("switches the body when another pill is clicked", () => {
    const result = withArtifacts([
      art("skill", "pdf-fill", "skill"),
      art("agent", "Reviewer", "persona"),
    ]);
    render(<SkillsPanel detector={detector({ count: 2, result })} />);
    fireEvent.click(screen.getByRole("button", { name: /Subagents/ }));
    expect(screen.getByText("Reviewer")).toBeDefined();
    expect(screen.queryByText("pdf-fill")).toBeNull();
  });

  it("shows the This-folder and Installed scope tabs", () => {
    const result = withArtifacts([art("skill", "pdf-fill", "skill")]);
    render(<SkillsPanel detector={detector({ result })} />);
    expect(screen.getByRole("button", { name: /This folder/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Installed/ })).toBeDefined();
  });

  it("toggles a project skill on", () => {
    const result = withArtifacts([
      art("skill", "pdf-fill", "skill", "/repo/.claude/skills/pdf/SKILL.md"),
    ]);
    render(<SkillsPanel detector={detector({ result })} />);
    fireEvent.click(screen.getByTitle("Enable for this project"));
    expect(h.state.setProjectEnabled).toHaveBeenCalledWith(
      "local::/repo",
      "/repo/.claude/skills/pdf/SKILL.md",
      true,
    );
  });

  it("imports a skill by reading + parsing its SKILL.md", async () => {
    h.readFile.mockResolvedValue({
      kind: "text",
      content: "---\nname: pdf-fill\ndescription: Fill PDFs\n---\ndo it",
      size: 0,
    });
    const result = withArtifacts([
      art("skill", "pdf-fill", "skill", "/repo/.claude/skills/pdf/SKILL.md"),
    ]);
    render(<SkillsPanel detector={detector({ result })} />);
    fireEvent.click(screen.getByTitle("Import to library"));
    await waitFor(() => expect(h.state.importSkill).toHaveBeenCalled());
    const skill = h.state.importSkill.mock.calls[0][0];
    expect(skill).toMatchObject({
      name: "pdf-fill",
      description: "Fill PDFs",
      body: "do it",
      source: { origin: "project", path: "/repo/.claude/skills/pdf/SKILL.md" },
    });
  });

  it("manages the installed skills library under the Installed scope", () => {
    h.state.library = [
      { id: "sk-1", name: "pdf-fill", description: "Fill PDFs", source: {} },
    ];
    render(<SkillsPanel detector={detector({ result: withArtifacts([]) })} />);
    fireEvent.click(screen.getByRole("button", { name: /Installed/ }));
    expect(screen.getByText("pdf-fill")).toBeDefined();
    fireEvent.click(screen.getByTitle("Remove from library"));
    expect(h.state.removeFromLibrary).toHaveBeenCalledWith("sk-1");
  });

  it("toggles an installed user MCP server (Installed scope)", () => {
    h.mcp.userServers = [{ name: "filesystem" }];
    h.mcp.status = {
      filesystem: { connecting: false, connected: true, tools: [] },
    };
    render(<SkillsPanel detector={detector({ result: withArtifacts([]) })} />);
    fireEvent.click(screen.getByRole("button", { name: /Installed/ }));
    fireEvent.click(screen.getByTitle("Deactivate everywhere"));
    expect(h.mcp.toggleUserServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "filesystem" }),
    );
  });

  it("activates an installed persona (Installed scope)", () => {
    h.agents.customAgents = [
      { id: "a1", name: "Reviewer", description: "reviews" },
    ];
    render(<SkillsPanel detector={detector({ result: withArtifacts([]) })} />);
    fireEvent.click(screen.getByRole("button", { name: /Installed/ }));
    fireEvent.click(screen.getByTitle("Use this persona"));
    expect(h.agents.setActiveId).toHaveBeenCalledWith("a1");
  });

  it("removes an installed snippet (Installed scope)", () => {
    h.snippets.snippets = [
      { id: "s1", handle: "deploy", name: "Deploy", description: "" },
    ];
    render(<SkillsPanel detector={detector({ result: withArtifacts([]) })} />);
    fireEvent.click(screen.getByRole("button", { name: /Installed/ }));
    fireEvent.click(screen.getByTitle("Remove snippet"));
    expect(h.snippets.remove).toHaveBeenCalledWith("s1");
  });

  it("opens the underlying file when the name is clicked", () => {
    const onOpenFile = vi.fn();
    const result = withArtifacts([
      art("memory", "AGENTS.md", "project-context", "/repo/AGENTS.md"),
    ]);
    render(
      <SkillsPanel detector={detector({ result })} onOpenFile={onOpenFile} />,
    );
    fireEvent.click(screen.getByTitle("Open /repo/AGENTS.md"));
    expect(onOpenFile).toHaveBeenCalledWith("/repo/AGENTS.md");
  });

  it("adopts a subagent as a persona", async () => {
    h.readFile.mockResolvedValue({
      kind: "text",
      content:
        "---\nname: Reviewer\ndescription: reviews\nmodel: gpt-5.5\n---\nbe strict",
      size: 0,
    });
    const result = withArtifacts([
      art("agent", "Reviewer", "persona", "/repo/.claude/agents/reviewer.md"),
    ]);
    render(<SkillsPanel detector={detector({ result })} />);
    fireEvent.click(screen.getByTitle("Adopt as a persona"));
    await waitFor(() => expect(h.agents.upsert).toHaveBeenCalled());
    expect(h.agents.upsert.mock.calls[0][0]).toMatchObject({
      name: "Reviewer",
      instructions: "be strict",
      model: "gpt-5.5",
      builtIn: false,
    });
  });

  it("adopts a command as a snippet", async () => {
    h.readFile.mockResolvedValue({
      kind: "text",
      content: "---\nname: deploy\n---\nship it",
      size: 0,
    });
    const result = withArtifacts([
      art("command", "deploy", "slash", "/repo/.claude/commands/deploy.md"),
    ]);
    render(<SkillsPanel detector={detector({ result })} />);
    fireEvent.click(screen.getByTitle("Adopt as a snippet"));
    await waitFor(() => expect(h.snippets.upsert).toHaveBeenCalled());
    expect(h.snippets.upsert.mock.calls[0][0]).toMatchObject({
      handle: "deploy",
      content: "ship it",
    });
  });

  it("lists MCP servers parsed from .mcp.json and connects on toggle", async () => {
    h.readFile.mockResolvedValue({
      kind: "text",
      content: JSON.stringify({
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "@mcp/fs"] },
        },
      }),
      size: 0,
    });
    const result = withArtifacts([
      art("mcp", ".mcp.json", "mcp", "/repo/.mcp.json"),
    ]);
    render(<SkillsPanel detector={detector({ result })} />);
    const toggle = await screen.findByTitle("Connect server");
    expect(screen.getByText("filesystem")).toBeDefined();
    expect(screen.getByText(/MCP servers · 1/)).toBeDefined();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(h.mcp.setServerEnabled).toHaveBeenCalledWith(
        "local::/repo",
        expect.objectContaining({ name: "filesystem", command: "npx" }),
        true,
      ),
    );
  });

  it("copies an MCP server into your servers (global)", async () => {
    h.readFile.mockResolvedValue({
      kind: "text",
      content: JSON.stringify({
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "@mcp/fs"] },
        },
      }),
      size: 0,
    });
    const result = withArtifacts([
      art("mcp", ".mcp.json", "mcp", "/repo/.mcp.json"),
    ]);
    render(<SkillsPanel detector={detector({ result })} />);
    const copy = await screen.findByTitle(/Copy to your servers/);
    fireEvent.click(copy);
    await waitFor(() =>
      expect(h.mcp.addUserServers).toHaveBeenCalledWith([
        expect.objectContaining({ name: "filesystem", command: "npx" }),
      ]),
    );
  });

  it("auto-reconnects a server enabled for the scope", async () => {
    h.mcp.enabledServers = { "local::/repo": ["filesystem"] };
    h.readFile.mockResolvedValue({
      kind: "text",
      content: JSON.stringify({
        mcpServers: { filesystem: { command: "npx", args: [] } },
      }),
      size: 0,
    });
    const result = withArtifacts([
      art("mcp", ".mcp.json", "mcp", "/repo/.mcp.json"),
    ]);
    render(<SkillsPanel detector={detector({ result })} />);
    await waitFor(() =>
      expect(h.mcp.connectServer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "filesystem" }),
      ),
    );
  });

  it("rescans on the refresh button", () => {
    const refresh = vi.fn();
    render(
      <SkillsPanel
        detector={detector({ result: withArtifacts([]), refresh })}
      />,
    );
    fireEvent.click(screen.getByTitle("Rescan folder"));
    expect(refresh).toHaveBeenCalled();
  });
});
