/**
 * Owned by the ssh-native provider's deployed remote daemon.
 * Remote port discovery: which TCP ports are LISTENing on this host. Feeds
 * the client's Ports panel ("Detected on server" + one-click forward).
 *
 * Strategy per platform:
 * - Linux: `ss -tlnHp` (process names visible for own processes; others null),
 *   falling back to parsing /proc/net/tcp{,6} (dependency-free, no names).
 * - macOS: `lsof -nP -iTCP -sTCP:LISTEN`.
 *
 * All parsers are pure text → struct functions so they unit-test without a
 * remote. Results are aggregated per port (v4/v6 merged); `loopbackOnly`
 * flags ports reachable ONLY via forwarding — the panel's key signal.
 */
import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";

export type ListeningPort = {
  port: number;
  addresses: string[];
  loopbackOnly: boolean;
  process: string | null;
};

export type RawListener = {
  address: string;
  port: number;
  process: string | null;
};

const MAX_PORTS = 200;

type Run = { stdout: string; code: number | null; spawnError: boolean };

function run(bin: string, args: string[], maxBytes = 4 * 1024 * 1024): Promise<Run> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { env: { ...process.env, LC_ALL: "C" } });
    } catch {
      resolve({ stdout: "", code: null, spawnError: true });
      return;
    }
    let stdout = "";
    let total = 0;
    child.stdout?.on("data", (c: Buffer) => {
      total += c.length;
      if (total <= maxBytes) stdout += c.toString("utf8");
    });
    child.on("error", () => resolve({ stdout, code: null, spawnError: true }));
    child.on("close", (code) => resolve({ stdout, code, spawnError: false }));
  });
}

/** Split `addr:port` at the LAST colon; strips IPv6 brackets. */
function splitHostPort(s: string): { address: string; port: number } | null {
  const i = s.lastIndexOf(":");
  if (i < 0) return null;
  const port = Number(s.slice(i + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  let address = s.slice(0, i);
  if (address.startsWith("[") && address.endsWith("]")) {
    address = address.slice(1, -1);
  }
  return { address, port };
}

/** `ss -tlnHp` lines: `LISTEN 0 4096 127.0.0.1:6379 0.0.0.0:* users:(("redis",pid=1,fd=6))` */
export function parseSsOutput(text: string): RawListener[] {
  const out: RawListener[] = [];
  for (const line of text.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    // With -H the state column is first; tolerate a stray header anyway.
    if (cols[0] !== "LISTEN") continue;
    const local = splitHostPort(cols[3]);
    if (!local) continue;
    const m = line.match(/users:\(\("([^"]+)"/);
    out.push({ ...local, process: m ? m[1] : null });
  }
  return out;
}

/** Decode the kernel's little-endian hex IPv4 ("0100007F" → "127.0.0.1"). */
function decodeProcV4(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < 8; i += 2) bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return bytes.reverse().join(".");
}

const LISTEN_STATE = "0A";

/**
 * /proc/net/tcp{,6}: cols `sl local_address rem_address st …`; LISTEN = 0A.
 * v6 addresses are only classified (any/loopback/other), not fully decoded.
 */
export function parseProcNetTcp(text: string, v6: boolean): RawListener[] {
  const out: RawListener[] = [];
  for (const line of text.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4 || cols[3] !== LISTEN_STATE) continue;
    const [addrHex, portHex] = cols[1].split(":");
    if (!addrHex || !portHex) continue;
    const port = Number.parseInt(portHex, 16);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    let address: string;
    if (!v6) {
      address = decodeProcV4(addrHex);
    } else if (/^0+$/.test(addrHex)) {
      address = "::";
    } else if (addrHex === "00000000000000000000000001000000") {
      address = "::1";
    } else {
      address = `[${addrHex}]`; // opaque non-loopback v6 — enough to classify
    }
    out.push({ address, port, process: null });
  }
  return out;
}

/** `lsof -nP -iTCP -sTCP:LISTEN`: `node 456 kevin 23u IPv6 0x0 0t0 TCP *:3000 (LISTEN)` */
export function parseLsofOutput(text: string): RawListener[] {
  const out: RawListener[] = [];
  for (const line of text.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9 || cols[cols.length - 1] !== "(LISTEN)") continue;
    const local = splitHostPort(cols[cols.length - 2]);
    if (!local) continue;
    out.push({ ...local, process: cols[0] });
  }
  return out;
}

function isLoopback(address: string): boolean {
  return (
    address.startsWith("127.") ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address.startsWith("::ffff:127.")
  );
}

/** Merge v4/v6 listeners per port; loopbackOnly iff EVERY bind is loopback. */
export function aggregate(raw: RawListener[], cap = MAX_PORTS): ListeningPort[] {
  const byPort = new Map<number, ListeningPort>();
  for (const r of raw) {
    const existing = byPort.get(r.port);
    if (!existing) {
      byPort.set(r.port, {
        port: r.port,
        addresses: [r.address],
        loopbackOnly: isLoopback(r.address),
        process: r.process,
      });
      continue;
    }
    if (!existing.addresses.includes(r.address)) {
      existing.addresses.push(r.address);
    }
    existing.loopbackOnly = existing.loopbackOnly && isLoopback(r.address);
    existing.process ??= r.process;
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port).slice(0, cap);
}

async function fromProc(): Promise<RawListener[]> {
  const read = async (file: string, v6: boolean): Promise<RawListener[]> => {
    try {
      return parseProcNetTcp(await fsp.readFile(file, "utf8"), v6);
    } catch {
      return [];
    }
  };
  const [v4, v6] = await Promise.all([
    read("/proc/net/tcp", false),
    read("/proc/net/tcp6", true),
  ]);
  return [...v4, ...v6];
}

export async function listeningPorts(): Promise<ListeningPort[]> {
  if (process.platform === "darwin") {
    const r = await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]);
    return aggregate(parseLsofOutput(r.stdout));
  }
  const ss = await run("ss", ["-tlnHp"]);
  if (!ss.spawnError && ss.code === 0 && ss.stdout.trim() !== "") {
    return aggregate(parseSsOutput(ss.stdout));
  }
  return aggregate(await fromProc());
}
