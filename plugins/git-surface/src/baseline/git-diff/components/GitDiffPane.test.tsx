// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { GitDiffContentResult } from "../../../runtime";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));

const gitDiffContent = vi.fn();
const gitCommitFileDiff = vi.fn();

vi.mock("../../../runtime", () => ({
  currentWorkspaceScopeKey: () => "local",
  native: {
    gitDiffContent: (...args: unknown[]) => gitDiffContent(...args),
    gitCommitFileDiff: (...args: unknown[]) => gitCommitFileDiff(...args),
  },
}));

import { invalidateRepoDiffs } from "../lib/diffCache";
import type { CommitSource, WorkingSource } from "../lib/gitDiffLoadState";
import { GitDiffPane } from "./GitDiffPane";

let pathCounter = 0;

function workingSource(overrides: Partial<WorkingSource> = {}): WorkingSource {
  pathCounter += 1;
  return {
    kind: "working",
    repoRoot: "/repo",
    path: `file-${pathCounter}.ts`,
    mode: "-",
    originalPath: null,
    ...overrides,
  };
}

function textResult(): GitDiffContentResult {
  return {
    originalContent: "const a = 1;\n",
    modifiedContent: "const a = 2;\n",
    isBinary: false,
    fallbackPatch: "",
    truncated: false,
  };
}

beforeEach(() => {
  gitDiffContent.mockReset().mockResolvedValue(textResult());
  gitCommitFileDiff.mockReset().mockResolvedValue(textResult());
});

afterEach(() => {
  cleanup();
  invalidateRepoDiffs("/repo");
});

describe("GitDiffPane", () => {
  it("stays idle with a spinner while inactive", () => {
    render(<GitDiffPane source={workingSource()} active={false} />);
    expect(screen.getByText("Loading diff…")).toBeInTheDocument();
    expect(gitDiffContent).not.toHaveBeenCalled();
  });

  it("loads and renders the diff for a working source", async () => {
    const source = workingSource();
    const { container } = render(<GitDiffPane source={source} active />);
    expect(screen.getByText("Loading diff…")).toBeInTheDocument();
    await waitFor(() => {
      // Two columns now, as in VS Code: the previous version on the left,
      // the new one on the right — each its own editor with its own gutter.
      const columns = [...container.querySelectorAll(".cm-content")];
      expect(columns).toHaveLength(2);
      expect(columns[0].textContent).toContain("const a = 1;");
      expect(columns[1].textContent).toContain("const a = 2;");
    });
    expect(gitDiffContent).toHaveBeenCalledWith(
      "/repo",
      source.path,
      false,
      null,
    );
    expect(screen.getByText(source.path)).toBeInTheDocument();
    expect(screen.getByText("/repo")).toBeInTheDocument();
  });

  it("shows the mode chip by default and a custom chip when given", async () => {
    const source = workingSource({ mode: "+" });
    const first = render(<GitDiffPane source={source} active />);
    await waitFor(() => {
      expect(screen.getByText("+")).toBeInTheDocument();
    });
    first.unmount();

    const commit: CommitSource = {
      kind: "commit",
      repoRoot: "/repo",
      sha: "abc123",
      path: "c.ts",
      originalPath: null,
    };
    render(<GitDiffPane source={commit} active chipLabel="abc123f" />);
    await waitFor(() => {
      expect(screen.getByText("abc123f")).toBeInTheDocument();
    });
    expect(gitCommitFileDiff).toHaveBeenCalledWith(
      "/repo",
      "abc123",
      "c.ts",
      null,
    );
  });

  it("falls back to the raw patch for binary diffs with line stats", async () => {
    gitDiffContent.mockResolvedValueOnce({
      originalContent: "",
      modifiedContent: "",
      isBinary: true,
      fallbackPatch: "@@ -1 +1 @@\n-old\n+new\n+more\n",
      truncated: false,
    });
    render(<GitDiffPane source={workingSource()} active />);
    await waitFor(() => {
      expect(screen.getByText("Binary / patch fallback")).toBeInTheDocument();
    });
    expect(screen.getByText(/\+new/)).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
  });

  it("uses the patch view for oversized files", async () => {
    gitDiffContent.mockResolvedValueOnce({
      originalContent: "x".repeat(256 * 1024 + 1),
      modifiedContent: "y",
      isBinary: false,
      fallbackPatch: "@@ -1 +1 @@\n-x\n+y\n",
      truncated: true,
    });
    render(<GitDiffPane source={workingSource()} active />);
    await waitFor(() => {
      expect(screen.getByText("Large file / patch view")).toBeInTheDocument();
    });
  });

  it("shows a placeholder when no fallback patch is available", async () => {
    gitDiffContent.mockResolvedValueOnce({
      originalContent: "",
      modifiedContent: "",
      isBinary: true,
      fallbackPatch: "",
      truncated: false,
    });
    render(<GitDiffPane source={workingSource()} active />);
    await waitFor(() => {
      expect(
        screen.getByText("Diff preview is not available for this file."),
      ).toBeInTheDocument();
    });
  });

  it("surfaces load errors", async () => {
    gitDiffContent.mockRejectedValueOnce(new Error("repo gone"));
    render(<GitDiffPane source={workingSource()} active />);
    await waitFor(() => {
      expect(screen.getByText("repo gone")).toBeInTheDocument();
    });
  });

  it("stringifies non-Error failures", async () => {
    gitDiffContent.mockRejectedValueOnce("plain failure");
    render(<GitDiffPane source={workingSource()} active />);
    await waitFor(() => {
      expect(screen.getByText("plain failure")).toBeInTheDocument();
    });
  });

  it("paints instantly from cache on remount without re-fetching", async () => {
    const source = workingSource();
    const first = render(<GitDiffPane source={source} active />);
    await waitFor(() => {
      expect(gitDiffContent).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Loading diff…")).toBeNull();
    });
    first.unmount();

    const { container } = render(<GitDiffPane source={source} active />);
    expect(screen.queryByText("Loading diff…")).toBeNull();
    await waitFor(() => {
      // Two columns now, as in VS Code: the previous version on the left,
      // the new one on the right — each its own editor with its own gutter.
      const columns = [...container.querySelectorAll(".cm-content")];
      expect(columns).toHaveLength(2);
      expect(columns[0].textContent).toContain("const a = 1;");
      expect(columns[1].textContent).toContain("const a = 2;");
    });
    expect(gitDiffContent).toHaveBeenCalledTimes(1);
  });
});

