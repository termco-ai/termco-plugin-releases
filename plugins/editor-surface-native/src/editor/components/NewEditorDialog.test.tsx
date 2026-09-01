// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../platform", () => ({ invoke: vi.fn() }));
vi.mock("../../workspace", () => ({ currentWorkspaceEnv: vi.fn() }));

import { NewEditorDialog } from "./NewEditorDialog";

afterEach(cleanup);

describe("NewEditorDialog", () => {
  it("contains long paths in their own horizontal scroll region", () => {
    const rootPath = `/Users/developer/${"deeply-nested-workspace/".repeat(12)}`;
    render(
      <NewEditorDialog
        open
        onOpenChange={vi.fn()}
        rootPath={rootPath}
        onCreated={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "New workspace file" });
    const path = screen.getByRole("region", { name: "Full file path" });

    expect(dialog).toHaveClass(
      "grid-cols-[minmax(0,1fr)]",
      "overflow-x-hidden",
    );
    expect(path).toHaveClass("min-w-0", "overflow-x-auto", "whitespace-nowrap");
    expect(path).toHaveAttribute("tabindex", "0");
    expect(path).toHaveTextContent(`${rootPath}untitled.txt`);
  });
});
