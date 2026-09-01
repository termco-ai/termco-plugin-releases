// @vitest-environment jsdom
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { PreferencesCapability } from "@termco/storage-base";
import ui from "@termco/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExactStatusBar } from "./ExactStatusBar";
import { createStatusbarRuntime } from "./testRuntime";

afterEach(cleanup);

const files = {
  listSubdirs: vi.fn().mockResolvedValue([]),
} as unknown as WorkspaceFilesCapability;
const preferences = {
  get: vi.fn().mockResolvedValue(false),
} as unknown as PreferencesCapability;

function setup(
  overrides = {},
  extensions: { leftItems?: ReactNode; rightItems?: ReactNode } = {},
) {
  const runtime = createStatusbarRuntime(overrides);
  const result = render(
    <ui.TooltipProvider>
      <ExactStatusBar
        runtime={runtime}
        files={files}
        preferences={preferences}
        {...extensions}
      />
    </ui.TooltipProvider>,
  );
  return { runtime, ...result };
}

describe("ExactStatusBar", () => {
  it("owns the exact current footer chrome and default content", () => {
    setup();
    const footer = screen.getByText("Ready").closest("footer");
    expect(footer?.tagName).toBe("FOOTER");
    expect(footer?.getAttribute("data-testid")).toBeNull();
    expect(footer?.className).toBe(
      "termco-chrome flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border/70 px-3 font-mono text-xs text-muted-foreground",
    );
    expect(screen.getByText("Ready")).toBeDefined();
    expect(screen.getByText("repo")).toBeDefined();
    expect(screen.getByText("Open AI agent")).toBeDefined();
  });

  it("mounts extension-plugin items inside the complete statusbar chrome", () => {
    setup(
      {},
      {
        leftItems: <span>External left</span>,
        rightItems: <span data-testid="word-count-statusbar">WC: ready</span>,
      },
    );

    const footer = screen.getByText("Ready").closest("footer");
    expect(footer?.textContent).toContain("External left");
    expect(screen.getByTestId("word-count-statusbar").textContent).toBe(
      "WC: ready",
    );
  });

  it("restores the conditional privacy, LSP, and agent pills", () => {
    const { runtime } = setup({
      privateActive: true,
      lspServerId: "typescript-language-server",
      ai: { status: "thinking", step: "Reading files", error: null },
    });
    expect(screen.getByText("Private: hidden from AI")).toBeDefined();
    fireEvent.click(screen.getByText("typescript-language-server"));
    expect(runtime.openLanguagesSettings).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Reading files"));
    expect(runtime.openAi).toHaveBeenCalledOnce();
  });

  it("hides the AI open action while a chat surface is already visible", () => {
    setup({ aiSurfaceOpen: true });
    expect(screen.queryByText("Open AI agent")).toBeNull();
  });

  it("opens the AI surface from the restored status-bar action", () => {
    const { runtime } = setup();
    fireEvent.click(screen.getByText("Open AI agent"));
    expect(runtime.openAi).toHaveBeenCalledOnce();
  });
});
