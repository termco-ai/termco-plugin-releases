// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeAll,
  closeAllAndWait,
  configurePtySessions,
  open,
  write,
} from "./session";

afterEach(() => {
  closeAll();
  configurePtySessions(null);
});

describe("PTY native shutdown", () => {
  it("receives every real node-pty exit callback before shutdown continues", async () => {
    configurePtySessions({
      workspace: { authorizeRoot: vi.fn() } as never,
      events: { emit: vi.fn() } as never,
    });
    const onExit = vi.fn();
    const shell = process.platform === "win32"
      ? process.env.ComSpec ?? "cmd.exe"
      : "/bin/sh";
    open({ cols: 80, rows: 24, shell }, vi.fn(), onExit);

    await closeAllAndWait();
    configurePtySessions(null);

    expect(onExit).toHaveBeenCalledOnce();
  });
});

it.skipIf(process.platform === "win32")("forces a real shell that ignores SIGHUP to exit", async () => {
  configurePtySessions({ workspace: { authorizeRoot: vi.fn() } as never, events: { emit: vi.fn() } as never });
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  let output = "";
  const onExit = vi.fn();
  const id = open({ cols: 80, rows: 24, shell: "/bin/sh" }, (chunk) => {
    output += new TextDecoder().decode(chunk as Uint8Array);
    if (output.includes("\r\nREADY\r\n")) ready();
  }, onExit);
  write(id, new TextEncoder().encode("trap '' HUP; printf '\\nREADY\\n'\n"));
  await started;
  await closeAllAndWait();
  expect(onExit).toHaveBeenCalledOnce();
});
