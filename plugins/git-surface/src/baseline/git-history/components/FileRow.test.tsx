// @vitest-environment jsdom
import type { GitCommitFileChange } from "../../../runtime";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../runtime", () => ({
  fileIconUrl: (name: string) =>
    name.endsWith(".ts") ? "icon://typescript" : "",
}));

import { FileRow } from "./FileRow";

afterEach(() => {
  cleanup();
});

function file(
  overrides: Partial<GitCommitFileChange> = {},
): GitCommitFileChange {
  return {
    path: "src/modules/git/file.ts",
    originalPath: null,
    status: "M",
    statusLabel: "Modified",
    added: 3,
    removed: 1,
    isBinary: false,
    ...overrides,
  };
}

describe("FileRow", () => {
  it("shows the file name, directory, stats, and status letter", () => {
    render(<FileRow file={file()} onOpen={() => {}} />);
    expect(screen.getByText("file.ts")).toBeTruthy();
    expect(screen.getByText("src/modules/git")).toBeTruthy();
    expect(screen.getByText("+3")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();
    const status = screen.getByTitle("Modified");
    expect(status.textContent).toBe("M");
    expect(status.className).toContain("amber");
  });

  it("renders the resolved file icon", () => {
    const { container } = render(<FileRow file={file()} onOpen={() => {}} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("icon://typescript");
  });

  it("renders a placeholder when no icon resolves", () => {
    const { container } = render(
      <FileRow file={file({ path: "README" })} onOpen={() => {}} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("omits the directory for top-level files", () => {
    render(<FileRow file={file({ path: "README" })} onOpen={() => {}} />);
    expect(screen.getByText("README")).toBeTruthy();
    expect(screen.queryByText("src/modules/git")).toBeNull();
  });

  it("shows a binary badge instead of counts", () => {
    render(
      <FileRow
        file={file({ isBinary: true, added: 5, removed: 5 })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("binary")).toBeTruthy();
    expect(screen.queryByText("+5")).toBeNull();
  });

  it("hides zero counters", () => {
    render(<FileRow file={file({ added: 0, removed: 0 })} onOpen={() => {}} />);
    expect(screen.queryByText("+0")).toBeNull();
    expect(screen.queryByText("-0")).toBeNull();
  });

  it("uppercases the status letter", () => {
    render(
      <FileRow
        file={file({ status: "a", statusLabel: "Added" })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTitle("Added").textContent).toBe("A");
  });

  it("invokes onOpen when clicked", () => {
    const onOpen = vi.fn();
    render(<FileRow file={file()} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
