import { describe, expect, it } from "vitest";
import { emptyDetail, parseInspect } from "./inspectParse";
import { parsePublishedPorts } from "./portsParse";

describe("parseInspect", () => {
  const json = JSON.stringify([
    {
      Id: "sha256:abcdef0123456789aaaa",
      Image: "sha256:img0011223344",
      Created: "2024-05-01T12:34:56.789Z",
      Platform: "linux/arm64",
      RestartCount: 2,
      Config: {
        Image: "nginx:1.27",
        Entrypoint: ["/docker-entrypoint.sh"],
        Cmd: ["nginx", "-g", "daemon off;"],
        WorkingDir: "/app",
        User: "web",
        Env: [
          "PATH=/usr/local/bin:/usr/bin",
          "DB_PASSWORD=hunter2secret",
          "API_TOKEN=abc",
          "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF12",
          "NODE_ENV=production",
        ],
        Labels: { "com.docker.compose.project": "web", tier: "frontend" },
      },
      HostConfig: {
        RestartPolicy: { Name: "unless-stopped" },
        Memory: 536870912,
        NanoCpus: 2000000000,
        PidsLimit: 100,
      },
      NetworkSettings: {
        Ports: {
          "80/tcp": [
            { HostIp: "0.0.0.0", HostPort: "8080" },
            { HostIp: "::", HostPort: "8080" },
          ],
          "443/tcp": null,
        },
        Networks: {
          bridge: {
            IPAddress: "172.17.0.2",
            Gateway: "172.17.0.1",
            MacAddress: "02:42:ac:11:00:02",
          },
        },
      },
      Mounts: [
        { Type: "bind", Source: "/data", Destination: "/var/www", RW: true },
        { Type: "volume", Name: "cache", Destination: "/cache", RW: false },
      ],
      State: {
        Health: {
          Status: "healthy",
          FailingStreak: 0,
          Log: [{ Output: "ok\n" }, { Output: "still ok\n" }],
        },
      },
    },
  ]);

  it("parses identity", () => {
    const d = parseInspect(json);
    expect(d.identity).toMatchObject({
      shortId: "abcdef012345",
      imageRef: "nginx:1.27",
      imageSha: "img0011223344".slice(0, 12),
      created: "2024-05-01 12:34:56",
      command: "/docker-entrypoint.sh nginx -g daemon off;",
      workingDir: "/app",
      user: "web",
      platform: "linux/arm64",
      restartPolicy: "unless-stopped",
      restartCount: 2,
    });
  });

  it("flags secret env by key and by entropy, leaves plain env visible", () => {
    const { env } = parseInspect(json);
    const by = Object.fromEntries(env.map((e) => [e.key, e]));
    expect(by.PATH.secret).toBe(false);
    expect(by.NODE_ENV.secret).toBe(false);
    expect(by.DB_PASSWORD.secret).toBe(true); // key match
    expect(by.API_TOKEN.secret).toBe(true); // key match
    expect(by.AWS_ACCESS_KEY_ID.secret).toBe(true); // key match
    expect(by.DB_PASSWORD.value).toBe("hunter2secret"); // raw value preserved
  });

  it("parses labels, networks, mounts (rw/ro), health and limits", () => {
    const d = parseInspect(json);
    expect(d.labels).toContainEqual({
      key: "com.docker.compose.project",
      value: "web",
    });
    expect(d.networks).toEqual([
      {
        name: "bridge",
        ip: "172.17.0.2",
        gateway: "172.17.0.1",
        mac: "02:42:ac:11:00:02",
      },
    ]);
    expect(d.mounts).toEqual([
      { type: "bind", src: "/data", dst: "/var/www", rw: true },
      { type: "volume", src: "cache", dst: "/cache", rw: false },
    ]);
    expect(d.health).toEqual({
      status: "healthy",
      failingStreak: 0,
      lastOutput: "still ok",
    });
    expect(d.limits).toEqual({
      memBytes: 536870912,
      nanoCpus: 2000000000,
      pids: 100,
    });
  });

  it("parses published + exposed ports with host ports (v4/v6 deduped)", () => {
    const d = parseInspect(json);
    expect(d.ports).toEqual([
      { label: "8080→80/tcp", hostPort: 8080, containerPort: 80, proto: "tcp" },
      { label: "443/tcp", hostPort: null, containerPort: 443, proto: "tcp" },
    ]);
  });

  it("returns empty detail for broken/empty JSON", () => {
    expect(parseInspect("not json")).toEqual(emptyDetail());
    expect(parseInspect("[]")).toEqual(emptyDetail());
  });
});

describe("parsePublishedPorts", () => {
  it("keeps published host ports, deduped, with compact labels", () => {
    const chips = parsePublishedPorts(
      "0.0.0.0:8080->80/tcp, :::8080->80/tcp, 127.0.0.1:5432->5432/tcp",
    );
    expect(chips).toEqual([
      { hostPort: 8080, label: "8080→80" },
      { hostPort: 5432, label: "5432" },
    ]);
  });

  it("skips unpublished/exposed and malformed entries", () => {
    expect(parsePublishedPorts("80/tcp")).toEqual([]);
    expect(parsePublishedPorts("")).toEqual([]);
  });
});
