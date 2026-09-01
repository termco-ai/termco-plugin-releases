// @vitest-environment jsdom
import type { GitLogEntry } from "../../../runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteWebInfo } from "../lib/remoteWebUrl";

const mocks = vi.hoisted(() => ({
  openUrl: vi.fn(async () => {}),
}));

vi.mock("../../../runtime", () => ({
  openUrl: mocks.openUrl,
  fileIconUrl: () => "",
}));

import { CommitDetail } from "./CommitDetail";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  mocks.openUrl.mockClear();
});

function commit(overrides: Partial<GitLogEntry> = {}): GitLogEntry {
  return {
    sha: "abcdef1234567890",
    shortSha: "abcdef1",
    author: "Ada Lovelace",
    authorEmail: "ada@example.com",
    timestampSecs: 1700000000,
    parents: [],
    subject: "Fix crash",
    filesChanged: 1,
    insertions: 1,
    deletions: 0,
    ...overrides,
  };
}

const github: RemoteWebInfo = {
  host: "github",
  hostname: "github.com",
  owner: "o",
  repo: "r",
  baseUrl: "https://github.com/o/r",
};

function renderDetail(c: GitLogEntry, remoteWeb: RemoteWebInfo | null = null) {
  const onCopySha = vi.fn();
  const onOpenFile = vi.fn();
  const onRetryFiles = vi.fn();
  const view = render(
    <CommitDetail
      commit={c}
      filesEntry={{ state: "loaded", files: [] }}
      remoteWeb={remoteWeb}
      onCopySha={onCopySha}
      onOpenFile={onOpenFile}
      onRetryFiles={onRetryFiles}
    />,
  );
  return { onCopySha, onOpenFile, onRetryFiles, ...view };
}

describe("CommitDetail header", () => {
  it("shows sha, subject, author, and email", () => {
    renderDetail(commit());
    expect(screen.getByText("abcdef1")).toBeTruthy();
    expect(screen.getByText("Fix crash")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });

  it("falls back for missing subject, author, and email", () => {
    renderDetail(commit({ subject: "", author: "", authorEmail: "" }));
    expect(screen.getByText("(no subject)")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.queryByText("ada@example.com")).toBeNull();
  });
});

describe("CommitDetail copy action", () => {
  it("copies the full sha and shows transient feedback", async () => {
    vi.useFakeTimers();
    const { onCopySha } = renderDetail(commit());
    fireEvent.click(screen.getByText("Copy SHA"));
    expect(onCopySha).toHaveBeenCalledWith("abcdef1234567890");
    expect(screen.getByText("Copied")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByText("Copy SHA")).toBeTruthy();
    expect(screen.queryByText("Copied")).toBeNull();
  });
});

describe("CommitDetail remote link", () => {
  it("opens the commit on the remote host", () => {
    renderDetail(commit(), github);
    const button = screen.getByText("View on GitHub");
    fireEvent.click(button);
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://github.com/o/r/commit/abcdef1234567890",
    );
  });

  it("hides the remote action without a parsed remote", () => {
    renderDetail(commit(), null);
    expect(screen.queryByText(/View on/)).toBeNull();
  });
});

describe("CommitDetail files section", () => {
  it("renders the files area from the entry", () => {
    renderDetail(commit());
    expect(screen.getByText("No file changes.")).toBeTruthy();
  });
});
