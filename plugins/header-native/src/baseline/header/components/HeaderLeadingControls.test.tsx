// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bellProps: [] as unknown[],
}));

vi.mock("../../agents/NotificationBell", () => ({
  NotificationBell: (props: unknown) => {
    mocks.bellProps.push(props);
    return <div data-testid="bell" />;
  },
}));

import { HeaderLeadingControls } from "./HeaderLeadingControls";
import { createHeaderRuntime } from "../../testRuntime";

beforeEach(() => {
  mocks.bellProps.length = 0;
});

afterEach(cleanup);

function setup() {
  const props = {
    runtime: createHeaderRuntime({ platform: "linux" }),
    onToggleSidebar: vi.fn(),
    onActivateAgent: vi.fn(),
    onActivateLocalAgent: vi.fn(),
  };
  render(<HeaderLeadingControls {...props} />);
  return props;
}

describe("HeaderLeadingControls", () => {
  it("toggles the sidebar", () => {
    const props = setup();
    fireEvent.click(screen.getByTitle("Toggle sidebar"));
    expect(props.onToggleSidebar).toHaveBeenCalled();
  });

  // The palette moved to the header search bar; these controls no longer
  // carry a launcher of their own.
  it("no longer hosts a command-palette button", () => {
    setup();
    expect(screen.queryByTitle("Command palette")).toBeNull();
  });

  it("hosts the notification bell off macOS", () => {
    const props = setup();
    expect(screen.getByTestId("bell")).toBeDefined();
    expect(mocks.bellProps[0]).toMatchObject({
      onActivate: props.onActivateAgent,
      onActivateLocal: props.onActivateLocalAgent,
    });
  });

  it("omits the bell on macOS (it moves to the trailing side)", () => {
    setupWithPlatform("macos");
    expect(screen.queryByTestId("bell")).toBeNull();
  });
});

function setupWithPlatform(platform: "macos" | "linux") {
  const props = {
    runtime: createHeaderRuntime({ platform }),
    onToggleSidebar: vi.fn(),
    onActivateAgent: vi.fn(),
    onActivateLocalAgent: vi.fn(),
  };
  render(<HeaderLeadingControls {...props} />);
  return props;
}
