// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { openAgentsView } from "../../runtime/agentsView";
import type { AiLibraryAgent as Agent } from "@termco/ai-library-base";
import { useAgentsStore } from "../../store/agentsStore";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSwitcher } from "./AgentSwitcher";

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));
vi.mock("../../runtime/agentsView", () => ({
  openAgentsView: vi.fn(),
}));

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  Popover: ({
    children,
    open,
  }: {
    children?: React.ReactNode;
    open?: boolean;
  }) => (
    <div data-testid="popover-root" data-open={String(open)}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

const BUILTIN_AGENTS: readonly Agent[] = [
  {
    id: "builtin:coder",
    name: "Coder",
    description: "General-purpose coding assistant. Writes, edits, and runs.",
    instructions: "Build the requested change.",
    icon: "coder",
    builtIn: true,
  },
  {
    id: "builtin:reviewer",
    name: "Code Reviewer",
    description: "Reviews diffs for correctness, performance, and security.",
    instructions: "Review the requested change.",
    icon: "reviewer",
    builtIn: true,
  },
];

const customAgent: Agent = {
  id: "custom:one",
  name: "My Agent",
  description: "Does things",
  instructions: "do it",
  icon: "spark",
  builtIn: false,
};

beforeEach(() => {
  useAgentsStore.setState({
    agents: [...BUILTIN_AGENTS],
    customAgents: [],
    activeId: BUILTIN_AGENTS[0].id,
    setActiveId: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentSwitcher", () => {
  it("uses a non-modal popover agent chooser", () => {
    render(<AgentSwitcher />);
    expect(screen.getByTestId("popover-root")).toBeInTheDocument();
  });

  it("shows the active agent in the trigger", () => {
    render(<AgentSwitcher />);
    const trigger = screen.getByTestId("popover-trigger");
    expect(trigger).toHaveTextContent(BUILTIN_AGENTS[0].name);
    expect(within(trigger).getByRole("button")).toHaveAttribute(
      "title",
      `Agent: ${BUILTIN_AGENTS[0].name}`,
    );
  });

  it("falls back to the first agent when activeId is unknown", () => {
    useAgentsStore.setState({ activeId: "gone" });
    render(<AgentSwitcher />);
    expect(screen.getByTestId("popover-trigger")).toHaveTextContent(
      BUILTIN_AGENTS[0].name,
    );
  });

  it("lists every built-in agent with its description", () => {
    render(<AgentSwitcher />);
    const content = screen.getByTestId("popover-content");
    for (const a of BUILTIN_AGENTS) {
      expect(within(content).getByText(a.name)).toBeInTheDocument();
      expect(within(content).getByText(a.description)).toBeInTheDocument();
    }
  });

  it("omits the Custom section when there are no custom agents", () => {
    render(<AgentSwitcher />);
    expect(screen.queryByText("Your agents")).not.toBeInTheDocument();
  });

  it("lists custom agents under their own section", () => {
    useAgentsStore.setState({
      agents: [...BUILTIN_AGENTS, customAgent],
      customAgents: [customAgent],
    });
    render(<AgentSwitcher />);
    expect(screen.getByText("Your agents")).toBeInTheDocument();
    expect(screen.getByText("My Agent")).toBeInTheDocument();
    expect(screen.getByText("Does things")).toBeInTheDocument();
  });

  it("switches the active agent on select", () => {
    render(<AgentSwitcher />);
    fireEvent.click(screen.getByText(BUILTIN_AGENTS[1].name));
    expect(useAgentsStore.getState().setActiveId).toHaveBeenCalledWith(
      BUILTIN_AGENTS[1].id,
    );
  });

  it("switches to a custom agent on select", () => {
    useAgentsStore.setState({
      agents: [...BUILTIN_AGENTS, customAgent],
      customAgents: [customAgent],
    });
    render(<AgentSwitcher />);
    fireEvent.click(screen.getByText("My Agent"));
    expect(useAgentsStore.getState().setActiveId).toHaveBeenCalledWith(
      "custom:one",
    );
  });

  it("marks the active row", () => {
    useAgentsStore.setState({ activeId: BUILTIN_AGENTS[1].id });
    render(<AgentSwitcher />);
    const rows = screen.getAllByRole("menuitem");
    const active = rows.find((r) =>
      r.textContent?.includes(BUILTIN_AGENTS[1].name),
    );
    expect(active?.className).toContain("bg-[var(--signal-soft)]");
  });

  it("opens the agents view from Manage agents", () => {
    render(<AgentSwitcher />);
    fireEvent.click(screen.getByText("Create and manage agents"));
    expect(openAgentsView).toHaveBeenCalled();
  });
});
