// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconBtn } from "./IconBtn";

afterEach(cleanup);

describe("IconBtn", () => {
  it("renders children and the title tooltip", () => {
    render(
      <IconBtn title="Attach" onClick={() => {}}>
        <span>plus</span>
      </IconBtn>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("title", "Attach");
    expect(screen.getByText("plus")).toBeInTheDocument();
  });

  it("invokes onClick when pressed", () => {
    const onClick = vi.fn();
    render(
      <IconBtn title="Attach" onClick={onClick}>
        x
      </IconBtn>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", () => {
    const onClick = vi.fn();
    render(
      <IconBtn title="Attach" onClick={onClick} disabled>
        x
      </IconBtn>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("merges a custom className", () => {
    render(
      <IconBtn title="Attach" onClick={() => {}} className="extra-class">
        x
      </IconBtn>,
    );
    expect(screen.getByRole("button").className).toContain("extra-class");
  });
});
