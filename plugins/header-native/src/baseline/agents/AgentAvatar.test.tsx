// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAvatar } from "./AgentAvatar";

const branding = vi.hoisted(() => ({ logoUrl: "termco-plugin://identity/generation/assets/termco-icon.png" }));
vi.mock("../runtime", () => ({ headerDependencies: () => ({ branding }) }));
afterEach(cleanup);

describe("AgentAvatar", () => {
  it("uses the application branding asset for Termco activity", () => {
    const { container } = render(<AgentAvatar agent="termco" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(branding.logoUrl);
  });

  it("replaces a failed image with a visible icon and retries a new branding URL", () => {
    const { container, rerender } = render(<AgentAvatar agent="termco" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    const previous = branding.logoUrl;
    try {
      branding.logoUrl = "termco-plugin://identity/new/assets/termco-icon.png";
      rerender(<AgentAvatar agent="termco" />);
      expect(container.querySelector("img")?.getAttribute("src")).toBe(branding.logoUrl);
    } finally {
      branding.logoUrl = previous;
    }
  });

  it("keeps a visible fallback when branding is unavailable", () => {
    const previous = branding.logoUrl;
    try {
      branding.logoUrl = "";
      const { container } = render(<AgentAvatar agent="termco" />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("svg")).not.toBeNull();
    } finally {
      branding.logoUrl = previous;
    }
  });
});
