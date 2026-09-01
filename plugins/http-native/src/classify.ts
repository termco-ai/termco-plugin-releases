/**
 * SSRF guard for the AI HTTP proxy.
 * Classifies resolved IPs, blocks cloud-metadata + private/loopback (unless
 * opted in), and pins to exactly the resolved addresses (defeats DNS rebinding).
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export type IpKind = "public" | "private" | "loopback" | "blockedMetadata";

export function isBlockedHostName(host: string): boolean {
  const h = host.toLowerCase();
  return h === "metadata.google.internal" || h === "metadata" || h === "metadata.azure.com";
}

function parseIpv4(s: string): number[] | null {
  if (isIP(s) !== 4) return null;
  return s.split(".").map((o) => Number.parseInt(o, 10));
}

function expandIpv6(input: string): number[] | null {
  if (isIP(input) !== 6) return null;
  let str = input.split("%")[0];
  // Convert a trailing IPv4 (::ffff:1.2.3.4) into two hextets.
  const m = str.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const o = m[2].split(".").map(Number);
    str = `${m[1]}${(((o[0] << 8) | o[1]) >>> 0).toString(16)}:${(((o[2] << 8) | o[3]) >>> 0).toString(16)}`;
  }
  const halves = str.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 ? (halves[1] ? halves[1].split(":") : []) : null;
  let segs: string[];
  if (tail === null) {
    segs = head;
  } else {
    const missing = 8 - head.length - tail.length;
    segs = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail];
  }
  if (segs.length !== 8) return null;
  return segs.map((h) => Number.parseInt(h || "0", 16));
}

export function ipKind(ip: string): IpKind {
  const v4 = parseIpv4(ip);
  if (v4) {
    const o = v4;
    if (o[0] === 169 && o[1] === 254) return "blockedMetadata"; // link-local
    const isLoopback = o[0] === 127;
    const isUnspecified = o[0] === 0 && o[1] === 0 && o[2] === 0 && o[3] === 0;
    const isBroadcast = o[0] === 255 && o[1] === 255 && o[2] === 255 && o[3] === 255;
    const isMulticast = o[0] >= 224 && o[0] <= 239;
    if (isLoopback || isUnspecified || isBroadcast || isMulticast) return "loopback";
    if (
      o[0] === 10 ||
      (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
      (o[0] === 192 && o[1] === 168) ||
      (o[0] === 100 && o[1] >= 64 && o[1] <= 127) ||
      (o[0] === 198 && (o[1] === 18 || o[1] === 19))
    ) {
      return "private";
    }
    return "public";
  }

  const segs = expandIpv6(ip);
  if (segs) {
    const isUnspecified = segs.every((s) => s === 0);
    const isLoopback = segs.slice(0, 7).every((s) => s === 0) && segs[7] === 1;
    const isMulticast = (segs[0] & 0xff00) === 0xff00;
    if (isLoopback || isUnspecified || isMulticast) return "loopback";
    if (segs[0] === 0xfd00 && segs[1] === 0xec2) return "blockedMetadata";
    if ((segs[0] & 0xffc0) === 0xfe80) return "blockedMetadata"; // fe80::/10
    if ((segs[0] & 0xfe00) === 0xfc00) return "private"; // fc00::/7
    return "public";
  }
  return "public";
}

async function resolveAndClassify(host: string): Promise<[IpKind, string[]]> {
  if (isIP(host) !== 0) {
    return [ipKind(host), [host]];
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch (e) {
    throw new Error(`dns: ${(e as Error).message}`);
  }
  if (addrs.length === 0) throw new Error("dns: no addresses");
  let worst: IpKind = "public";
  for (const { address } of addrs) {
    const k = ipKind(address);
    if (k === "blockedMetadata" || worst === "blockedMetadata") worst = "blockedMetadata";
    else if (worst === "public") worst = k;
    // else keep the existing non-public worst
  }
  return [worst, addrs.map((a) => a.address)];
}

export function validateUrl(url: string, _allowPrivate: boolean): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`invalid url: ${(e as Error).message}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`scheme not allowed: ${parsed.protocol.replace(":", "")}`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("userinfo in url is not allowed");
  }
  const host = parsed.hostname;
  if (!host) throw new Error("missing host");
  if (isBlockedHostName(host)) throw new Error(`host not allowed: ${host}`);
  return parsed;
}

export async function classifyAndCollectSafeIps(
  host: string,
  allowPrivate: boolean,
): Promise<string[]> {
  const [worst, ips] = await resolveAndClassify(host);
  if (worst === "blockedMetadata") throw new Error(`host not allowed: ${host}`);
  if ((worst === "loopback" || worst === "private") && !allowPrivate) {
    throw new Error(
      `host ${host} resolves to a private/loopback address; this endpoint requires explicit opt-in`,
    );
  }
  const safe = ips.filter((ip) => {
    const k = ipKind(ip);
    if (k === "blockedMetadata") return false;
    if (k === "loopback" || k === "private") return allowPrivate;
    return true;
  });
  if (safe.length === 0) throw new Error(`host ${host}: no safe IPs`);
  return safe;
}
