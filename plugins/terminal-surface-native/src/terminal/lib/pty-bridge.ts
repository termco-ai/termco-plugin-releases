import { terminalRuntime, type WorkspaceEnv } from "../../runtime";

const textEncoder = new TextEncoder();

export type PtyHandlers = {
  onData: (bytes: Uint8Array) => void;
  onExit?: (code: number) => void;
};

export type PtySession = {
  id: number;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  close: () => Promise<void>;
};

export async function openPty(
  cols: number,
  rows: number,
  handlers: PtyHandlers,
  workspace: WorkspaceEnv,
  cwd?: string,
  blocks?: boolean,
  shell?: string,
): Promise<PtySession> {
  let released = false;
  const releaseHandlers = () => {
    if (released) return;
    released = true;
  };
  const pty = terminalRuntime().pty;
  const id = await pty.open(
    {
      cols,
      rows,
      cwd: cwd ?? null,
      workspace,
      blocks: blocks ?? false,
      shell: shell ?? null,
    },
    {
      onData(message) {
        if (released) return;
        handlers.onData(
          message instanceof Uint8Array
            ? message
            : new Uint8Array(message as ArrayBuffer),
        );
      },
      onExit(message) {
        if (released) return;
        handlers.onExit?.(Number(message));
        releaseHandlers();
      },
    },
  );

  let closed = false;
  return {
    id,
    write: async (data) => pty.write(id, textEncoder.encode(data)),
    resize: async (c, r) => pty.resize(id, c, r),
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        pty.close(id);
      } finally {
        releaseHandlers();
      }
    },
  };
}
