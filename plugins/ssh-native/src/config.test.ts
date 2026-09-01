import { describe, expect, it } from "vitest";
import { parseSshConfig } from "./config";

describe("parseSshConfig", () => {
  it("parses Host blocks with HostName/User/Port", () => {
    const text = `
# comment
Host prod
  HostName prod.example.com
  User deploy
  Port 2222

Host laptop
  HostName 10.0.0.5
`;
    expect(parseSshConfig(text)).toEqual([
      { alias: "prod", hostName: "prod.example.com", user: "deploy", port: 2222 },
      { alias: "laptop", hostName: "10.0.0.5" },
    ]);
  });

  it("applies indented keys to every alias on a multi-alias Host line", () => {
    expect(parseSshConfig("Host a b\n  User shared\n  Port 22")).toEqual([
      { alias: "a", user: "shared", port: 22 },
      { alias: "b", user: "shared", port: 22 },
    ]);
  });

  it("skips wildcard patterns", () => {
    expect(parseSshConfig("Host *\n  User default\nHost real\n  HostName r.example.com")).toEqual([
      { alias: "real", hostName: "r.example.com" },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseSshConfig("")).toEqual([]);
  });
});
