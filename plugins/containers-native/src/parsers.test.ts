import { describe, expect, it } from "vitest";
import { parseAppleList } from "./apple";
import { parseDockerList, parseDockerStats, parsePercent } from "./docker";
import { parsePodmanList, parsePodmanStats } from "./podman";

describe("parseDockerList", () => {
  it("parses line-delimited docker ps JSON", () => {
    const stdout = [
      JSON.stringify({
        ID: "abc123456789",
        Names: "web",
        Image: "nginx:latest",
        State: "running",
        Status: "Up 3 hours",
        Ports: "0.0.0.0:8080->80/tcp",
        CreatedAt: "2026-07-01 12:00:00 +0000 UTC",
      }),
      JSON.stringify({
        ID: "def987654321",
        Names: "db,db-alias",
        Image: "postgres:16",
        State: "exited",
        Status: "Exited (0) 2 hours ago",
        Ports: "",
        CreatedAt: "2026-07-01 10:00:00 +0000 UTC",
      }),
    ].join("\n");

    const rows = parseDockerList(stdout);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "abc123456789",
      runtime: "docker",
      name: "web",
      image: "nginx:latest",
      state: "running",
      ports: "0.0.0.0:8080->80/tcp",
    });
    // Comma-separated Names -> first name only.
    expect(rows[1].name).toBe("db");
    expect(rows[1].state).toBe("exited");
  });

  it("skips blank and malformed lines", () => {
    const stdout = ['not json', "", JSON.stringify({ ID: "x1", Names: "n" })].join(
      "\n",
    );
    const rows = parseDockerList(stdout);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("x1");
  });

  it("returns [] for empty output", () => {
    expect(parseDockerList("")).toEqual([]);
  });
});

describe("parsePodmanList", () => {
  it("parses the JSON array, array Names, and structured Ports", () => {
    const stdout = JSON.stringify([
      {
        Id: "a".repeat(64),
        Names: ["api"],
        Image: "docker.io/library/redis:7",
        State: "running",
        Status: "Up 5 minutes",
        Ports: [
          { host_ip: "0.0.0.0", host_port: 6379, container_port: 6379, protocol: "tcp" },
        ],
        CreatedAt: "2 hours ago",
      },
      {
        Id: "b".repeat(64),
        Names: ["worker"],
        Image: "busybox",
        State: "exited",
        Status: "Exited (0)",
        Ports: null,
        Created: 1720000000,
      },
    ]);

    const rows = parsePodmanList(stdout);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "a".repeat(12),
      runtime: "podman",
      name: "api",
      state: "running",
      ports: "0.0.0.0:6379->6379/tcp",
    });
    expect(rows[1].ports).toBe("");
    expect(rows[1].created_at).toBe("1720000000");
  });

  it("returns [] for non-array or empty output", () => {
    expect(parsePodmanList("")).toEqual([]);
    expect(parsePodmanList("{}")).toEqual([]);
    expect(parsePodmanList("garbage")).toEqual([]);
  });
});

describe("parseAppleList", () => {
  it("parses configuration id + image reference", () => {
    const stdout = JSON.stringify([
      {
        status: "running",
        configuration: {
          id: "my-app",
          image: { reference: "docker.io/library/nginx:latest" },
        },
      },
      {
        status: "stopped",
        configuration: { id: "cache", image: "redis:7" },
      },
    ]);

    const rows = parseAppleList(stdout);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "my-app",
      runtime: "apple",
      name: "my-app",
      image: "docker.io/library/nginx:latest",
      state: "running",
      status: "Running",
    });
    // image can also be a bare string reference.
    expect(rows[1].image).toBe("redis:7");
    expect(rows[1].state).toBe("stopped");
  });

  it("returns [] for empty or non-array output", () => {
    expect(parseAppleList("")).toEqual([]);
    expect(parseAppleList("{}")).toEqual([]);
  });
});

describe("parsePercent", () => {
  it("strips % and parses; NaN → 0", () => {
    expect(parsePercent("12.34%")).toBe(12.34);
    expect(parsePercent("0.00%")).toBe(0);
    expect(parsePercent(undefined)).toBe(0);
    expect(parsePercent("--")).toBe(0);
  });
});

describe("parseDockerStats", () => {
  it("parses line-delimited stats JSON incl. net/block/pids", () => {
    const stdout = [
      JSON.stringify({
        ID: "abc123",
        Name: "web",
        CPUPerc: "12.34%",
        MemUsage: "25.6MiB / 7.6GiB",
        MemPerc: "0.33%",
        NetIO: "1.2MB / 3.4MB",
        BlockIO: "0B / 4.1kB",
        PIDs: "7",
      }),
      JSON.stringify({
        ID: "def456",
        Name: "db",
        CPUPerc: "0.00%",
        MemUsage: "10MiB / 7.6GiB",
        MemPerc: "0.13%",
      }),
      "",
    ].join("\n");
    expect(parseDockerStats(stdout)).toEqual([
      {
        id: "abc123",
        name: "web",
        cpuPerc: 12.34,
        memUsage: "25.6MiB / 7.6GiB",
        memPerc: 0.33,
        netIO: "1.2MB / 3.4MB",
        blockIO: "0B / 4.1kB",
        pids: 7,
      },
      {
        id: "def456",
        name: "db",
        cpuPerc: 0,
        memUsage: "10MiB / 7.6GiB",
        memPerc: 0.13,
        netIO: "",
        blockIO: "",
        pids: 0,
      },
    ]);
  });

  it("skips malformed lines and rows without an id", () => {
    const stdout = ["not json", JSON.stringify({ Name: "x" }), ""].join("\n");
    expect(parseDockerStats(stdout)).toEqual([]);
  });
});

describe("parsePodmanStats", () => {
  it("parses the JSON array, tolerating CPU/CPUPerc key variants", () => {
    const stdout = JSON.stringify([
      {
        ContainerID: "aaaaaaaaaaaa1111",
        Name: "svc",
        CPU: "5.00%",
        MemUsage: "12MB / 4GB",
        MemPerc: "0.30%",
        NetIO: "500kB / 1MB",
        PIDS: 3,
      },
    ]);
    expect(parsePodmanStats(stdout)).toEqual([
      {
        id: "aaaaaaaaaaaa",
        name: "svc",
        cpuPerc: 5,
        memUsage: "12MB / 4GB",
        memPerc: 0.3,
        netIO: "500kB / 1MB",
        blockIO: "",
        pids: 3,
      },
    ]);
  });

  it("returns [] for empty or non-array output", () => {
    expect(parsePodmanStats("")).toEqual([]);
    expect(parsePodmanStats("{}")).toEqual([]);
  });
});
