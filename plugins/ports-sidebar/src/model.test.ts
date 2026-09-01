import { describe, expect, it } from "vitest";
import {
  activeForwardCount,
  connectionIdFor,
  parsePort,
  sortDetectedPorts,
} from "./model";

describe("ports sidebar model", () => {
  it("derives the shared SSH connection selected by the workspace", () => {
    expect(connectionIdFor({ kind: "ssh", connectionId: "prod", host: "host" })).toBe("prod");
    expect(connectionIdFor({ kind: "local" })).toBeNull();
  });

  it("accepts only TCP port numbers", () => {
    expect(parsePort("3000")).toBe(3000);
    expect(parsePort("0")).toBeNull();
    expect(parsePort("65536")).toBeNull();
    expect(parsePort("3.5")).toBeNull();
  });

  it("counts active forwards and sorts sshd last", () => {
    const forwards = [
      { state: "active" },
      { state: "stopped" },
      { state: "active" },
    ] as Parameters<typeof activeForwardCount>[0];
    expect(activeForwardCount(forwards)).toBe(2);
    const detected = [
      { port: 22 },
      { port: 8080 },
      { port: 3000 },
    ] as Parameters<typeof sortDetectedPorts>[0];
    expect(sortDetectedPorts(detected, 22).map((entry) => entry.port)).toEqual([3000, 8080, 22]);
  });
});
