// @vitest-environment jsdom
import ui from "@termco/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContainerStats, ContainerSummary } from "../types";
import type { ContainerPortForwardController } from "../useContainerPortForward";
import { ContainerCard } from "./ContainerCard";

const { TooltipProvider } = ui;

afterEach(cleanup);

const base: ContainerSummary = {
  id: "abc123",
  runtime: "docker",
  name: "web",
  image: "nginx:latest",
  state: "running",
  status: "Up 3 hours",
  ports: "0.0.0.0:8080->80/tcp",
  created_at: "",
};

const pf: ContainerPortForwardController = {
  isSsh: false,
  forwardFor: () => null,
  route: vi.fn(async () => {}),
  open: vi.fn(),
  stop: vi.fn(),
};

function mount(over: Partial<Parameters<typeof ContainerCard>[0]> = {}) {
  const props = {
    container: base,
    active: false,
    stats: undefined as ContainerStats | undefined,
    busy: false,
    portForward: pf,
    onOpen: vi.fn(),
    onShell: vi.fn(),
    onAction: vi.fn(),
    ...over,
  };
  render(
    <TooltipProvider>
      <ContainerCard {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("ContainerCard", () => {
  it("shows name, image, status and a published-port chip", () => {
    const { container } = render(
      <TooltipProvider>
        <ContainerCard
          container={base}
          active={false}
          stats={undefined}
          busy={false}
          portForward={pf}
          onOpen={vi.fn()}
          onShell={vi.fn()}
          onAction={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(container.textContent).toContain("web");
    expect(container.textContent).toContain("nginx:latest");
    expect(container.textContent).toContain("Up 3 hours");
    expect(container.textContent).toContain("8080→80");
  });

  it("opens the detail tab on card click but NOT on an inline action", () => {
    const props = mount();
    // Inline stop button: acts, does not open.
    fireEvent.click(screen.getByLabelText("Stop"));
    expect(props.onAction).toHaveBeenCalledWith("stop");
    expect(props.onOpen).not.toHaveBeenCalled();
    // Card body: opens.
    fireEvent.click(screen.getByText("web"));
    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows the shell button only while running and wires it", () => {
    const props = mount();
    fireEvent.click(screen.getByLabelText("Open shell in container"));
    expect(props.onShell).toHaveBeenCalledTimes(1);
    cleanup();
    mount({ container: { ...base, state: "exited", status: "Exited (0)" } });
    expect(screen.queryByLabelText("Open shell in container")).toBeNull();
    // Stopped → the action is Start.
    expect(screen.getByLabelText("Start")).toBeTruthy();
  });

  it("renders live cpu/mem when running stats are present", () => {
    const { container } = render(
      <TooltipProvider>
        <ContainerCard
          container={base}
          active
          stats={{
            id: "abc123",
            name: "web",
            cpuPerc: 12.5,
            memUsage: "25.6MiB / 7.6GiB",
            memPerc: 0.3,
            netIO: "",
            blockIO: "",
            pids: 0,
          }}
          busy={false}
          portForward={pf}
          onOpen={vi.fn()}
          onShell={vi.fn()}
          onAction={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(container.textContent).toContain("cpu 12.5%");
    expect(container.textContent).toContain("mem 25.6MiB");
  });
});
