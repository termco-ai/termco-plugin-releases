// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AiToolPresentationAdapter } from "@termco/ai-tools-base";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginCompletionCard } from "./PluginCompletionCard";

const output = {
  kind: "plugin-completion",
  status: "verified",
  completionId: "completion-fab",
  plugin: {
    id: "floating-calculator-fab",
    name: "Floating Calculator FAB",
    intent: "create",
    target: "ui.overlays",
    generation: "sha256-fab",
  },
  contributions: [{ service: "ui.overlays", key: "calculator-fab" }],
  stages: ["contribution-registered", "surface-mounted", "visible-target"],
  actions: ["show-again", "open-folder", "disable", "undo"],
  message: "The exact calculator button is mounted.",
};

function part() {
  return {
    type: "tool-plugin_verify",
    toolCallId: "call-1",
    state: "output-available",
    input: { completionId: "completion-fab" },
    output,
  } as never;
}

afterEach(cleanup);

describe("PluginCompletionCard", () => {
  it("renders canonical restored output and delegates Show again and Open folder", async () => {
    const performAction = vi.fn(async () => ({ status: "revealed" }));
    const presentation: AiToolPresentationAdapter = {
      renderer: "plugin-completion",
      interactive: false,
      parseInput: (value) => value,
      parseOutput: (value) => value,
      performAction,
    };
    render(<PluginCompletionCard part={part()} presentation={presentation} />);

    expect(screen.getByRole("region", { name: "Plugin change ready" }))
      .toHaveTextContent("Floating Calculator FAB");
    expect(screen.getByText("ui.overlays / calculator-fab")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Show again" }));
    await waitFor(() => expect(performAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "show-again", output }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Open plugin folder" }));
    await waitFor(() => expect(performAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "open-folder", output }),
    ));
  });

  it("shows disable impact before committing the still-current preview", async () => {
    const performAction = vi.fn(async ({ action }: { action: string }) =>
      action === "disable-preview"
        ? {
            previewId: "preview-1",
            generation: 4,
            blockedPlugins: [{ pluginId: "dependent" }],
            unavailableFeatures: [],
            destructiveResources: [],
          }
        : { status: "replaced" }
    );
    const presentation = {
      renderer: "plugin-completion",
      interactive: false,
      parseInput: (value: unknown) => value,
      parseOutput: (value: unknown) => value,
      performAction,
    } satisfies AiToolPresentationAdapter;
    render(<PluginCompletionCard part={part()} presentation={presentation} />);

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(await screen.findByText("Disable this plugin?")).toBeVisible();
    expect(screen.getByText(/1 dependent feature or resource is affected/)).toBeVisible();
    expect(performAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Confirm disable" }));
    await waitFor(() => expect(performAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "disable",
        payload: { previewId: "preview-1", generation: 4 },
      }),
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("Plugin disabled.");
  });
});
