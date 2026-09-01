// @vitest-environment jsdom
import type { GitLogEntry } from "../../../runtime";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GRID_TEMPLATE } from "../lib/constants";
import { type GraphRow, laneColor } from "../lib/graph";
import { CommitRow, type CommitRowProps } from "./CommitRow";

afterEach(() => {
  cleanup();
});

function commit(overrides: Partial<GitLogEntry> = {}): GitLogEntry {
  return {
    sha: "abcdef1234567890",
    shortSha: "abcdef1",
    author: "Ada Lovelace",
    authorEmail: "ada@example.com",
    timestampSecs: 1700000000,
    parents: [],
    subject: "Fix the resize crash",
    filesChanged: 2,
    insertions: 10,
    deletions: 4,
    ...overrides,
  };
}

function renderRow(c: GitLogEntry, overrides: Partial<CommitRowProps> = {}) {
  const onClick = vi.fn();
  const view = render(
    <CommitRow
      commit={c}
      query=""
      active={false}
      graphRow={null}
      maxLaneCount={1}
      gridTemplate={GRID_TEMPLATE}
      onClick={onClick}
      {...overrides}
    />,
  );
  return { onClick, ...view };
}

describe("CommitRow", () => {
  it("shows sha, subject, author chip, and stats", () => {
    renderRow(commit());
    expect(screen.getByText("abcdef1")).toBeTruthy();
    expect(screen.getByText("Fix the resize crash")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("AL")).toBeTruthy();
    expect(screen.getByText("+10")).toBeTruthy();
    expect(screen.getByText("-4")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByTitle("2 files changed")).toBeTruthy();
  });

  it("reports the sha and mouse event on click", () => {
    const { onClick } = renderRow(commit());
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toBe("abcdef1234567890");
  });

  it("falls back for a missing subject and author", () => {
    renderRow(commit({ subject: "", author: "" }));
    expect(screen.getByText("(no subject)")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("singularizes the files-changed tooltip", () => {
    renderRow(commit({ filesChanged: 1 }));
    expect(screen.getByTitle("1 file changed")).toBeTruthy();
  });

  it("shows a placeholder dash for an empty commit", () => {
    renderRow(commit({ filesChanged: 0, insertions: 0, deletions: 0 }));
    expect(screen.getByText("-")).toBeTruthy();
    expect(screen.queryByText("+0")).toBeNull();
  });

  it("hides the zero side of the stats", () => {
    renderRow(commit({ insertions: 0, deletions: 7 }));
    expect(screen.queryByText("+0")).toBeNull();
    expect(screen.getByText("-7")).toBeTruthy();
  });

  it("highlights query matches in subject and author", () => {
    const { container } = renderRow(commit(), { query: "resize" });
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("resize");
  });

  it("renders the graph rail when a row is provided", () => {
    const graphRow: GraphRow = {
      sha: "abcdef1234567890",
      lane: 0,
      nodeColor: laneColor(0),
      laneCount: 1,
      topEdges: [],
      bottomEdges: [],
    };
    const { container } = renderRow(commit(), { graphRow });
    expect(container.querySelector("svg circle")).toBeTruthy();
  });

  it("uses the author email for the chip tooltip when present", () => {
    renderRow(commit());
    expect(screen.getByTitle("ada@example.com")).toBeTruthy();
  });
});
