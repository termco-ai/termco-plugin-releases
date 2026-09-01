import { describe, expect, it } from "vitest";
import { parseProbe } from "./probe";

describe("parseProbe", () => {
  it("extracts marker lines despite MOTD/banner noise", () => {
    const out = [
      "*** Welcome to corp-host — authorized use only ***",
      "Last login: Mon Jul  7 09:00:00 2026",
      "TCHOME=/home/deploy",
      "TCUNAME=Linux|x86_64",
      "TCNODE=/usr/bin/node",
      "TCNODEV=v20.11.1",
    ].join("\n");
    expect(parseProbe(out)).toEqual({
      home: "/home/deploy",
      unameS: "Linux",
      unameM: "x86_64",
      nodePath: "/usr/bin/node",
      nodeVersion: "v20.11.1",
      musl: false,
      shell: null,
    });
  });

  it("captures the login shell and reports no node + musl on Alpine", () => {
    const out = "TCHOME=/root\nTCUNAME=Linux|aarch64\nTCSHELL=/bin/ash\nTCMUSL=1\n";
    expect(parseProbe(out)).toEqual({
      home: "/root",
      unameS: "Linux",
      unameM: "aarch64",
      nodePath: null,
      nodeVersion: null,
      musl: true,
      shell: "/bin/ash",
    });
  });

  it("yields empty home when the marker is absent", () => {
    expect(parseProbe("noise\n").home).toBe("");
  });
});
