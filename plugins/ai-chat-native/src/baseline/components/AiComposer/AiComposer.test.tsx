// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/composer", () => ({
  useComposer: () => ({
    files: [],
    removeFile: vi.fn(),
    pickedSnippets: [],
    removeSnippet: vi.fn(),
    setValue: vi.fn(),
    pickedCommands: [],
    removeCommand: vi.fn(),
  }),
}));
vi.mock("../AiComposerInput", () => ({
  AiComposerInput: () => <div data-testid="input" />,
}));
vi.mock("../ComposerActions", () => ({
  ComposerActions: () => <div data-testid="actions" />,
}));
vi.mock("../ChipsRow", () => ({ ChipsRow: () => <div data-testid="chips" /> }));

import { AiComposer } from "./AiComposer";

afterEach(cleanup);

describe("AiComposer", () => {
  it("composes the chips, the input, and the action row into one unit", () => {
    render(<AiComposer />);
    expect(screen.getByTestId("chips")).toBeInTheDocument();
    expect(screen.getByTestId("input")).toBeInTheDocument();
    expect(screen.getByTestId("actions")).toBeInTheDocument();
  });
});
