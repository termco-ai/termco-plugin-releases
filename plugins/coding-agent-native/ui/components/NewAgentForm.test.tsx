// @vitest-environment jsdom
// Source-owned by the coding-agent-native plugin.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  listBackends: vi.fn(() =>
    Promise.resolve([
      { backend: "claude", label: "Claude Code", bin: "claude", available: true },
      { backend: "codex", label: "Codex", bin: "codex", available: false },
    ]),
  ),
}));
vi.mock("../lib/client", () => client);

import { NewAgentForm } from "./NewAgentForm";

const SSH = {
  kind: "ssh" as const,
  connectionId: "c1",
  host: "opendoc-v2",
  user: "root",
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("NewAgentForm run location", () => {
  it("shows where the run will execute for an ssh rig", async () => {
    render(
      <NewAgentForm
        defaultCwd="/srv/app"
        workspace={SSH}
        onStarted={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(await screen.findByText("root@opendoc-v2")).toBeInTheDocument();
    expect(screen.getByText(/Runs on/)).toBeInTheDocument();
  });

  it("says 'Runs locally' for a local rig", async () => {
    client.listBackends.mockResolvedValueOnce([
      { backend: "claude", label: "Claude Code", bin: "claude", available: true },
      { backend: "codex", label: "Codex", bin: "codex", available: true },
    ]);
    render(
      <NewAgentForm
        defaultCwd="/repo"
        workspace={{ kind: "local" }}
        onStarted={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(await screen.findByText("Runs locally")).toBeInTheDocument();
    // Every backend available → no re-probe affordance.
    expect(screen.queryByText("Check again")).not.toBeInTheDocument();
  });

  it("names the HOST in the not-installed reason and re-probes on demand", async () => {
    render(
      <NewAgentForm
        defaultCwd="/srv/app"
        workspace={SSH}
        onStarted={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      await screen.findByText("Not installed on root@opendoc-v2"),
    ).toBeInTheDocument();

    // "Check again" busts the probe cache; the fresh probe finds the CLI.
    client.listBackends.mockResolvedValueOnce([
      { backend: "claude", label: "Claude Code", bin: "claude", available: true },
      { backend: "codex", label: "Codex", bin: "codex", available: true },
    ]);
    fireEvent.click(screen.getByText("Check again"));
    await waitFor(() =>
      expect(client.listBackends).toHaveBeenLastCalledWith(SSH, { refresh: true }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Not installed on root@opendoc-v2"),
      ).not.toBeInTheDocument(),
    );
  });
});
