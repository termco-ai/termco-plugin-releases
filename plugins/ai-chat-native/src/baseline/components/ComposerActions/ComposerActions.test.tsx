// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  c: {
    addFiles: vi.fn(),
    voice: {
      supported: false,
      hasKey: false,
      recording: false,
      transcribing: false,
      sttProvider: "openai",
      stop: vi.fn(),
      start: vi.fn(),
    },
    isBusy: false,
    submit: vi.fn(),
    stop: vi.fn(),
    canSend: true,
  },
}));

vi.mock("../../lib/composer", () => ({
  useComposer: () => mocks.c,
  ACCEPTED_FILES: "",
}));
vi.mock("./AutoRunToggle", () => ({ AutoRunToggle: () => null }));
vi.mock("./ThinkingToggle", () => ({ ThinkingToggle: () => null }));
vi.mock("../AgentSwitcher", () => ({
  AgentSwitcher: () => <div data-testid="agent-switcher" />,
}));
vi.mock("../AiStatusBarControls/ModelDropdown", () => ({
  ModelDropdown: () => <div data-testid="model" />,
}));
vi.mock("../AiStatusBarControls/IconBtn", () => ({
  IconBtn: ({
    children,
    onClick,
    title,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
  }) => (
    <button type="button" title={title} onClick={onClick}>
      {children}
    </button>
  ),
}));

import { ComposerActions } from "./ComposerActions";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.c.isBusy = false;
  mocks.c.canSend = true;
});

describe("ComposerActions", () => {
  it("renders the model picker and a send button; send submits", () => {
    const { container } = render(<ComposerActions />);
    expect(screen.getByTestId("model")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass(
      "@container/composer-actions",
    );
    expect(screen.getByText("Send")).toHaveClass(
      "@max-[20rem]/composer-actions:hidden",
    );
    fireEvent.click(screen.getByLabelText("Send"));
    expect(mocks.c.submit).toHaveBeenCalled();
  });

  it("disables send when nothing can be sent", () => {
    mocks.c.canSend = false;
    render(<ComposerActions />);
    expect(screen.getByLabelText("Send")).toBeDisabled();
  });

  it("shows a stop button while busy", () => {
    mocks.c.isBusy = true;
    render(<ComposerActions />);
    fireEvent.click(screen.getByLabelText("Stop"));
    expect(mocks.c.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText("Send")).toBeNull();
  });

  it("omits the agent switcher by default, shows it with showAgent", () => {
    const { rerender } = render(<ComposerActions />);
    expect(screen.queryByTestId("agent-switcher")).toBeNull();
    rerender(<ComposerActions showAgent />);
    expect(screen.getByTestId("agent-switcher")).toBeInTheDocument();
  });
});
