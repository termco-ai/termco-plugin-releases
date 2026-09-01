// @vitest-environment jsdom
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import {
  EVENTS_APPLICATION_SERVICE,
  type ApplicationEventsCapability,
} from "@termco/events-base";
import type { SshClientCapability, SshForwardInfo } from "@termco/ssh-base";
import type {
  UiSidebarViewContribution,
  UiSidebarViewRegistry,
} from "@termco/ui-sidebar-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import ui from "@termco/ui";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

const forward = (connectionId: string, localPort: number): SshForwardInfo => ({
  id: `${connectionId}:${localPort}`,
  connectionId,
  localPort,
  remoteHost: "127.0.0.1",
  remotePort: localPort,
  state: "active",
  error: null,
  desired: "running",
});

const props = (workspace: WorkspaceEnv) => ({
  rootPath: null,
  workspace,
  activeFilePath: null,
  openFileAt: vi.fn(),
  openFile: vi.fn(),
  navigateToPath: vi.fn(),
  pathRenamed: vi.fn(),
  pathDeleted: vi.fn(),
  attachFileToAgent: vi.fn(),
  runInNewTerminal: vi.fn(async () => {}),
});

let ssh: SshClientCapability;
let desktop: DesktopIntegrationCapability;
let events: ApplicationEventsCapability;
let contribution: UiSidebarViewContribution;

function renderPanel(node: ReactNode) {
  return render(node, { wrapper: ui.TooltipProvider });
}

beforeEach(async () => {
  ssh = {
    forwardEnsure: vi.fn(async () => []),
    forwardList: vi.fn(async () => []),
    forwardAdd: vi.fn(),
    forwardStart: vi.fn(),
    forwardStop: vi.fn(),
    forwardRemove: vi.fn(),
    scanPorts: vi.fn(async () => ({ ports: [], outdated: false })),
    state: vi.fn(async (connectionId: string) => ({
      connectionId,
      supported: false,
      domains: {},
    })),
  } as unknown as SshClientCapability;
  desktop = {
    openUrl: vi.fn(),
    writeClipboardText: vi.fn(),
  } as unknown as DesktopIntegrationCapability;
  events = {
    subscribe: vi.fn(() => () => {}),
  } as unknown as ApplicationEventsCapability;
  const registry: UiSidebarViewRegistry = {
    register(value) {
      contribution = value;
      return () => {};
    },
    snapshot: () => [],
    records: () => [],
    subscribe: () => () => {},
  };
  await plugin.activate({
    get: (id: string) =>
      id === "ssh.client"
        ? ssh
        : id === EVENTS_APPLICATION_SERVICE
          ? events
          : id === "ui.sidebar.views"
            ? registry
            : desktop,
    provide: vi.fn(),
    effect: async (install: () => () => void) => install(),
  } as never);
});

afterEach(() => cleanup());

