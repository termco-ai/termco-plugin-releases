// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiModelDefinition as ModelInfo } from "@termco/ai-models-base";
import { ModelRow } from "./ModelRow";

vi.mock("../../../runtime", () => ({
  modelProvider: () => ({ id: "openai", label: "OpenAI" }),
}));

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  DropdownMenuItem: ({
    children,
    onSelect,
    className,
  }: {
    children?: React.ReactNode;
    onSelect?: (e: React.MouseEvent) => void;
    className?: string;
  }) => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: test stub
    <div
      role="menuitem"
      tabIndex={0}
      className={className}
      onClick={(e) => onSelect?.(e)}
    >
      {children}
    </div>
  ),
}));

const model: ModelInfo = {
  id: "gpt-test",
  provider: "openai",
  label: "GPT Test",
  hint: "Test",
  description: "A test model.",
  capabilities: { intelligence: 4, speed: 3, cost: 2 },
};

function renderRow(overrides: Partial<Parameters<typeof ModelRow>[0]> = {}) {
  const props = {
    model,
    selected: false,
    hasKey: true,
    favorite: false,
    onPick: vi.fn(),
    onToggleFavorite: vi.fn(),
    ...overrides,
  };
  const utils = render(<ModelRow {...props} />);
  return { props, ...utils };
}

afterEach(cleanup);

describe("ModelRow", () => {
  it("shows a compact label and provider description", () => {
    renderRow();
    expect(screen.getByText("GPT Test")).toBeInTheDocument();
    expect(screen.getByText("OpenAI · A test model.")).toBeInTheDocument();
  });

  it("keeps capability details available without visible score pills", () => {
    renderRow();
    expect(screen.getByRole("menuitem")).toHaveAttribute(
      "title",
      "A test model. Quality 4/5 · Speed 3/5 · Value 2/5",
    );
  });

  it("picks the model when the row is selected", () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByRole("menuitem"));
    expect(props.onPick).toHaveBeenCalledTimes(1);
  });

  it("toggles favorite without picking the model", () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByTitle("Favorite"));
    expect(props.onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(props.onPick).not.toHaveBeenCalled();
  });

  it("labels the star Unfavorite when already favorited", () => {
    renderRow({ favorite: true });
    expect(screen.getByTitle("Unfavorite")).toBeInTheDocument();
  });

  it("highlights the selected row", () => {
    renderRow({ selected: true });
    expect(screen.getByRole("menuitem").className).toContain(
      "bg-[var(--signal-soft)]",
    );
  });

  it("shows a direct connection message when the provider has no key", () => {
    renderRow({ hasKey: false });
    expect(screen.getByText("Connect OpenAI to use")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider not connected")).toBeInTheDocument();
  });
});
