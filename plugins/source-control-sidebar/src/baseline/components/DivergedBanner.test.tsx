// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DivergedBanner } from "./DivergedBanner";

afterEach(cleanup);

describe("DivergedBanner", () => {
  it("warns about the diverged upstream", () => {
    render(<DivergedBanner />);
    expect(screen.getByText("Diverged from upstream")).toBeInTheDocument();
  });
});