describe("ports sidebar rig ownership", () => {
  it("stays inert for local rigs and uses the selected SSH connection", async () => {
    const Panel = contribution.Component;
    const mounted = renderPanel(<Panel {...props({ kind: "local" })} />);
    expect(ssh.forwardEnsure).not.toHaveBeenCalled();

    mounted.rerender(
      <Panel
        {...props({
          kind: "ssh",
          connectionId: "second-rig",
          host: "second.example",
        })}
      />,
    );
    await waitFor(() =>
      expect(ssh.forwardEnsure).toHaveBeenCalledWith("second-rig"),
    );
    await waitFor(() =>
      expect(ssh.scanPorts).toHaveBeenCalledWith(
        expect.objectContaining({ connectionId: "second-rig" }),
      ),
    );
  });

  it("ignores a late forward snapshot from the previously selected rig", async () => {
    let resolveFirst: (value: SshForwardInfo[]) => void = () => {};
    vi.mocked(ssh.forwardEnsure)
      .mockImplementationOnce(
        () => new Promise<SshForwardInfo[]>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce([forward("second-rig", 4000)]);

    const Panel = contribution.Component;
    const mounted = renderPanel(
      <Panel
        {...props({
          kind: "ssh",
          connectionId: "first-rig",
          host: "first.example",
        })}
      />,
    );
    await waitFor(() =>
      expect(ssh.forwardEnsure).toHaveBeenCalledWith("first-rig"),
    );

    mounted.rerender(
      <Panel
        {...props({
          kind: "ssh",
          connectionId: "second-rig",
          host: "second.example",
        })}
      />,
    );
    await screen.findByText(/4000/);
    resolveFirst([forward("first-rig", 3000)]);

    await waitFor(() => expect(screen.queryByText(/3000/)).toBeNull());
    expect(screen.getByText(/4000/)).toBeTruthy();
  });

  it("scopes the rail badge to the selected rig", async () => {
    vi.mocked(ssh.forwardList).mockImplementation(async (connectionId) =>
      connectionId === "second-rig"
        ? [forward("second-rig", 4000), forward("second-rig", 5000)]
        : [forward("first-rig", 3000)],
    );
    const useBadge = contribution.useBadge!;
    function Badge({ workspace }: { workspace: WorkspaceEnv }) {
      return <output>{useBadge({ rootPath: null, workspace })}</output>;
    }
    const mounted = renderPanel(
      <Badge
        workspace={{
          kind: "ssh",
          connectionId: "first-rig",
          host: "first.example",
        }}
      />,
    );
    await screen.findByText("1");

    mounted.rerender(
      <Badge
        workspace={{
          kind: "ssh",
          connectionId: "second-rig",
          host: "second.example",
        }}
      />,
    );
    await screen.findByText("2");
    expect(ssh.forwardList).toHaveBeenCalledWith("second-rig");
  });

  it("restores the exact forward row controls and desktop actions", async () => {
    vi.mocked(ssh.forwardEnsure).mockResolvedValue([
      {
        ...forward("second-rig", 3001),
        remotePort: 3000,
      },
    ]);
    const Panel = contribution.Component;
    const { container } = renderPanel(
      <Panel
        {...props({
          kind: "ssh",
          connectionId: "second-rig",
          host: "second.example",
        })}
      />,
    );
    await screen.findByLabelText("Open in browser");
    expect(container.textContent).toContain("3000");
    expect(container.textContent).toContain("→ :");
    expect(container.textContent).toContain("3001");
    expect(container.querySelector('[data-state="active"]')).not.toBeNull();
    fireEvent.click(screen.getByLabelText("Open in browser"));
    expect(desktop.openUrl).toHaveBeenCalledWith("http://localhost:3001");
    fireEvent.click(screen.getByLabelText("Copy local address"));
    expect(desktop.writeClipboardText).toHaveBeenCalledWith(
      "http://localhost:3001",
    );
    fireEvent.click(screen.getByLabelText("Stop forward"));
    expect(ssh.forwardStop).toHaveBeenCalledWith("second-rig:3001");
  });

  it("keeps the original add validation and local-port default", async () => {
    const Panel = contribution.Component;
    renderPanel(
      <Panel
        {...props({
          kind: "ssh",
          connectionId: "second-rig",
          host: "second.example",
        })}
      />,
    );
    await screen.findByLabelText("Remote port");
    fireEvent.change(screen.getByLabelText("Remote port"), {
      target: { value: "99999" },
    });
    fireEvent.click(screen.getByLabelText("Add forward"));
    expect(screen.getByText(/Enter a remote port/)).toBeDefined();
    expect(ssh.forwardAdd).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Remote port"), {
      target: { value: "3000" },
    });
    fireEvent.click(screen.getByLabelText("Add forward"));
    await waitFor(() =>
      expect(ssh.forwardAdd).toHaveBeenCalledWith("second-rig", {
        localPort: 3000,
        remotePort: 3000,
      }),
    );
  });

  it("uses the shared SSH state hub and preserves disconnected port data", async () => {
    vi.mocked(ssh.state).mockResolvedValue({
      connectionId: "second-rig",
      supported: true,
      domains: {
        ports: {
          data: [
            {
              port: 6379,
              addresses: ["127.0.0.1"],
              loopbackOnly: true,
              process: null,
              container: { container: "redis", containerPort: 6379 },
            },
          ],
          collectedAt: 1,
          receivedAt: 2,
          stale: true,
          error: null,
        },
      },
    });
    const Panel = contribution.Component;
    renderPanel(
      <Panel
        {...props({
          kind: "ssh",
          connectionId: "second-rig",
          host: "second.example",
        })}
      />,
    );
    expect(await screen.findByText("disconnected")).toBeDefined();
    expect(screen.getByText("server-only")).toBeDefined();
    expect(screen.getByText(/redis:6379/)).toBeDefined();
    expect(ssh.scanPorts).not.toHaveBeenCalled();
  });
});
