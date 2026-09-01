// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CleanTreeHint } from "./CleanTreeHint";

afterEach(cleanup);

describe("CleanTreeHint", () => {
  it("announces the clean working tree on the current branch", () => {
    render(<CleanTreeHint repoLabel="main" />);
    expect(screen.getByText("Working tree clean")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("shows the detached label when passed", () => {
    render(<CleanTreeHint repoLabel="detached" />);
    expect(screen.getByText("detached")).toBeInTheDocument();
  });
});