/**
 * A side of the diff that could not be READ must not render as a side that is
 * empty. This is what let an SSH rig — where the working copy was fetched from
 * the wrong machine — display a perfectly plausible "everything was deleted"
 * diff instead of an error. `intoText` flattens missing/binary/empty into the
 * same "", so the reason has to travel separately.
 */
describe("GitDiffPane — unreadable sides", () => {
  const missingModified = (): GitDiffContentResult => ({
    originalContent: "const a = 1;\nconst b = 2;\n",
    modifiedContent: "",
    originalState: "ok",
    modifiedState: "missing",
    isBinary: false,
    fallbackPatch: "",
    truncated: false,
  });

  it("explains a working copy it could not read", async () => {
    gitDiffContent.mockResolvedValue(missingModified());
    render(<GitDiffPane source={workingSource()} active />);

    await waitFor(() =>
      expect(
        screen.getByText(/not in the working tree/i),
      ).toBeInTheDocument(),
    );
    // The point: no wall of red pretending to be a diff.
    expect(screen.queryByText("const a = 1;")).not.toBeInTheDocument();
    // And it names the remote case, which is the one that actually happened.
    expect(screen.getByText(/remote rig/i)).toBeInTheDocument();
  });

  it("says so when neither side could be read", async () => {
    gitDiffContent.mockResolvedValue({
      originalContent: "",
      modifiedContent: "",
      originalState: "missing",
      modifiedState: "missing",
      isBinary: false,
      fallbackPatch: "",
      truncated: false,
    } satisfies GitDiffContentResult);
    render(<GitDiffPane source={workingSource()} active />);

    await waitFor(() =>
      expect(screen.getByText(/Nothing to compare/i)).toBeInTheDocument(),
    );
  });

  // An all-green diff IS what a new file looks like — no warning, just a label.
  it("labels a new file instead of warning about it", async () => {
    gitDiffContent.mockResolvedValue({
      originalContent: "",
      modifiedContent: "const a = 1;\n",
      originalState: "missing",
      modifiedState: "ok",
      isBinary: false,
      fallbackPatch: "",
      truncated: false,
    } satisfies GitDiffContentResult);
    render(<GitDiffPane source={workingSource()} active />);

    await waitFor(() => expect(screen.getByText("New file")).toBeInTheDocument());
    expect(screen.queryByText(/Nothing to compare/i)).not.toBeInTheDocument();
  });

  // Results cached by a build that predates the states must keep rendering as
  // they always did, rather than falling into a warning they never had.
  it("renders a result carrying no states at all", async () => {
    gitDiffContent.mockResolvedValue(textResult());
    const { container } = render(<GitDiffPane source={workingSource()} active />);

    await waitFor(() =>
      expect(container.querySelector(".cm-editor")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/not in the working tree/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing to compare/i)).not.toBeInTheDocument();
  });
});

/**
 * The two-column layout, which is what VS Code shows and what the unified view
 * could not do: deleted lines were block widgets outside the document, so they
 * had no line number at all.
 */
describe("GitDiffPane — side by side", () => {
  it("gives both columns their own line-number gutter", async () => {
    const { container } = render(<GitDiffPane source={workingSource()} active />);

    await waitFor(() =>
      expect(container.querySelectorAll(".cm-content")).toHaveLength(2),
    );
    expect(container.querySelectorAll(".cm-lineNumbers")).toHaveLength(2);
  });

  // Without teardown every tab switch would leave two editors behind.
  it("tears the view down on unmount", async () => {
    const { container, unmount } = render(
      <GitDiffPane source={workingSource()} active />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll(".cm-content")).toHaveLength(2),
    );
    unmount();
    expect(container.querySelectorAll(".cm-content")).toHaveLength(0);
  });
});
