/**
 * Bring our own Node to the remote (VS Code Server's `localServerDownload`).
 * If the remote has no usable Node, fetch the matching official build on the
 * user's Mac (SHA-256 verified, cached), scp it up, extract under
 * ~/.termco-server/node/<ver>/. Only the Mac needs internet — works on
 * egress-blocked hosts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { fetch } from "undici";
import type { RemoteProbe } from "./probe";
import { ok, runScp, runSsh } from "./runner";
import type { SshTarget } from "./types";

export const NODE_VERSION = "20.18.1";
const MIN_SYSTEM_NODE_MAJOR = 18;

export type NodeTarget = { os: "linux" | "darwin"; arch: "x64" | "arm64" | "armv7l" };

/** Map `uname -s`/`-m` → a Node dist target, or null if unsupported. */
export function mapNodeTarget(unameS: string, unameM: string): NodeTarget | null {
  const os = unameS === "Linux" ? "linux" : unameS === "Darwin" ? "darwin" : null;
  if (!os) return null;
  const m = unameM.toLowerCase();
  const arch =
    m === "x86_64" || m === "amd64"
      ? "x64"
      : m === "aarch64" || m === "arm64"
        ? "arm64"
        : m === "armv7l" || m === "armv6l"
          ? "armv7l"
          : null;
  if (!arch) return null;
  if (os === "darwin" && arch === "armv7l") return null;
  return { os, arch };
}

function majorOf(version: string | null): number {
  const m = version?.match(/^v?(\d+)/);
  return m ? Number(m[1]) : 0;
}
function tarballName(t: NodeTarget): string {
  return `node-v${NODE_VERSION}-${t.os}-${t.arch}.tar.gz`;
}
function distUrl(file: string): string {
  return `https://nodejs.org/dist/v${NODE_VERSION}/${file}`;
}
function remoteNodeDir(home: string): string {
  return `${home}/.termco-server/node/${NODE_VERSION}`;
}
function remoteNodeBin(home: string): string {
  return `${remoteNodeDir(home)}/bin/node`;
}

/** Resolve a usable remote node: pre-installed if new enough, else our bootstrap. */
export async function ensureRemoteNode(target: SshTarget, probe: RemoteProbe): Promise<string> {
  if (probe.nodePath && majorOf(probe.nodeVersion) >= MIN_SYSTEM_NODE_MAJOR) {
    return probe.nodePath;
  }
  if (probe.musl) {
    throw new Error("remote uses musl libc (Alpine); the file/git server needs glibc or macOS");
  }
  const nodeTarget = mapNodeTarget(probe.unameS, probe.unameM);
  if (!nodeTarget) {
    throw new Error(`unsupported remote platform ${probe.unameS}/${probe.unameM} for the server`);
  }
  return bootstrapNode(target, probe.home, nodeTarget);
}

async function bootstrapNode(target: SshTarget, home: string, nodeTarget: NodeTarget): Promise<string> {
  const binPath = remoteNodeBin(home);
  const cached = await runSsh(target, `test -x '${binPath}' && echo ok`);
  if (ok(cached) && cached.stdout.includes("ok")) return binPath;

  const name = tarballName(nodeTarget);
  const localTar = await ensureLocalTarball(name);
  const dir = remoteNodeDir(home);
  const remoteTar = `.termco-server/node/${name}`;

  const mk = await runSsh(target, `mkdir -p '${dir}'`);
  if (!ok(mk)) throw new Error(mk.stderr.trim() || "could not create remote node dir");
  const up = await runScp(target, localTar, remoteTar, 120);
  if (!ok(up)) throw new Error(up.stderr.trim() || "node upload failed");
  const extract = await runSsh(
    target,
    `tar -xzf '${home}/${remoteTar}' -C '${dir}' --strip-components=1 && rm -f '${home}/${remoteTar}'`,
    120,
  );
  if (!ok(extract)) throw new Error(extract.stderr.trim() || "node extract failed");
  const verify = await runSsh(target, `test -x '${binPath}' && echo ok`);
  if (!ok(verify) || !verify.stdout.includes("ok")) throw new Error("bootstrapped node missing after extract");
  return binPath;
}

async function ensureLocalTarball(name: string): Promise<string> {
  const cacheDir = join(app.getPath("userData"), "node-cache", NODE_VERSION);
  mkdirSync(cacheDir, { recursive: true });
  const dest = join(cacheDir, name);
  if (existsSync(dest)) return dest;

  const res = await fetch(distUrl(name));
  if (!res.ok) throw new Error(`could not download ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const expected = await fetchExpectedSha(name);
  if (expected) {
    const actual = createHash("sha256").update(buf).digest("hex");
    if (actual !== expected) throw new Error(`node download checksum mismatch for ${name}`);
  }
  await writeFile(dest, buf);
  return dest;
}

async function fetchExpectedSha(name: string): Promise<string | null> {
  try {
    const res = await fetch(distUrl("SHASUMS256.txt"));
    if (!res.ok) return null;
    for (const line of (await res.text()).split("\n")) {
      const [sha, file] = line.trim().split(/\s+/);
      if (file === name) return sha;
    }
  } catch {
    // SHASUMS unreachable — tarball already came over authenticated HTTPS
  }
  return null;
}
