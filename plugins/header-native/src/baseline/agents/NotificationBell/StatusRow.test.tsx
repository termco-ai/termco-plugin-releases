// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusRow } from "./StatusRow";

afterEach(cleanup);

describe("StatusRow", () => {
  it("shows the branded agent name", () => {
    render(<StatusRow agent="claude" status="working" onClick={() => {}} />);
    expect(screen.getByText("Claude Code")).toBeDefined();
  });

  it("renders the working state as a quiet indicator", () => {
    render(<StatusRow agent="claude" status="working" onClick={() => {}} />);
    expect(screen.getByText("working")).toBeDefined();
    expect(screen.queryByText("Jump in")).toBeNull();
  });

  it("renders the waiting state as a call to action", () => {
    const { container } = render(
      <StatusRow agent="claude" status="waiting" onClick={() => {}} />,
    );
    expect(screen.getByText("Jump in")).toBeDefined();
    expect(container.querySelector(".bg-primary")).not.toBeNull();
  });

  it("shows where the agent runs when a location is known", () => {
    render(
      <StatusRow
        agent="claude"
        status="working"
        where="api-server · claude ~ /api"
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("api-server · claude ~ /api")).toBeDefined();
  });

  it("activates on click", () => {
    const onClick = vi.fn();
    render(<StatusRow agent="codex" status="waiting" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
