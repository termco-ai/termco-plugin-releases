/**
 * One-shot `ssh` / `scp` execution for probes, bundle upload, and launching the
 * server. Reuses the generic never-rejecting CLI spawner from the containers
 * module (argv array — never a shell string — bounded output, SIGKILL timeout).
 *
 * CRITICAL: a remote command is passed as a SINGLE argv element (see `runSsh`).
 * ssh concatenates its post-destination args with spaces and hands the result to
 * the remote login shell, so splitting a script into ["sh","-c",script] makes the
 * remote re-parse it (`sh -c mkdir …` → "mkdir: missing operand"). One element =
 * the remote shell runs it verbatim.
 *
 * Auth is delegated to system ssh + `~/.ssh/config` + agent/keys; we force
 * `BatchMode=yes` so a missing key fails fast, and never touch
 * `StrictHostKeyChecking` (host-key verification follows the user's known_hosts).
 */
import { type CliOutput, ok, runCli } from "./cliRunner";
import type { SshTarget } from "./types";

export { type CliOutput, ok };

// Reject anything that could be mistaken for an ssh option / inject into argv.
const SAFE_HOST = /^[A-Za-z0-9][A-Za-z0-9_.@:-]*$/;

export function isSafeHost(value: string): boolean {
  return SAFE_HOST.test(value) && value.length <= 255;
}

export function assertSafeTarget(target: SshTarget): void {
  if (!isSafeHost(target.host)) throw new Error(`unsafe ssh host: ${target.host}`);
  if (target.user && !/^[A-Za-z0-9._-]+$/.test(target.user)) {
    throw new Error(`unsafe ssh user: ${target.user}`);
  }
  if (target.port != null && !(Number.isInteger(target.port) && target.port > 0 && target.port < 65536)) {
    throw new Error(`invalid ssh port: ${target.port}`);
  }
}

const CONNECT_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];

/** `user@host` (config aliases resolve their own user). */
export function destination(target: SshTarget): string {
  return target.user ? `${target.user}@${target.host}` : target.host;
}

/** argv for `ssh [opts] dest [remote…]`. */
export function sshArgs(target: SshTarget, remote: string[], extraOpts: string[] = []): string[] {
  assertSafeTarget(target);
  const args = [...CONNECT_OPTS, ...extraOpts];
  if (target.port) args.push("-p", String(target.port));
  args.push(destination(target), ...remote);
  return args;
}

/** Run a remote command. Pass the whole command as ONE string (see file header). */
export function runSsh(target: SshTarget, remoteCommand: string, timeoutSecs?: number): Promise<CliOutput> {
  return runCli("ssh", sshArgs(target, [remoteCommand]), timeoutSecs);
}

/** Copy a local file to `dest:remotePath` (remote path relative to $HOME). */
export function runScp(
  target: SshTarget,
  localPath: string,
  remotePath: string,
  timeoutSecs?: number,
): Promise<CliOutput> {
  assertSafeTarget(target);
  const args = [...CONNECT_OPTS];
  if (target.port) args.push("-P", String(target.port)); // scp uses -P
  args.push(localPath, `${destination(target)}:${remotePath}`);
  return runCli("scp", args, timeoutSecs);
}
