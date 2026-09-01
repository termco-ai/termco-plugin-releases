import { describe, expect, it } from "vitest";
import { emptyImage, parseImage } from "./imageParse";

describe("parseImage", () => {
  it("extracts size, platform, layers, digest, env and exposed ports", () => {
    const json = JSON.stringify([
      {
        Id: "sha256:0011223344556677",
        Size: 187_000_000,
        Architecture: "arm64",
        Os: "linux",
        Created: "2024-04-30T08:00:00.000Z",
        RepoDigests: ["nginx@sha256:aabbccddeeff0011"],
        RootFS: { Layers: ["l1", "l2", "l3", "l4", "l5", "l6", "l7"] },
        Config: {
          Env: ["PATH=/usr/bin", "NGINX_VERSION=1.27"],
          ExposedPorts: { "80/tcp": {}, "443/tcp": {} },
        },
      },
    ]);
    expect(parseImage(json)).toEqual({
      size: 187_000_000,
      arch: "arm64",
      os: "linux",
      layers: 7,
      digest: "aabbccddeeff",
      created: "2024-04-30 08:00:00",
      envBaked: ["PATH=/usr/bin", "NGINX_VERSION=1.27"],
      exposedPorts: ["80/tcp", "443/tcp"],
    });
  });

  it("falls back to Id for the digest when RepoDigests is missing", () => {
    const json = JSON.stringify([{ Id: "sha256:deadbeef0000ffff" }]);
    expect(parseImage(json).digest).toBe("deadbeef0000");
  });

  it("returns empty info for broken/empty JSON", () => {
    expect(parseImage("nope")).toEqual(emptyImage());
    expect(parseImage("[]")).toEqual(emptyImage());
  });
});
