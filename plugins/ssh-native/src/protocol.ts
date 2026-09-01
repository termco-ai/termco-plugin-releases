/**
 * Wire protocol between the Electron main process (client) and the remote
 * Termco Server, multiplexed over the ssh process's stdio.
 *
 * Newline-delimited JSON: one message per line. Request/response correlate by
 * `id`; streaming results (pty output, grep hits, watch events) push `evt`
 * messages tagged with a client-allocated `channel`. Binary payloads (file
 * bytes, pty output) are base64 in a JSON field.
 *
 * Imported by BOTH the electron build and the agent bundle — keep dependency-free
 * (only `Buffer`).
 */

export type RpcRequest = { t: "req"; id: number; method: string; params?: unknown };
export type RpcResponse =
  | { t: "res"; id: number; ok: true; result?: unknown }
  | { t: "res"; id: number; ok: false; error: string };
export type RpcEvent = { t: "evt"; channel: number; event: string; data?: unknown };
export type RpcMessage = RpcRequest | RpcResponse | RpcEvent;

export function encodeMessage(m: RpcMessage): string {
  return `${JSON.stringify(m)}\n`;
}

/** Incremental newline framer; malformed lines dropped so one bad frame can't kill the stream. */
export class LineDecoder {
  #buf = "";

  push(chunk: string | Buffer): RpcMessage[] {
    this.#buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const out: RpcMessage[] = [];
    let idx: number;
    while ((idx = this.#buf.indexOf("\n")) >= 0) {
      const line = this.#buf.slice(0, idx);
      this.#buf = this.#buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as RpcMessage);
      } catch {
        // ignore corrupt/partial frame
      }
    }
    return out;
  }
}

export const b64 = {
  encode: (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64"),
  decode: (text: string): Buffer => Buffer.from(text, "base64"),
};
