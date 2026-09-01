export type ToolConcurrency = "safe" | "exclusive";

type Entry<T> = {
  readonly concurrency: ToolConcurrency;
  run?: () => Promise<T>;
  commit?: (value: T) => Promise<void>;
  started: boolean;
  ready: boolean;
  value?: T;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  readonly result: Promise<T>;
};

/** Per-session model-order scheduler. Safe bodies may overlap, exclusive
 * bodies form barriers, and terminal commits stay in original call order. */
export class OrderedToolScheduler<T> {
  readonly #entries: Entry<T>[] = [];
  readonly #maxSafeConcurrency: number;
  #runningSafe = 0;
  #exclusiveRunning = false;
  #nextCommit = 0;
  #committing = false;
  #failed: unknown;

  constructor(maxSafeConcurrency: number) {
    this.#maxSafeConcurrency = Math.max(1, Math.floor(maxSafeConcurrency));
  }

  register(concurrency: ToolConcurrency): number {
    if (this.#failed !== undefined) throw this.#failed;
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<T>((onValue, onError) => {
      resolve = onValue;
      reject = onError;
    });
    this.#entries.push({
      concurrency,
      started: false,
      ready: false,
      resolve,
      reject,
      result,
    });
    return this.#entries.length - 1;
  }

  execute(
    order: number,
    run: () => Promise<T>,
    commit: (value: T) => Promise<void>,
  ): Promise<T> {
    const entry = this.#entry(order);
    if (entry.run || entry.ready) {
      throw new Error(`tool call ${order} already has an execution outcome`);
    }
    entry.run = run;
    entry.commit = commit;
    this.#pump();
    return entry.result;
  }

  complete(
    order: number,
    value: T,
    commit: (value: T) => Promise<void>,
  ): Promise<T> {
    const entry = this.#entry(order);
    if (entry.run || entry.ready) {
      throw new Error(`tool call ${order} already has an execution outcome`);
    }
    entry.value = value;
    entry.ready = true;
    entry.commit = commit;
    void this.#commitReady();
    this.#pump();
    return entry.result;
  }

  #entry(order: number): Entry<T> {
    const entry = this.#entries[order];
    if (!entry) throw new Error(`tool call order ${order} is not registered`);
    return entry;
  }

  #pump(): void {
    if (this.#failed !== undefined || this.#exclusiveRunning) return;
    const pending = this.#entries.findIndex((entry) => !entry.started && !entry.ready);
    if (pending < 0) return;
    const first = this.#entries[pending]!;
    if (!first.run) return;
    if (first.concurrency === "exclusive") {
      if (this.#runningSafe > 0) return;
      this.#exclusiveRunning = true;
      this.#start(first, "exclusive");
      return;
    }
    for (let index = pending; index < this.#entries.length; index += 1) {
      if (this.#runningSafe >= this.#maxSafeConcurrency) break;
      const entry = this.#entries[index]!;
      if (entry.started || entry.ready) continue;
      if (entry.concurrency === "exclusive" || !entry.run) break;
      this.#runningSafe += 1;
      this.#start(entry, "safe");
    }
  }

  #start(entry: Entry<T>, concurrency: ToolConcurrency): void {
    entry.started = true;
    void entry.run!().then(
      (value) => {
        entry.value = value;
        entry.ready = true;
        if (concurrency === "safe") this.#runningSafe -= 1;
        else this.#exclusiveRunning = false;
        void this.#commitReady();
        this.#pump();
      },
      (error) => this.#fail(error),
    );
  }

  async #commitReady(): Promise<void> {
    if (this.#committing || this.#failed !== undefined) return;
    this.#committing = true;
    try {
      while (true) {
        const entry = this.#entries[this.#nextCommit];
        if (!entry?.ready || !entry.commit) break;
        await entry.commit(entry.value as T);
        entry.resolve(entry.value as T);
        this.#nextCommit += 1;
      }
    } catch (error) {
      this.#fail(error);
    } finally {
      this.#committing = false;
    }
  }

  #fail(error: unknown): void {
    if (this.#failed !== undefined) return;
    this.#failed = error;
    for (const entry of this.#entries.slice(this.#nextCommit)) entry.reject(error);
  }
}
