// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HookAgentRow } from "./HookAgentRow";

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof HookAgentRow>[0]> = {}) {
  const onEnable = vi.fn();
  render(
    <HookAgentRow
      id="claude"
      label="Claude Code"
      ready={false}
      installing={false}
      onEnable={onEnable}
      {...overrides}
    />,
  );
  return onEnable;
}

describe("HookAgentRow", () => {
  it("shows the enabled state without an enable button", () => {
    setup({ ready: true });
    expect(screen.getByText("enabled")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Enable when the hook is not installed", () => {
    const onEnable = setup();
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Enable");
    fireEvent.click(button);
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows a spinner while installing", () => {
    const onEnable = setup({ installing: true });
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Enabling");
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    fireEvent.click(button);
    expect(onEnable).not.toHaveBeenCalled();
  });

  it("shows the agent label", () => {
    setup({ label: "Codex" });
    expect(screen.getByText("Codex")).toBeDefined();
  });
});
