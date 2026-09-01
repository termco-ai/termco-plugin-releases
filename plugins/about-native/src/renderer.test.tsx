// @vitest-environment jsdom
import type {
  ApplicationBrandingCapability,
  ApplicationInfoCapability,
  ApplicationUpdateStateCapability,
  ApplicationUpdateStatus,
} from "@termco/application-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { UiSettingsSectionContribution } from "@termco/ui-settings-base";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin, { createAboutSection } from "./renderer";
import { REPOSITORY_URL, WEBSITE_URL } from "./model";

const application: ApplicationInfoCapability = {
  getInfo: vi.fn(async () => ({
    name: "Electron",
    version: "1.2.3",
    bundleId: "app.termco",
    platform: "darwin" as NodeJS.Platform,
    architecture: "arm64",
  })),
};
let status: ApplicationUpdateStatus;
const listeners = new Set<() => void>();
const updates: ApplicationUpdateStateCapability = {
  snapshot: () => status,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  check: vi.fn(async () => {}),
  install: vi.fn(async () => {}),
  dismiss: vi.fn(),
};
const desktop = {
  openUrl: vi.fn(async () => {}),
} as unknown as DesktopIntegrationCapability;
const branding: ApplicationBrandingCapability = {
  logoUrl: "file:///plugin/assets/termco-icon.png",
};

function publish(next: ApplicationUpdateStatus) {
  act(() => {
    status = next;
    for (const listener of listeners) listener();
  });
}

beforeEach(() => {
  status = { kind: "idle" };
  listeners.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("exact About settings section", () => {
  it("preserves the application identity, metadata card, branding, and links", async () => {
    const Section = createAboutSection({
      application,
      updates,
      desktop,
      branding,
    });
    const { container } = render(<Section />);
    expect(await screen.findByText("v1.2.3")).toBeDefined();
    expect(screen.getByText("Electron")).toBeDefined();
    expect(screen.getByText("macOS · arm64 · v1.2.3")).toBeDefined();
    expect(screen.getByText("app.termco")).toBeDefined();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      branding.logoUrl,
    );
    expect(container.querySelector("[style]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "termco-ai/termco" }));
    expect(desktop.openUrl).toHaveBeenCalledWith(REPOSITORY_URL);
    fireEvent.click(screen.getByRole("button", { name: "termco.app" }));
    expect(desktop.openUrl).toHaveBeenLastCalledWith(WEBSITE_URL);
  });

  it("shows the original placeholder while application info is loading", () => {
    const pending: ApplicationInfoCapability = {
      getInfo: () => new Promise(() => {}),
    };
    const Section = createAboutSection({
      application: pending,
      updates,
      desktop,
      branding,
    });
    render(<Section />);
    expect(screen.getAllByText("v—")).toHaveLength(2);
  });

  it("drives every update surface through the shared provider state", () => {
    const Section = createAboutSection({
      application,
      updates,
      desktop,
      branding,
    });
    render(<Section />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(updates.check).toHaveBeenCalledWith({ manual: true });

    publish({
      kind: "available",
      update: {
        available: true,
        version: "2.0.0",
        currentVersion: "1.2.3",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Install v2.0.0" }));
    expect(updates.install).toHaveBeenCalledTimes(1);

    publish({ kind: "downloading", downloaded: 512, contentLength: 1024 });
    expect(screen.getByText("50%")).toBeDefined();
    expect(
      (screen.getByRole("button", {
        name: "Downloading…",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    publish({ kind: "error", message: "network down" });
    expect(screen.getByText("network down")).toBeDefined();
  });

  it("reflects shared automatic update state immediately", () => {
    status = { kind: "uptodate" };
    const Section = createAboutSection({ application, updates, desktop, branding });
    render(<Section />);
    expect(screen.getByRole("button", { name: "You're up to date" })).toBeDefined();
    publish({ kind: "idle" });
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(updates.check).toHaveBeenCalledWith({ manual: true });
  });

  it("uses shared identity branding in the exact section contribution", async () => {
    let section: UiSettingsSectionContribution | undefined;
    await plugin.activate({
      get: (id: string) => {
        if (id === "application.info") return application;
        if (id === "application.branding") return branding;
        if (id === "application.update-state") return updates;
        if (id === "desktop.integration") return desktop;
        return {
          register(value: UiSettingsSectionContribution) {
            section = value;
            return () => {};
          },
        };
      },
      effect: async (install: () => unknown) => install(),
    } as never);
    expect(section).toMatchObject({
      id: "about",
      label: "About",
      Component: expect.any(Function),
    });
  });
});
