// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiOpenButton } from "./AiOpenButton";

afterEach(cleanup);

describe("AiOpenButton", () => {
  it("renders the label and the shortcut hint", () => {
    render(<AiOpenButton onOpen={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Open AI agent");
    // The test env has no platform bridge, so the non-mac modifier applies.
    expect(btn.querySelector("kbd")).toHaveTextContent(/I$/);
  });

  it("invokes onOpen when pressed", () => {
    const onOpen = vi.fn();
    render(<AiOpenButton onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
