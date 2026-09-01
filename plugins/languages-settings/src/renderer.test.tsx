// @vitest-environment jsdom
import type { LspSessionsCapability } from "@termco/editor-base";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLanguagesSettings } from "./renderer";

const lsp = {
  listServers: vi.fn(async () => [
    {
      config: {
        id: "typescript",
        name: "TypeScript",
        languages: ["ts", "tsx"],
        command: "typescript-language-server",
        args: ["--stdio"],
        rootMarkers: ["package.json"],
        enabled: true,
        autoInstall: { npmPackage: "typescript-language-server", version: "latest" },
      },
      status: "missing" as const,
      detail: "npm package is unavailable",
    },
    {
      config: {
        id: "company",
        name: "Company LSP",
        languages: ["corp"],
        command: "company-lsp",
        args: [],
        rootMarkers: [".git"],
        enabled: true,
        custom: true,
      },
      status: "running" as const,
    },
  ]),
  sessionStatus: vi.fn(async () => [
    { sessionKey: "company:/work", serverId: "company", scopeKey: "ssh:rig-b", root: "/work", state: "running" as const, openDocs: 2 },
  ]),
  setServerEnabled: vi.fn(async () => {}),
  upsertServer: vi.fn(async () => {}),
  removeServer: vi.fn(async () => {}),
  installServer: vi.fn(async () => ({ ok: true })),
  restartSession: vi.fn(async () => {}),
} as unknown as LspSessionsCapability;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("exact Languages settings section", () => {
  it("restores server and active-session cards with status details", async () => {
    const Section = createLanguagesSettings(lsp);
    const { container } = render(<Section />);
    expect(await screen.findByText("Language servers")).toBeDefined();
    expect(screen.getByText("Active sessions")).toBeDefined();
    expect(screen.getByText("not installed")).toBeDefined();
    expect(screen.getByText("running")).toBeDefined();
    expect(screen.getByText(/ssh:rig-b · running · 2 files/)).toBeDefined();
    expect(container.querySelectorAll(".rounded-lg.border")).toHaveLength(2);
    expect(screen.queryByRole("switch", { name: "Enable TypeScript" })).toBeNull();
  });

  it("routes server actions through the shared LSP capability", async () => {
    const Section = createLanguagesSettings(lsp);
    render(<Section />);
    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(lsp.installServer).toHaveBeenCalledWith("typescript"));
    fireEvent.click(screen.getAllByRole("switch")[1]);
    await waitFor(() => expect(lsp.setServerEnabled).toHaveBeenCalledWith("company", false));
  });

  it("restores the structured custom-server dialog", async () => {
    const Section = createLanguagesSettings(lsp);
    render(<Section />);
    fireEvent.click(await screen.findByRole("button", { name: "Add custom server" }));
    expect(await screen.findByText("Add language server")).toBeDefined();
    expect(screen.getByLabelText("File extensions (comma-separated)")).toBeDefined();
    expect(screen.getByLabelText("Initialization options (JSON)")).toBeDefined();
    expect(screen.getByText(/Any LSP server speaking stdio/)).toBeDefined();
  });
});
