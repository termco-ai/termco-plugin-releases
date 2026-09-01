// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { TooltipProvider } from "@termco/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconActionButton } from "./IconActionButton";

afterEach(cleanup);

function renderButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return render(
    <TooltipProvider>
      <IconActionButton {...props}>
        <span>icon</span>
      </IconActionButton>
    </TooltipProvider>,
  );
}

describe("IconActionButton", () => {
  it("exposes the label and fires the click handler", () => {
    const onClick = vi.fn();
    renderButton({ label: "Fetch from remote", onClick });
    const button = screen.getByRole("button", { name: "Fetch from remote" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("blocks clicks while disabled", () => {
    const onClick = vi.fn();
    renderButton({ label: "Refresh", disabled: true, onClick });
    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
