// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ spawn: vi.fn(), exit: (_event: { exitCode: number }) => {} }));
vi.mock("node-pty", () => ({ spawn: mock.spawn }));
import { close, closeAll, configurePtySessions, open } from "./session";

afterEach(() => {
  closeAll();
  configurePtySessions(null);
  vi.clearAllMocks();
});
describe("SSH terminal authentication", () => {
  function setup() {
    configurePtySessions({ workspace: {} as never, events: { emit: vi.fn() } as never });
    mock.spawn.mockImplementation(() => ({
      pid: 123,
      onData: vi.fn(),
      onExit: (callback: typeof mock.exit) => {
        mock.exit = callback;
      },
      kill: vi.fn(),
    }));
    return {
      env: { SSH_ASKPASS: "/fixture/askpass", SSH_ASKPASS_REQUIRE: "force", TERM: "dumb" },
      close: vi.fn(),
    };
  }
  it("uses shared askpass credentials and releases them when a terminal closes", () => {
    const sshAuth = setup();
    const id = open(
      {
        cols: 80,
        rows: 24,
        workspace: { kind: "ssh", connectionId: "host", host: "host" },
        sshAuth,
      },
      vi.fn(),
      vi.fn(),
    );
    expect(mock.spawn).toHaveBeenCalledWith(
      "ssh",
      expect.arrayContaining(["BatchMode=no"]),
      expect.objectContaining({
        env: expect.objectContaining({
          SSH_ASKPASS: "/fixture/askpass",
          SSH_ASKPASS_REQUIRE: "force",
          TERM: "xterm-256color",
        }),
      }),
    );
    close(id);
    expect(sshAuth.close).toHaveBeenCalledOnce();
    mock.exit({ exitCode: 0 });
  });
  it("releases authentication if the terminal fails to spawn", () => {
    const sshAuth = setup();
    mock.spawn.mockImplementationOnce(() => {
      throw new Error("spawn failed");
    });
    expect(() =>
      open(
        {
          cols: 80,
          rows: 24,
          workspace: { kind: "ssh", connectionId: "host", host: "host" },
          sshAuth,
        },
        vi.fn(),
        vi.fn(),
      ),
    ).toThrow("spawn failed");
    expect(sshAuth.close).toHaveBeenCalledOnce();
  });
});
