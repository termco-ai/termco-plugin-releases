// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiInputBarConnect } from "./AiInputBar";

afterEach(cleanup);

describe("AiInputBarConnect", () => {
  it("explains that keys stay in the OS keychain", () => {
    render(<AiInputBarConnect onAdd={() => {}} />);
    expect(
      screen.getByText(/your key stays in your\s*OS keychain/i),
    ).toBeInTheDocument();
  });

  it("invokes onAdd when the connect button is pressed", () => {
    const onAdd = vi.fn();
    render(<AiInputBarConnect onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: /connect provider/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
