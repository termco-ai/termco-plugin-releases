// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allowedForgeCommand, allowedForgeInput, buildRemoteForgePath, forgeRun } from "./forge";

describe("remote forge CLI execution", () => {
  it("prefers the login path and covers common user and package-manager locations", () => {
    const path = buildRemoteForgePath("/usr/bin:/bin", "/custom/bin:/usr/bin", "/home/dev");
    const entries = path.split(":");

    expect(entries[0]).toBe("/custom/bin");
    expect(entries.filter((entry) => entry === "/usr/bin")).toHaveLength(1);
    expect(entries).toEqual(
      expect.arrayContaining([
        "/home/dev/.local/bin",
        "/home/dev/.asdf/shims",
        "/home/dev/.local/share/mise/shims",
        "/home/dev/.nix-profile/bin",
        "/usr/local/bin",
        "/home/linuxbrew/.linuxbrew/bin",
        "/snap/bin",
        "/nix/var/nix/profiles/default/bin",
      ]),
    );
  });

  it("rejects executables outside the forge allowlist", async () => {
    await expect(forgeRun({ executable: "sh", args: ["-c", "echo unsafe"] })).rejects.toThrow(
      "Unsupported forge executable",
    );
  });

  it("rejects credential reads and write operations from the remote bridge", async () => {
    await expect(forgeRun({ executable: "gh", args: ["auth", "token"] })).rejects.toThrow(
      "Unsupported forge command",
    );
    await expect(forgeRun({ executable: "gh", args: ["pr", "merge", "42"] })).rejects.toThrow(
      "Unsupported forge command",
    );
    await expect(forgeRun({ executable: "tea", args: ["login", "add"] })).rejects.toThrow(
      "Unsupported forge command",
    );
  });

  it("rejects unsafe variants of review detail and diff commands", async () => {
    await expect(
      forgeRun({
        executable: "gh",
        args: ["--version"],
        maxOutputBytes: 128 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow("Invalid forge output limit");
    await expect(
      forgeRun({
        executable: "gh",
        args: ["pr", "diff", "0", "--repo", "termco/app", "--color", "never"],
      }),
    ).rejects.toThrow("Unsupported forge command");
    await expect(
      forgeRun({
        executable: "glab",
        args: [
          "mr",
          "diff",
          "42",
          "--repo",
          "https://gitlab.example/group/app.git",
          "--raw",
          "--color",
          "always",
        ],
      }),
    ).rejects.toThrow("Unsupported forge command");
    await expect(
      forgeRun({
        executable: "tea",
        args: ["api", "/repos/{owner}/{repo}/pulls/42.diff", "--repo", "../../escape"],
      }),
    ).rejects.toThrow("Unsupported forge command");
  });

  it("allows only exact review-comment command shapes", () => {
    expect(
      allowedForgeCommand("glab", [
        "mr",
        "note",
        "create",
        "42",
        "--repo",
        "https://gitlab.example/group/app.git",
        "--file",
        "src/a.ts",
        "--line",
        "7",
        "--message",
        "Please add coverage.",
      ]),
    ).toBe(true);
    expect(
      allowedForgeCommand("gh", [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "POST",
        "repos/termco/app/pulls/42/comments",
        "-f",
        "body=Please add coverage.",
        "-f",
        "commit_id=abc1234",
        "-f",
        "path=src/a.ts",
        "-F",
        "line=7",
        "-f",
        "side=RIGHT",
      ]),
    ).toBe(true);
    expect(
      allowedForgeCommand("gh", [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "DELETE",
        "repos/termco/app/pulls/42/comments",
      ]),
    ).toBe(false);
    expect(
      allowedForgeCommand("glab", [
        "mr",
        "note",
        "create",
        "42",
        "--repo",
        "https://gitlab.example/group/app.git",
        "--file",
        "-R",
        "--line",
        "7",
        "--message",
        "unsafe",
      ]),
    ).toBe(false);
  });

  it("allows a validated GitHub review transaction body and rejects malformed input", async () => {
    const args = [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "POST",
      "repos/termco/app/pulls/42/reviews",
      "--input",
      "-",
    ];
    expect(allowedForgeCommand("gh", args)).toBe(true);
    await expect(
      forgeRun({
        executable: "gh",
        args,
        stdin: JSON.stringify({
          commit_id: "abc1234",
          event: "COMMENT",
          comments: [{ path: "../escape", line: 1, side: "RIGHT", body: "unsafe" }],
        }),
      }),
    ).rejects.toThrow("Unsupported forge command input");
  });
});

it("allows bounded GitLab authentication probes over SSH", () => {
  expect(allowedForgeCommand("glab", ["auth", "status", "--hostname", "gitlab.com"])).toBe(true);
  expect(allowedForgeCommand("glab", ["auth", "status", "--hostname", "--show-token"])).toBe(false);
});

it("accepts GitLab JSON comment bodies and rejects bulk publication or unsafe positions", () => {
  const args = ["api", "--hostname", "gitlab.com", "--method", "POST", "projects/team%2Fapp/merge_requests/7/discussions", "--input", "-"];
  const position = { base_sha: "def5678", start_sha: "fed7654", head_sha: "abc1234", old_path: "old.ts", new_path: "new.ts", position_type: "text", new_line: 1 };
  expect(allowedForgeCommand("glab", args)).toBe(true);
  expect(allowedForgeInput("glab", args, JSON.stringify({ body: "Check this", position }))).toBe(true);
  expect(allowedForgeInput("glab", args, JSON.stringify({ body: "Check this", position: { ...position, old_path: "../escape" } }))).toBe(false);
  expect(allowedForgeCommand("glab", ["api", "--hostname", "gitlab.com", "--method", "POST", "projects/team%2Fapp/merge_requests/7/draft_notes/bulk_publish"])).toBe(false);
});

it("allows the Tea URL list field set but no arbitrary fields", () => {
  const args = ["pulls", "list", "--state", "open", "--output", "json", "--limit", "50", "--fields", "index,title,state,author,updated,url"];
  expect(allowedForgeCommand("tea", args)).toBe(true);
  expect(allowedForgeCommand("tea", [...args.slice(0, -1), "token"])).toBe(false);
});
