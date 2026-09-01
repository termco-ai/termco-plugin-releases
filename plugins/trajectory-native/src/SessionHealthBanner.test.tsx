import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionHealthBanner } from "./SessionHealthBanner";

afterEach(cleanup);

describe("SessionHealthBanner", () => {
  it("explains an open tail and delegates recovery to the session owner", () => {
    const recover = vi.fn();
    render(<SessionHealthBanner repair={{ state: "open-tail", message: "Turn 3 did not close" }} recovering={false} onRecover={recover} />);

    expect(screen.getByRole("status").textContent).toContain("Turn 3 did not close");
    fireEvent.click(screen.getByRole("button", { name: "Repair session for continuation" }));
    expect(recover).toHaveBeenCalledOnce();
  });

  it("keeps corruption inspectable without offering a destructive repair", () => {
    render(<SessionHealthBanner repair={{ state: "corrupt", message: "Invalid event prefix" }} recovering={false} onRecover={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("Invalid event prefix");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows waiting input as a safe pause without offering continuation repair", () => {
    const recover = vi.fn();
    render(<SessionHealthBanner repair={{ state: "waiting-input" }} recovering={false} onRecover={recover} />);

    expect(screen.getByRole("status").textContent).toContain("Session is waiting for input");
    expect(screen.getByRole("status").textContent).toContain("paused safely");
    expect(screen.queryByRole("button", { name: "Repair session for continuation" })).toBeNull();
    expect(recover).not.toHaveBeenCalled();
  });
});
