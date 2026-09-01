// Behavior test owned by the ssh-native remote daemon.
import { describe, expect, it } from "vitest";
import {
  aggregate,
  parseLsofOutput,
  parseProcNetTcp,
  parseSsOutput,
} from "./net";

describe("parseSsOutput", () => {
  it("parses listeners with and without process info", () => {
    const text = [
      `LISTEN 0      4096         127.0.0.1:6379       0.0.0.0:*    users:(("redis-server",pid=123,fd=6))`,
      `LISTEN 0      511            0.0.0.0:80          0.0.0.0:*`,
      `LISTEN 0      4096             [::1]:6379           [::]:*   users:(("redis-server",pid=123,fd=7))`,
      `LISTEN 0      128                  *:22                *:*`,
      `ESTAB  0      0            10.0.0.5:22        10.0.0.9:50000`,
      ``,
    ].join("\n");
    const raw = parseSsOutput(text);
    expect(raw).toEqual([
      { address: "127.0.0.1", port: 6379, process: "redis-server" },
      { address: "0.0.0.0", port: 80, process: null },
      { address: "::1", port: 6379, process: "redis-server" },
      { address: "*", port: 22, process: null },
    ]);
  });
});

describe("parseProcNetTcp", () => {
  it("decodes little-endian v4 addresses and filters LISTEN", () => {
    const text = [
      "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
      "   0: 0100007F:1538 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345 1",
      "   1: 00000000:0050 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12346 1",
      "   2: 0500000A:0016 0900000A:C350 01 00000000:00000000 00:00000000 00000000     0        0 12347 1",
    ].join("\n");
    expect(parseProcNetTcp(text, false)).toEqual([
      { address: "127.0.0.1", port: 0x1538, process: null },
      { address: "0.0.0.0", port: 80, process: null },
    ]);
  });

  it("classifies v6 loopback and any", () => {
    const text = [
      "  sl  local_address                         rem_address                           st ...",
      "   0: 00000000000000000000000001000000:1F90 00000000000000000000000000000000:0000 0A 0",
      "   1: 00000000000000000000000000000000:0050 00000000000000000000000000000000:0000 0A 0",
    ].join("\n");
    expect(parseProcNetTcp(text, true)).toEqual([
      { address: "::1", port: 8080, process: null },
      { address: "::", port: 80, process: null },
    ]);
  });
});

describe("parseLsofOutput", () => {
  it("parses macOS lsof listeners", () => {
    const text = [
      "COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME",
      "redis-ser 123 kevin    6u  IPv4 0xabc              0t0  TCP 127.0.0.1:6379 (LISTEN)",
      "node      456 kevin   23u  IPv6 0xdef              0t0  TCP *:3000 (LISTEN)",
      "node      456 kevin   24u  IPv4 0xdef              0t0  TCP 10.0.0.5:50001->1.2.3.4:443 (ESTABLISHED)",
    ].join("\n");
    expect(parseLsofOutput(text)).toEqual([
      { address: "127.0.0.1", port: 6379, process: "redis-ser" },
      { address: "*", port: 3000, process: "node" },
    ]);
  });
});

describe("aggregate", () => {
  it("merges v4/v6 per port and derives loopbackOnly", () => {
    const ports = aggregate([
      { address: "127.0.0.1", port: 6379, process: null },
      { address: "::1", port: 6379, process: "redis-server" },
      { address: "0.0.0.0", port: 80, process: "nginx" },
      { address: "127.0.0.1", port: 80, process: null },
    ]);
    expect(ports).toEqual([
      {
        port: 80,
        addresses: ["0.0.0.0", "127.0.0.1"],
        loopbackOnly: false,
        process: "nginx",
      },
      {
        port: 6379,
        addresses: ["127.0.0.1", "::1"],
        loopbackOnly: true,
        process: "redis-server",
      },
    ]);
  });

  it("treats wildcard binds as non-loopback and caps the list", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      address: "*",
      port: 1000 + i,
      process: null,
    }));
    const ports = aggregate(many);
    expect(ports).toHaveLength(200);
    expect(ports[0].loopbackOnly).toBe(false);
  });
});
