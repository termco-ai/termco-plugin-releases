// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { GitCommitFileDiffTab, GitDiffTab, Tab } from "../../../tabTypes";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommitSource, WorkingSource } from "../lib/gitDiffLoadState";

type PaneProps = {
  source: WorkingSource | CommitSource;
  chipLabel?: string;
  active: boolean;
};

let lastPaneProps: PaneProps | null = null;

vi.mock("./GitDiffPane", () => ({
  GitDiffPane: (props: PaneProps) => {
    lastPaneProps = props;
    return <div data-testid="git-diff-pane">{props.source.path}</div>;
  },
}));

import { GitDiffStack } from "./GitDiffStack";

function workingTab(id: number): GitDiffTab {
  return {
    id,
    kind: "git-diff",
    title: "diff",
    path: `w${id}.ts`,
    repoRoot: "/repo",
    mode: "-",
    originalPath: null,
    rigId: "default",
  };
}

function commitTab(id: number): GitCommitFileDiffTab {
  return {
    id,
    kind: "git-commit-file",
    title: "commit diff",
    repoRoot: "/repo",
    sha: "abcdef1234567890",
    shortSha: "abcdef1",
    subject: "commit subject",
    path: `c${id}.ts`,
    originalPath: "renamed-from.ts",
    rigId: "default",
  };
}

afterEach(() => {
  cleanup();
  lastPaneProps = null;
});

describe("GitDiffStack", () => {
  it("renders nothing when no diff tab is active", () => {
    const tabs: Tab[] = [workingTab(1)];
    const { container } = render(<GitDiffStack tabs={tabs} activeId={99} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("builds a working source for git-diff tabs", () => {
    render(<GitDiffStack tabs={[workingTab(1)]} activeId={1} />);
    expect(screen.getByTestId("git-diff-pane")).toBeInTheDocument();
    expect(lastPaneProps?.chipLabel).toBeUndefined();
    expect(lastPaneProps).toMatchObject({
      active: true,
      source: {
        kind: "working",
        repoRoot: "/repo",
        path: "w1.ts",
        mode: "-",
        originalPath: null,
      },
    });
  });

  it("builds a commit source with the short sha chip", () => {
    render(<GitDiffStack tabs={[commitTab(2)]} activeId={2} />);
    expect(lastPaneProps).toMatchObject({
      active: true,
      chipLabel: "abcdef1",
      source: {
        kind: "commit",
        repoRoot: "/repo",
        sha: "abcdef1234567890",
        path: "c2.ts",
        originalPath: "renamed-from.ts",
      },
    });
  });
});
