// @vitest-environment jsdom
import type { GitCommitFileChange, GitLogEntry } from "../../../runtime";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilesEntry } from "../types";

vi.mock("../../../runtime", () => ({
  fileIconUrl: () => "",
}));

import { CommitFiles } from "./CommitFiles";

afterEach(() => {
  cleanup();
});

const commit: GitLogEntry = {
  sha: "abc",
  shortSha: "abc",
  author: "Dev",
  authorEmail: "dev@example.com",
  timestampSecs: 1700000000,
  parents: [],
  subject: "subject",
  filesChanged: 2,
  insertions: 1,
  deletions: 1,
};

function file(path: string): GitCommitFileChange {
  return {
    path,
    originalPath: null,
    status: "M",
    statusLabel: "Modified",
    added: 1,
    removed: 0,
    isBinary: false,
  };
}

function renderFiles(entry: FilesEntry | null) {
  const onOpenFile = vi.fn();
  const onRetry = vi.fn();
  const view = render(
    <CommitFiles
      commit={commit}
      filesEntry={entry}
      onOpenFile={onOpenFile}
      onRetry={onRetry}
    />,
  );
  return { onOpenFile, onRetry, ...view };
}

describe("CommitFiles", () => {
  it("shows the loading state for a missing entry", () => {
    renderFiles(null);
    expect(screen.getByText("Loading files…")).toBeTruthy();
  });

  it("shows the loading state while fetching", () => {
    renderFiles({ state: "loading" });
    expect(screen.getByText("Loading files…")).toBeTruthy();
  });

  it("shows the error with a retry action", () => {
    const { onRetry } = renderFiles({ state: "error", error: "boom" });
    expect(screen.getByText("boom")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows an empty message for a commit without file changes", () => {
    renderFiles({ state: "loaded", files: [] });
    expect(screen.getByText("No file changes.")).toBeTruthy();
  });

  it("lists files with a count badge", () => {
    renderFiles({
      state: "loaded",
      files: [file("a.ts"), file("b.ts"), file("dir/c.ts")],
    });
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("c.ts")).toBeTruthy();
  });

  it("forwards row clicks with the commit and file", () => {
    const { onOpenFile } = renderFiles({
      state: "loaded",
      files: [file("a.ts")],
    });
    fireEvent.click(screen.getByText("a.ts"));
    expect(onOpenFile).toHaveBeenCalledWith(commit, file("a.ts"));
  });
});
