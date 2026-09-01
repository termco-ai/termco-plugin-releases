// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentNotification } from "../../types";
import { NotificationRow } from "./NotificationRow";

const NOW = 1_700_000_000_000;

function notif(overrides: Partial<AgentNotification> = {}): AgentNotification {
  return {
    id: "n1",
    source: "terminal",
    leafId: 1,
    tabId: 1,
    agent: "claude",
    kind: "finished",
    at: NOW,
    read: false,
    location: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NotificationRow", () => {
  it("labels each notification kind", () => {
    render(
      <NotificationRow n={notif({ kind: "finished" })} onClick={() => {}} />,
    );
    expect(screen.getByText("finished")).toBeDefined();
    cleanup();
    render(
      <NotificationRow n={notif({ kind: "attention" })} onClick={() => {}} />,
    );
    expect(screen.getByText("needs input")).toBeDefined();
    cleanup();
    render(<NotificationRow n={notif({ kind: "error" })} onClick={() => {}} />);
    expect(screen.getByText("failed")).toBeDefined();
  });

  it("gives finished and failed their own glyphs, attention a dot", () => {
    const { container } = render(
      <NotificationRow n={notif({ kind: "finished" })} onClick={() => {}} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
    cleanup();
    const errored = render(
      <NotificationRow n={notif({ kind: "error" })} onClick={() => {}} />,
    );
    expect(errored.container.querySelector(".text-destructive")).not.toBeNull();
    cleanup();
    const attention = render(
      <NotificationRow n={notif({ kind: "attention" })} onClick={() => {}} />,
    );
    expect(attention.container.querySelector("svg")).toBeNull();
    expect(attention.container.querySelector(".bg-primary")).not.toBeNull();
  });

  it("formats relative time buckets", () => {
    const cases: Array<[number, string]> = [
      [30 * 1000, "just now"],
      [5 * 60 * 1000, "5m ago"],
      [3 * 60 * 60 * 1000, "3h ago"],
      [2 * 24 * 60 * 60 * 1000, "2d ago"],
    ];
    for (const [age, label] of cases) {
      render(
        <NotificationRow n={notif({ at: NOW - age })} onClick={() => {}} />,
      );
      expect(screen.getByText(label)).toBeDefined();
      cleanup();
    }
  });

  it("shows the branded agent name and activates on click", () => {
    const onClick = vi.fn();
    render(
      <NotificationRow n={notif({ agent: "gemini" })} onClick={onClick} />,
    );
    expect(screen.getByText(/Gemini/)).toBeDefined();
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
