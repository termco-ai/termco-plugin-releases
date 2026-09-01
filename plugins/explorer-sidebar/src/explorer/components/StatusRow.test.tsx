// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusRow } from "./StatusRow";

afterEach(cleanup);

describe("StatusRow", () => {
  it("renders the message with muted styling", () => {
    render(<StatusRow depth={0} message="Loading…" tone="muted" />);
    const el = screen.getByText("Loading…");
    expect(el.className).toContain("text-muted-foreground");
  });

  it("renders errors with destructive styling", () => {
    render(<StatusRow depth={0} message="denied" tone="error" />);
    const el = screen.getByText("denied");
    expect(el.className).toContain("text-destructive");
  });

  it("indents by depth", () => {
    render(<StatusRow depth={2} message="deep" tone="muted" />);
    expect(screen.getByText("deep").style.paddingLeft).toBe("48px");
  });
});
