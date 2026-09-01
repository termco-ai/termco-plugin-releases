// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BreadcrumbSegment } from "./BreadcrumbSegment";

afterEach(cleanup);

describe("BreadcrumbSegment", () => {
  it("renders the folder label", () => {
    render(<BreadcrumbSegment label="src" isHome={false} onClick={() => {}} />);
    expect(screen.getByText("src")).toBeDefined();
  });

  it("replaces ~ with Home and the original icon", () => {
    const { container } = render(
      <BreadcrumbSegment label="~" isHome onClick={() => {}} />,
    );
    expect(screen.getByText("Home")).toBeDefined();
    expect(screen.queryByText("~")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("navigates on click", () => {
    const onClick = vi.fn();
    render(<BreadcrumbSegment label="src" isHome={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
