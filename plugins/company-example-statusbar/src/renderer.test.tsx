// @vitest-environment jsdom
import type { UiStatusbarItemContribution } from "@termco/ui-statusbar-base";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import plugin, { CompanyStatusbar } from "./renderer";

afterEach(cleanup);

describe("example company statusbar", () => {
  it("renders company branding and both extension slots", () => {
    render(
      <CompanyStatusbar
        leftItems={<span>left extension</span>}
        rightItems={<span>right extension</span>}
      />,
    );
    expect(screen.getByText("Example Company")).toBeDefined();
    expect(screen.getByText("left extension")).toBeDefined();
    expect(screen.getByText("right extension")).toBeDefined();
  });

  it("publishes a complete root contribution", async () => {
    let contribution: UiStatusbarItemContribution | undefined;
    await plugin.activate({
      get: () => ({
        register(value: UiStatusbarItemContribution) {
          contribution = value;
          return () => {};
        },
      }),
      effect: async (install: () => unknown) => install(),
      provide: () => {
        throw new Error("statusbar contributions use the injected registry");
      },
    } as never);
    expect(contribution).toMatchObject({
      id: "default-statusbar",
      side: "root",
      Component: CompanyStatusbar,
    });
  });
});
