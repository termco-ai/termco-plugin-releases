// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { UiCommandPaletteCapability } from "@termco/ui-overlays-base";
import { createCommandRevealAdapter } from "./renderer";

describe("command reveal adapter", () => {
  it("opens and filters to the exact owned command without executing it", async () => {
    const run = vi.fn();
    const show = vi.fn();
    const setQuery = vi.fn(() => {
      const row = document.createElement("button");
      row.dataset.pluginOwner = "calculator-commands";
      row.dataset.pluginGeneration = "sha256-calculator";
      row.dataset.contributionService = "ui.commands";
      row.dataset.contributionKey = "calculator.open";
      row.addEventListener("click", run);
      document.body.append(row);
    });
    const palette = {
      show,
      setQuery,
    } as unknown as UiCommandPaletteCapability;
    const adapter = createCommandRevealAdapter(palette, document);

    await expect(adapter.reveal({
      target: {
        pluginId: "calculator-commands",
        generation: "sha256-calculator",
        service: "ui.commands",
        key: "calculator.open",
        contributionId: "calculator.open",
      },
      mode: "show-and-spotlight",
      announcement: "Calculator command is ready.",
    })).resolves.toMatchObject({ status: "revealed" });
    expect(show).toHaveBeenCalledWith("commands");
    expect(setQuery).toHaveBeenCalledWith("calculator.open");
    expect(run).not.toHaveBeenCalled();
  });
});
