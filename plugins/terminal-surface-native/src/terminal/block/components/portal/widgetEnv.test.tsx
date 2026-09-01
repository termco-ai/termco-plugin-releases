// @vitest-environment jsdom
import type { WorkspaceEnv } from "../../../../runtime";
import {
  configureTerminalRuntime,
  type TerminalRuntime,
} from "../../../../runtime";
import ui from "@termco/ui";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLOCK_OPEN_FOLDER_EVENT,
} from "../../lib/blockEvents";
import { FilesWidget } from "./FilesWidget";
import { GitStatusWidget } from "./GitStatusWidget";

const files = { readDir: vi.fn() };
const git = { resolveRepo: vi.fn(), status: vi.fn() };
const events = { emit: vi.fn() };
let disposeRuntime = () => {};

const SSH_ENV: WorkspaceEnv = {
  kind: "ssh",
  connectionId: "conn-1",
  host: "termco-e2e",
};

beforeEach(() => {
  disposeRuntime = configureTerminalRuntime({
    events,
    files,
    git,
  } as unknown as TerminalRuntime);
});

afterEach(() => {
  cleanup();
  disposeRuntime();
  vi.clearAllMocks();
});

describe("FilesWidget reads against the block's own env", () => {
  it("invokes fs_read_dir with the SSH workspace and renders folder chips", async () => {
    files.readDir.mockResolvedValue([
      { name: "srv", kind: "dir", size: 0, mtime: 0 },
      { name: "readme.md", kind: "file", size: 12, mtime: 0 },
    ]);

    const { container } = render(
      <ui.TooltipProvider>
        <FilesWidget
          cwd="/root"
          env={SSH_ENV}
          command="ls"
          readOutput={() => ""}
          onEmpty={() => {}}
        />
      </ui.TooltipProvider>,
    );

    await waitFor(() => expect(files.readDir).toHaveBeenCalled());
    expect(files.readDir).toHaveBeenCalledWith(
      "/root",
      true,
      undefined,
      SSH_ENV,
    );
    await waitFor(() =>
      expect(container.querySelectorAll(".tb-chip").length).toBeGreaterThan(0),
    );
    expect(container.textContent).toContain("srv");
  });

  it("folder chip clicks carry the block's env in the open event", async () => {
    files.readDir.mockResolvedValue([
      { name: "srv", kind: "dir", size: 0, mtime: 0 },
    ]);
    const { container } = render(
      <ui.TooltipProvider>
        <FilesWidget
          cwd="/root"
          env={SSH_ENV}
          command="ls"
          readOutput={() => ""}
          onEmpty={() => {}}
        />
      </ui.TooltipProvider>,
    );
    await waitFor(() =>
      expect(container.querySelectorAll(".tb-chip").length).toBeGreaterThan(0),
    );

    (container.querySelector(".tb-chip") as HTMLButtonElement).click();

    expect(events.emit).toHaveBeenCalledWith(BLOCK_OPEN_FOLDER_EVENT, {
      path: "/root/srv",
      env: SSH_ENV,
    });
  });
});

describe("GitStatusWidget reads against the block's own env", () => {
  it("invokes git_resolve_repo and git_status with the SSH workspace", async () => {
    git.resolveRepo.mockResolvedValue({ repoRoot: "/root/proj" });
    git.status.mockResolvedValue({
      repoRoot: "/root/proj",
      changedFiles: [
        {
          path: "a.ts",
          indexStatus: "M",
          worktreeStatus: " ",
          untracked: false,
        },
      ],
    });

    render(
      <GitStatusWidget cwd="/root/proj" env={SSH_ENV} onEmpty={() => {}} />,
    );

    await waitFor(() =>
      expect(git.resolveRepo).toHaveBeenCalledWith("/root/proj", SSH_ENV),
    );
    await waitFor(() =>
      expect(git.status).toHaveBeenCalledWith("/root/proj", SSH_ENV),
    );
  });
});
