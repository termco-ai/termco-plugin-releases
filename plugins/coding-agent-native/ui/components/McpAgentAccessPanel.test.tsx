// @vitest-environment jsdom
// Source-owned by the coding-agent-native plugin.
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TokenInfo = {
  id: string;
  label: string;
  rigId: string | null;
  autoApprove: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

const client = vi.hoisted(() => ({
  listMcpUserTokens: vi.fn((): Promise<TokenInfo[]> => Promise.resolve([])),
  createMcpUserToken: vi.fn(() =>
    Promise.resolve({
      token: "PLAINTEXT-TOKEN",
      info: {},
      url: "http://127.0.0.1:45817/mcp",
    }),
  ),
  revokeMcpUserToken: vi.fn(() => Promise.resolve({ ok: true })),
  registerMcpAgent: vi.fn(() => Promise.resolve({ ok: true, output: "Added" })),
}));
vi.mock("../lib/mcpServerClient", () => client);

import { McpAgentAccessPanel } from "./McpAgentAccessPanel";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("McpAgentAccessPanel", () => {
  it("creates a token and shows the one-time plaintext", async () => {
    render(<McpAgentAccessPanel onBack={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Label/), {
      target: { value: "opencode" },
    });
    fireEvent.click(screen.getByText("Create token"));
    await waitFor(() =>
      expect(client.createMcpUserToken).toHaveBeenCalledWith(
        expect.objectContaining({ label: "opencode" }),
      ),
    );
    expect(await screen.findByText("PLAINTEXT-TOKEN")).toBeInTheDocument();
    // Refreshes the list after creating.
    expect(client.listMcpUserTokens).toHaveBeenCalled();
  });

  it("registers with Claude Code using the created token", async () => {
    render(<McpAgentAccessPanel onBack={() => {}} />);
    fireEvent.click(screen.getByText("Create token"));
    await screen.findByText("PLAINTEXT-TOKEN");
    fireEvent.click(screen.getByText("Add to Claude Code"));
    await waitFor(() =>
      expect(client.registerMcpAgent).toHaveBeenCalledWith(
        "claude",
        "PLAINTEXT-TOKEN",
      ),
    );
  });

  it("lists existing tokens and revokes one", async () => {
    client.listMcpUserTokens.mockResolvedValueOnce([
      {
        id: "ut_1",
        label: "opencode",
        rigId: null,
        autoApprove: true,
        createdAt: 1,
        lastUsedAt: null,
      },
    ]);
    render(<McpAgentAccessPanel onBack={() => {}} />);
    expect(await screen.findByText("opencode")).toBeInTheDocument();
    expect(screen.getByText(/auto-approve/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Revoke"));
    await waitFor(() =>
      expect(client.revokeMcpUserToken).toHaveBeenCalledWith("ut_1"),
    );
  });
});
