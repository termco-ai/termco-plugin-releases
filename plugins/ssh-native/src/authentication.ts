import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SecretsCapability } from "@termco/storage-base";
import type { SshAuthPrompt, SshAuthResponse, SshTarget } from "@termco/ssh-base";
import { pluginAssetPath } from "./assets";

export const SSH_AUTH_CHANGED = "ssh:authentication-changed";
const SECRET_SERVICE = "termco.ssh";
const PROMPT_TIMEOUT = 5 * 60_000;

interface Session {
  target: SshTarget;
  seen: Set<string>;
  waiting: boolean;
  cancelled: boolean;
}
interface Pending {
  prompt: SshAuthPrompt;
  account: string;
  sessions: Set<Session>;
  resolve(value: string | null): void;
  promise: Promise<string | null>;
}

/** The helper receives only an opaque, per-process token. Secrets travel over
 * loopback directly to askpass, never through argv, environment or temp files. */
export async function createSshAuthentication(input: {
  secrets: SecretsCapability;
  changed(): void;
  executable?: string;
}) {
  const sessions = new Map<string, Session>();
  const pending = new Map<string, Pending>();
  const sockets = new Set<Socket>();
  let disposed = false;
  const directory = mkdtempSync(join(tmpdir(), "termco-askpass-"));
  const helper = pluginAssetPath("askpass.cjs");
  const executable = input.executable ?? process.execPath;
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const launcher = join(directory, process.platform === "win32" ? "askpass.cmd" : "askpass");
  writeFileSync(
    launcher,
    process.platform === "win32"
      ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${executable}" "${helper}" %*\r\n`
      : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(executable)} ${quote(helper)} "$@"\n`,
    { mode: 0o700 },
  );

  async function request(session: Session, message: string, hint: string): Promise<string | null> {
    if (disposed || session.cancelled) return null;
    const kind =
      hint === "confirm" || /\(yes\/no(?:\/[^)]*)?\)/i.test(message)
        ? "confirmation"
        : /password|passphrase/i.test(message) && !/verification|one.time|otp/i.test(message)
          ? "password"
          : "response";
    // The OpenSSH prompt distinguishes proxy hosts, accounts and private keys.
    const account = createHash("sha256")
      .update(
        JSON.stringify([
          session.target.host,
          session.target.user ?? "",
          session.target.port ?? 22,
          message,
        ]),
      )
      .digest("hex");
    const retry = session.seen.has(account);
    session.seen.add(account);
    session.waiting = true;
    try {
      const current = pending.get(account);
      if (current) {
        current.sessions.add(session);
        return await current.promise;
      }
      let storageError: string | undefined;
      if (kind === "password") {
        try {
          if (retry) await input.secrets.delete(SECRET_SERVICE, account);
          else {
            const saved = await input.secrets.get(SECRET_SERVICE, account);
            if (saved !== null) return saved;
          }
        } catch {
          storageError = "Saved credentials are unavailable. You can connect without saving.";
        }
      }
      if (disposed || session.cancelled) return null;
      // A concurrent request may have arrived while reading the secret store.
      const shared = pending.get(account);
      if (shared) {
        shared.sessions.add(session);
        return await shared.promise;
      }
      let resolve!: (value: string | null) => void;
      const promise = new Promise<string | null>((done) => {
        resolve = done;
      });
      const entry: Pending = {
        account,
        promise,
        resolve,
        sessions: new Set([session]),
        prompt: {
          id: randomUUID(),
          connectionId: session.target.connectionId,
          message,
          kind,
          retry,
          error: storageError,
        },
      };
      pending.set(account, entry);
      input.changed();
      const timer = setTimeout(() => finish(entry, null), PROMPT_TIMEOUT);
      try {
        return await promise;
      } finally {
        clearTimeout(timer);
      }
    } finally {
      session.waiting = false;
    }
  }

  function finish(entry: Pending, value: string | null) {
    if (pending.get(entry.account) !== entry) return;
    pending.delete(entry.account);
    if (value === null) for (const session of entry.sessions) session.cancelled = true;
    entry.resolve(value);
    input.changed();
  }

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setTimeout(PROMPT_TIMEOUT + 10_000, () => socket.destroy());
    let buffer = "";
    let handled = false;
    socket.on("data", (chunk) => {
      if (handled) return;
      buffer += chunk.toString("utf8");
      if (buffer.length > 16_384) {
        socket.destroy();
        return;
      }
      if (!buffer.includes("\n")) return;
      handled = true;
      void (async () => {
        try {
          const data = JSON.parse(buffer.slice(0, buffer.indexOf("\n")));
          const session = sessions.get(data.token);
          if (!session || typeof data.prompt !== "string") {
            socket.destroy();
            return;
          }
          const value = await request(session, data.prompt, data.hint ?? "");
          socket.end(JSON.stringify({ value }) + "\n");
        } catch {
          socket.end(JSON.stringify({ value: null }) + "\n");
        }
      })();
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  server.on("error", () => {});
  const port = (server.address() as { port: number }).port;

  return {
    prompts: () => [...pending.values()].map((entry) => entry.prompt),
    async respond(id: string, response: SshAuthResponse | null) {
      const entry = [...pending.values()].find((value) => value.prompt.id === id);
      if (!entry) return;
      if (response && (typeof response.value !== "string" || /[\r\n\0]/.test(response.value))) {
        throw new Error("Enter a single-line SSH response.");
      }
      if (response && entry.prompt.kind === "password") {
        if (response.save) {
          try {
            await input.secrets.set(SECRET_SERVICE, entry.account, response.value);
          } catch {
            throw new Error(
              "Could not save the password. Uncheck Save in Termco to connect without saving.",
            );
          }
        } else await input.secrets.delete(SECRET_SERVICE, entry.account).catch(() => {});
      }
      finish(entry, response?.value ?? null);
    },
    open(target: SshTarget) {
      if (disposed) throw new Error("SSH authentication is closed");
      const token = randomBytes(32).toString("hex");
      const session: Session = { target, seen: new Set(), waiting: false, cancelled: false };
      sessions.set(token, session);
      return {
        env: {
          ...process.env,
          LC_ALL: "C",
          SSH_ASKPASS: launcher,
          SSH_ASKPASS_REQUIRE: "force",
          TERMCO_ASKPASS_PORT: String(port),
          TERMCO_ASKPASS_TOKEN: token,
        },
        waiting: () => session.waiting,
        close() {
          sessions.delete(token);
          session.cancelled = true;
          for (const entry of pending.values()) {
            entry.sessions.delete(session);
            if (entry.sessions.size === 0) finish(entry, null);
          }
        },
      };
    },
    cancel(connectionId: string) {
      for (const session of sessions.values()) {
        if (session.target.connectionId !== connectionId) continue;
        session.cancelled = true;
        for (const entry of pending.values()) {
          entry.sessions.delete(session);
          if (entry.sessions.size === 0) finish(entry, null);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of pending.values()) finish(entry, null);
      sessions.clear();
      for (const socket of sockets) socket.destroy();
      server.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export type SshAuthentication = Awaited<ReturnType<typeof createSshAuthentication>>;
let authentication: SshAuthentication | null = null;
export function configureAuthentication(value: SshAuthentication | null) {
  authentication = value;
}
export function sshAuthentication() {
  return authentication;
}
export function openSshAuthentication(target: SshTarget) {
  return authentication?.open(target) ?? { env: process.env, waiting: () => false, close() {} };
}
