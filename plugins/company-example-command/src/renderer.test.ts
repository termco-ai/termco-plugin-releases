// @vitest-environment jsdom
import type { UiCommandItem } from "@termco/ui-commands-base";
import { describe, expect, it, vi } from "vitest";
import plugin, { companyCommand } from "./renderer";

describe("example company command", () => {
  it("publishes a searchable palette command and runs it", async () => {
    let contribution: UiCommandItem | undefined;
    await plugin.activate({
      get: () => ({
        register(value: UiCommandItem) {
          contribution = value;
          return () => {};
        },
      }),
      effect: async (install: () => unknown) => install(),
      provide: () => {
        throw new Error("command contributions use the injected registry");
      },
    } as never);
    const listener = vi.fn();
    window.addEventListener("termco:company-example-ping", listener);
    contribution?.run({} as never);
    expect(contribution).toMatchObject({
      id: "company-example.ping",
      group: "Example Company",
    });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("termco:company-example-ping", listener);
    expect(companyCommand.description).toContain("organization-provided");
  });
});
