/**
 * Client half of the server protocol. Correlates request/response by id and fans
 * `evt` frames to per-channel handlers. Transport-agnostic: the caller supplies a
 * `write` sink (the ssh child's stdin) and pumps inbound bytes via `feed`.
 */
import { encodeMessage, LineDecoder, type RpcMessage } from "./protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type ChannelHandler = (event: string, data: unknown) => void;

export class RpcClient {
  #nextId = 1;
  #nextChannel = 1;
  #pending = new Map<number, Pending>();
  #channels = new Map<number, ChannelHandler>();
  #decoder = new LineDecoder();
  #closed = false;

  constructor(private readonly write: (frame: string) => void) {}

  feed(chunk: string | Buffer): void {
    for (const msg of this.#decoder.push(chunk)) this.#handle(msg);
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.#closed) return Promise.reject(new Error("ssh server connection closed"));
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.write(encodeMessage({ t: "req", id, method, params }));
    });
  }

  /** Allocate a streaming channel id; pass it to the server inside a call's params. */
  openChannel(handler: ChannelHandler): number {
    const id = this.#nextChannel++;
    this.#channels.set(id, handler);
    return id;
  }

  closeChannel(id: number): void {
    this.#channels.delete(id);
  }

  rejectAll(error: Error): void {
    this.#closed = true;
    for (const p of this.#pending.values()) p.reject(error);
    this.#pending.clear();
    for (const h of this.#channels.values()) h("closed", { error: error.message });
    this.#channels.clear();
  }

  #handle(msg: RpcMessage): void {
    if (msg.t === "res") {
      const pending = this.#pending.get(msg.id);
      if (!pending) return;
      this.#pending.delete(msg.id);
      if (msg.ok) pending.resolve(msg.result);
      else pending.reject(new Error(msg.error));
    } else if (msg.t === "evt") {
      this.#channels.get(msg.channel)?.(msg.event, msg.data);
    }
  }
}
