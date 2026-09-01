// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ForwardInfo } from "../useContainerPortForward";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Flatten the Radix menu so items render as plain buttons (repo pattern).
vi.mock("@termco/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@termco/ui")>();
  return { default: { ...actual.default,
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  } };
});

import { PortForwardChip } from "./PortForwardChip";

afterEach(cleanup);

const handlers = () => ({
  onRoute: vi.fn(),
  onOpen: vi.fn(),
  onStop: vi.fn(),
});

const activeForward: ForwardInfo = {
  id: "f1",
  connectionId: "c1",
  localPort: 49213,
  remoteHost: "127.0.0.1",
  remotePort: 8080,
  state: "active",
  error: null,
  desired: "running",
};

describe("PortForwardChip", () => {
  it("idle SSH: primary click routes to the same local port", () => {
    const h = handlers();
    render(
      <PortForwardChip
        hostPort={8080}
        label="8080→80"
        forward={null}
        isSsh
        {...h}
      />,
    );
    fireEvent.click(screen.getByText("8080→80"));
    expect(h.onRoute).toHaveBeenCalledWith("same");
  });

  it("idle SSH: menu offers same / free / custom local port", () => {
    const h = handlers();
    render(
      <PortForwardChip
        hostPort={8080}
        label="8080→80"
        forward={null}
        isSsh
        {...h}
      />,
    );
    fireEvent.click(screen.getByText("To a free port"));
    expect(h.onRoute).toHaveBeenCalledWith("auto");

    fireEvent.change(screen.getByPlaceholderText("port"), {
      target: { value: "15432" },
    });
    fireEvent.click(screen.getByLabelText("Forward to this port"));
    expect(h.onRoute).toHaveBeenCalledWith(15432);
  });

  it("active: shows the remapped local port and opens it on click", () => {
    const h = handlers();
    render(
      <PortForwardChip
        hostPort={8080}
        label="8080→80"
        forward={activeForward}
        isSsh
        {...h}
      />,
    );
    // Remapped local port is surfaced (on the chip and in the menu).
    expect(screen.getAllByText(/:49213/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("8080→80"));
    expect(h.onOpen).toHaveBeenCalledWith(49213);
  });

  it("active: menu can stop the forward", () => {
    const h = handlers();
    render(
      <PortForwardChip
        hostPort={8080}
        label="8080→80"
        forward={activeForward}
        isSsh
        {...h}
      />,
    );
    fireEvent.click(screen.getByText("Stop forwarding"));
    expect(h.onStop).toHaveBeenCalledWith("f1");
  });

  it("local: primary click opens the preview (route 'same')", () => {
    const h = handlers();
    render(
      <PortForwardChip
        hostPort={8080}
        label="8080→80"
        forward={null}
        isSsh={false}
        {...h}
      />,
    );
    fireEvent.click(screen.getByText("8080→80"));
    expect(h.onRoute).toHaveBeenCalledWith("same");
    // No SSH-only "free port" option in local mode.
    expect(screen.queryByText("To a free port")).toBeNull();
  });
});
