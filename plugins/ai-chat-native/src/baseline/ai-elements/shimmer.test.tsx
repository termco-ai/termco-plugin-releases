// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Shimmer } from "./shimmer";

afterEach(cleanup);

describe("Shimmer", () => {
  it("renders a paragraph with shimmer styling by default", () => {
    render(<Shimmer>Loading</Shimmer>);
    const el = screen.getByText("Loading");
    expect(el.tagName).toBe("P");
    expect(el.className).toContain("termco-shimmer");
  });

  it("derives the spread from the text length", () => {
    render(<Shimmer>abcd</Shimmer>);
    const el = screen.getByText("abcd");
    expect(el.style.getPropertyValue("--shimmer-spread")).toBe("8px");
    expect(el.style.getPropertyValue("--shimmer-duration")).toBe("2s");
  });

  it("honors a custom element, duration and spread", () => {
    render(
      <Shimmer as="span" duration={1.5} spread={3} className="extra">
        ab
      </Shimmer>,
    );
    const el = screen.getByText("ab");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("extra");
    expect(el.style.getPropertyValue("--shimmer-spread")).toBe("6px");
    expect(el.style.getPropertyValue("--shimmer-duration")).toBe("1.5s");
  });
});
