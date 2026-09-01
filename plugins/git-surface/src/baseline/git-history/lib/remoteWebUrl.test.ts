import { describe, expect, it } from "vitest";
import {
  commitWebUrl,
  hostLabel,
  parseRemoteWebUrl,
  type RemoteWebInfo,
} from "./remoteWebUrl";

describe("parseRemoteWebUrl", () => {
  it("returns null for missing or blank input", () => {
    expect(parseRemoteWebUrl(null)).toBeNull();
    expect(parseRemoteWebUrl(undefined)).toBeNull();
    expect(parseRemoteWebUrl("")).toBeNull();
    expect(parseRemoteWebUrl("   ")).toBeNull();
  });

  it("parses https remotes for each supported host", () => {
    expect(parseRemoteWebUrl("https://github.com/owner/repo.git")).toEqual({
      host: "github",
      hostname: "github.com",
      owner: "owner",
      repo: "repo",
      baseUrl: "https://github.com/owner/repo",
    });
    expect(parseRemoteWebUrl("https://gitlab.com/group/proj")?.host).toBe(
      "gitlab",
    );
    expect(parseRemoteWebUrl("https://bitbucket.org/team/repo")?.host).toBe(
      "bitbucket",
    );
  });

  it("parses scp-style ssh remotes", () => {
    const info = parseRemoteWebUrl("git@github.com:owner/repo.git");
    expect(info).toEqual({
      host: "github",
      hostname: "github.com",
      owner: "owner",
      repo: "repo",
      baseUrl: "https://github.com/owner/repo",
    });
  });

  it("parses scp-style remotes without a user part", () => {
    expect(parseRemoteWebUrl("gitlab.com:group/proj.git")?.host).toBe("gitlab");
  });

  it("normalizes www and uppercase hostnames", () => {
    const info = parseRemoteWebUrl("https://WWW.GitHub.com/Owner/Repo");
    expect(info?.host).toBe("github");
    expect(info?.hostname).toBe("www.github.com");
    expect(info?.baseUrl).toBe("https://www.github.com/Owner/Repo");
  });

  it("strips the .git suffix case-insensitively", () => {
    expect(parseRemoteWebUrl("https://github.com/o/r.GIT")?.repo).toBe("r");
  });

  it("keeps only the owner/repo path segments", () => {
    const info = parseRemoteWebUrl("https://gitlab.com/group/proj/extra");
    expect(info?.owner).toBe("group");
    expect(info?.repo).toBe("proj");
  });

  it("rejects unsupported hosts", () => {
    expect(parseRemoteWebUrl("https://example.com/o/r.git")).toBeNull();
    expect(parseRemoteWebUrl("git@codeberg.org:o/r.git")).toBeNull();
  });

  it("rejects unparsable input and short paths", () => {
    expect(parseRemoteWebUrl("not a url at all")).toBeNull();
    expect(parseRemoteWebUrl("https://github.com/only-owner")).toBeNull();
    expect(parseRemoteWebUrl("/local/path/repo.git")).toBeNull();
  });
});

describe("commitWebUrl", () => {
  const info = (host: RemoteWebInfo["host"]): RemoteWebInfo => ({
    host,
    hostname: "h",
    owner: "o",
    repo: "r",
    baseUrl: "https://h/o/r",
  });

  it("builds the per-host commit URL shape", () => {
    expect(commitWebUrl(info("github"), "abc")).toBe(
      "https://h/o/r/commit/abc",
    );
    expect(commitWebUrl(info("gitlab"), "abc")).toBe(
      "https://h/o/r/-/commit/abc",
    );
    expect(commitWebUrl(info("bitbucket"), "abc")).toBe(
      "https://h/o/r/commits/abc",
    );
  });
});

describe("hostLabel", () => {
  it("labels each host", () => {
    const base = {
      hostname: "h",
      owner: "o",
      repo: "r",
      baseUrl: "https://h/o/r",
    };
    expect(hostLabel({ ...base, host: "github" })).toBe("View on GitHub");
    expect(hostLabel({ ...base, host: "gitlab" })).toBe("View on GitLab");
    expect(hostLabel({ ...base, host: "bitbucket" })).toBe("View on Bitbucket");
  });
});
