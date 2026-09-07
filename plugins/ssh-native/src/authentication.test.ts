// @vitest-environment node
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSshAuthentication, type SshAuthentication } from "./authentication";

let auth: SshAuthentication;
afterEach(() => auth?.dispose());
async function setup() {
  const saved = new Map<string, string>();
  const secrets = {
    get: vi.fn(async (_service: string, key: string) => saved.get(key) ?? null),
    set: vi.fn(async (_service: string, key: string, value: string) => {
      saved.set(key, value);
    }),
    delete: vi.fn(async (_service: string, key: string) => {
      saved.delete(key);
    }),
    getAll: vi.fn(async () => []),
  };
  auth = await createSshAuthentication({ secrets, changed: vi.fn() });
  return secrets;
}
function ask(session: ReturnType<SshAuthentication["open"]>, prompt = "user@host's password:") {
  const child = spawn(session.env.SSH_ASKPASS!, [prompt], { env: session.env });
  let stdout = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  return new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
  });
}
const target = { connectionId: "host", host: "host" };
async function prompt() {
  await vi.waitFor(() => expect(auth.prompts()).toHaveLength(1), { timeout: 5000 });
  return auth.prompts()[0]!;
}

describe("OpenSSH askpass bridge", () => {
  it("rejects helpers without the per-process token", async () => {
    const secrets = await setup();
    const session = auth.open(target);
    const intruder = { ...session, env: { ...session.env, TERMCO_ASKPASS_TOKEN: "invalid" } };
    expect(await ask(intruder)).toEqual({ code: 1, stdout: "" });
    expect(auth.prompts()).toEqual([]);
    expect(secrets.get).not.toHaveBeenCalled();
    session.close();
  });

  it("prompts, saves encrypted-store credentials, and reuses them on reconnect", async () => {
    const secrets = await setup();
    const session = auth.open(target);
    const result = ask(session);
    const request = await prompt();
    expect(request.kind).toBe("password");
    expect(session.waiting()).toBe(true);
    await auth.respond(request.id, { value: "test-password", save: true });
    expect(await result).toEqual({ code: 0, stdout: "test-password\n" });
    expect(secrets.set).toHaveBeenCalledOnce();
    expect(JSON.stringify(session.env)).not.toContain("test-password");
    session.close();
    const reconnect = auth.open(target);
    expect(await ask(reconnect)).toEqual({ code: 0, stdout: "test-password\n" });
    expect(auth.prompts()).toEqual([]);
    reconnect.close();
  });

  it("re-prompts after a rejected saved password and allows cancellation", async () => {
    const secrets = await setup();
    const session = auth.open(target);
    const first = ask(session);
    await auth.respond((await prompt()).id, { value: "old-password", save: true });
    await first;
    session.close();
    const reconnect = auth.open(target);
    await ask(reconnect);
    const retry = ask(reconnect);
    const request = await prompt();
    expect(request.retry).toBe(true);
    expect(secrets.delete).toHaveBeenCalledOnce();
    await auth.respond(request.id, null);
    expect(await retry).toEqual({ code: 1, stdout: "" });
    expect(await ask(reconnect)).toEqual({ code: 1, stdout: "" });
    reconnect.close();
  });

  it("coalesces concurrent requests and never saves host confirmations or MFA responses", async () => {
    const secrets = await setup();
    const one = auth.open(target);
    const two = auth.open(target);
    const first = ask(one, "Verification code:");
    const second = ask(two, "Verification code:");
    const request = await prompt();
    await vi.waitFor(() => expect(one.waiting() && two.waiting()).toBe(true));
    expect(request.kind).toBe("response");
    await auth.respond(request.id, { value: "123456", save: true });
    expect((await first).code).toBe(0);
    expect((await second).code).toBe(0);
    const confirmation = ask(one, "Fingerprint SHA256:example. Continue (yes/no/[fingerprint])?");
    expect((await prompt()).kind).toBe("confirmation");
    await auth.respond(auth.prompts()[0]!.id, { value: "yes", save: true });
    expect((await confirmation).stdout).toBe("yes\n");
    expect(secrets.set).not.toHaveBeenCalled();
    one.close();
    two.close();
  });

  it("leaves the prompt open on save failure and supports connecting without saving", async () => {
    const secrets = await setup();
    secrets.set.mockRejectedValueOnce(new Error("storage unavailable"));
    const session = auth.open(target);
    const result = ask(session);
    const request = await prompt();
    await expect(auth.respond(request.id, { value: "test-password", save: true })).rejects.toThrow(
      "Could not save",
    );
    expect(auth.prompts()).toHaveLength(1);
    await auth.respond(request.id, { value: "test-password", save: false });
    expect((await result).code).toBe(0);
    session.close();
  });

  it("dismisses prompts when the SSH process closes", async () => {
    await setup();
    const session = auth.open(target);
    const result = ask(session);
    await prompt();
    session.close();
    expect((await result).code).toBe(1);
    expect(auth.prompts()).toEqual([]);
  });
});
