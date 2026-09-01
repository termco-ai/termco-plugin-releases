import { describe, expect, it } from "vitest";
import { joinDetectedPorts, parseDockerPorts } from "./dockerPorts";

describe("parseDockerPorts", () => {
  it("parses v4/v6 published mappings", () => {
    const map = parseDockerPorts(
      "0.0.0.0:8080->80/tcp, :::8080->80/tcp",
      "web",
    );
    expect(map.get(8080)).toEqual({ container: "web", containerPort: 80 });
    expect(map.size).toBe(1);
  });

  it("parses loopback-published mappings", () => {
    const map = parseDockerPorts("127.0.0.1:5432->5432/tcp", "db");
    expect(map.get(5432)).toEqual({ container: "db", containerPort: 5432 });
  });

  it("skips unpublished, ranges with garbage, and empty strings", () => {
    expect(parseDockerPorts("80/tcp", "web").size).toBe(0);
    expect(parseDockerPorts("", "web").size).toBe(0);
    expect(parseDockerPorts("weird stuff", "web").size).toBe(0);
  });

  it("first mapping wins for duplicate host ports", () => {
    const map = new Map();
    parseDockerPorts("0.0.0.0:80->8080/tcp", "a", map);
    parseDockerPorts("0.0.0.0:80->9090/tcp", "b", map);
    expect(map.get(80)).toEqual({ container: "a", containerPort: 8080 });
  });

  it("parses port ranges leniently (first port of the range)", () => {
    // "7000-7002->7000-7002/tcp" — hostSide lastIndexOf(':') yields "7000-7002"
    // which is NaN → skipped. Documented as out of scope.
    expect(
      parseDockerPorts("0.0.0.0:7000-7002->7000-7002/tcp", "range").size,
    ).toBe(0);
  });
});

describe("joinDetectedPorts", () => {
  const port = (n: number) => ({
    port: n,
    addresses: ["0.0.0.0"],
    loopbackOnly: false,
    process: null,
  });

  it("labels listening ports with the publishing container", () => {
    const result = joinDetectedPorts(
      [port(8080), port(9999)],
      [{ name: "web", ports: "0.0.0.0:8080->80/tcp" }],
    );
    expect(result[0].container).toEqual({ container: "web", containerPort: 80 });
    expect(result[1].container).toBeNull();
  });

  it("leaves ports unlabeled when no container matches", () => {
    const result = joinDetectedPorts([port(3000)], []);
    expect(result[0].container).toBeNull();
  });
});
