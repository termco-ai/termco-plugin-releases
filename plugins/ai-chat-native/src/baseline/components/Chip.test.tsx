// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { File01Icon } from "@hugeicons/core-free-icons";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

afterEach(cleanup);

describe("Chip", () => {
  it("renders children inside the value span", () => {
    render(<Chip>main.ts</Chip>);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
  });

  it("renders the dimmed label prefix", () => {
    render(<Chip label="on">feature/x</Chip>);
    expect(screen.getByText("on")).toBeInTheDocument();
    expect(screen.getByText("feature/x")).toBeInTheDocument();
  });

  it("sets the title attribute on the container", () => {
    const { container } = render(<Chip title="tooltip text">x</Chip>);
    expect(container.firstElementChild).toHaveAttribute(
      "title",
      "tooltip text",
    );
  });

  it("is pointer-inert without an onRemove handler", () => {
    const { container } = render(<Chip>x</Chip>);
    expect(container.firstElementChild).toHaveClass("pointer-events-none");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a remove button that fires onRemove", () => {
    const onRemove = vi.fn();
    const { container } = render(
      <Chip onRemove={onRemove} removeLabel="Remove file">
        x
      </Chip>,
    );
    expect(container.firstElementChild).not.toHaveClass("pointer-events-none");
    const btn = screen.getByRole("button", { name: "Remove file" });
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("defaults the remove label to Remove", () => {
    render(<Chip onRemove={() => {}}>x</Chip>);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("prefers iconNode over icon", () => {
    const { container } = render(
      <Chip icon={File01Icon} iconNode={<span data-testid="custom-icon" />}>
        x
      </Chip>,
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders the icon prop when no iconNode is given", () => {
    const { container } = render(<Chip icon={File01Icon}>x</Chip>);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
