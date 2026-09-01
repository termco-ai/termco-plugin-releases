import {
  RetryId,
  type JsonObject,
  type RequestId,
  type SessionHistoryCapability,
  type SessionId,
} from "@termco/session-base";

type FailureRecord = {
  readonly name?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
  readonly status?: unknown;
  readonly statusCode?: unknown;
  readonly retryAfterMs?: unknown;
  readonly response?: { readonly status?: unknown; readonly headers?: unknown };
};

class InferenceStreamCommittedFailure extends Error {
  readonly code: string | undefined;

  constructor(error: unknown) {
    const record = failureRecord(error);
    super(typeof record.message === "string" ? record.message : String(error));
    this.name = typeof record.name === "string" ? record.name : "ModelStreamError";
    this.code = typeof record.code === "string" ? record.code : undefined;
  }
}

function failureRecord(error: unknown): FailureRecord {
  return error && typeof error === "object" ? error as FailureRecord : {};
}

function structuredFailure(error: unknown): JsonObject {
  const record = failureRecord(error);
  const status = [record.statusCode, record.status, record.response?.status]
    .find((value) => typeof value === "number");
  return {
    name: typeof record.name === "string" ? record.name : "ModelRequestError",
    code: typeof record.code === "string" ? record.code : "MODEL_REQUEST_FAILED",
    message: typeof record.message === "string" ? record.message : String(error),
    ...(typeof status === "number" ? { status } : {}),
  };
}

export class InferenceRequestFailure extends Error {
  readonly attempt: number;
  readonly cancelled: boolean;
  readonly code: string | undefined;
  readonly originalError: unknown;

  constructor(error: unknown, attempt: number, cancelled: boolean) {
    const record = failureRecord(error);
    super(typeof record.message === "string" ? record.message : String(error));
    this.name = typeof record.name === "string" ? record.name : "ModelRequestError";
    this.attempt = attempt;
    this.cancelled = cancelled;
    this.code = typeof record.code === "string" ? record.code : undefined;
    this.originalError = error;
  }
}

export function isInferenceRequestFailure(
  error: unknown,
): error is InferenceRequestFailure {
  return error instanceof InferenceRequestFailure;
}

export function isRetryableInferenceFailure(error: unknown): boolean {
  if (error instanceof InferenceStreamCommittedFailure) return false;
  const record = failureRecord(error);
  const status = [record.statusCode, record.status, record.response?.status]
    .find((value) => typeof value === "number");
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 425 ||
      status === 429 || status >= 500;
  }
  return new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
  ]).has(String(record.code ?? ""));
}

function retryAfterHeader(error: unknown): string | undefined {
  const headers = failureRecord(error).response?.headers;
  if (!headers || typeof headers !== "object") return undefined;
  const getter = (headers as { readonly get?: unknown }).get;
  if (typeof getter === "function") {
    const value = getter.call(headers, "retry-after") as unknown;
    return typeof value === "string" ? value : undefined;
  }
  const record = headers as Record<string, unknown>;
  const entry = Object.entries(record).find(
    ([name]) => name.toLowerCase() === "retry-after",
  )?.[1];
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0];
  return undefined;
}

function retryDelay(
  error: unknown,
  attempt: number,
  maximum: number,
  now: number,
): number {
  const explicit = failureRecord(error).retryAfterMs;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return Math.min(Math.floor(explicit), maximum);
  }
  const header = retryAfterHeader(error)?.trim();
  if (header) {
    const seconds = Number(header);
    const delay = Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(header) - now;
    if (Number.isFinite(delay) && delay >= 0) {
      return Math.min(Math.floor(delay), maximum);
    }
  }
  return Math.min(250 * 2 ** Math.max(0, attempt - 1), maximum);
}

function defaultWait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason ?? new DOMException("Request retry cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

const retryPreludeTypes = new Set([
  "start",
  "start-step",
  "response-metadata",
  "text-start",
  "reasoning-start",
  "tool-input-start",
  "tool-input-delta",
  "tool-input-end",
]);

function streamPart(value: unknown): { readonly type?: unknown; readonly error?: unknown } {
  return value && typeof value === "object"
    ? value as { readonly type?: unknown; readonly error?: unknown }
    : {};
}

/** Runs one current inference request with bounded, durably logged retries. */
export async function executeInferenceWithRetry<T>(input: {
  readonly history: Pick<SessionHistoryCapability, "append">;
  readonly sessionId: SessionId;
  readonly requestId: RequestId;
  readonly invoke: (attempt: number) => Promise<T>;
  readonly signal?: AbortSignal;
  readonly maxAttempts?: number;
  readonly maxDelayMs?: number;
  readonly wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  readonly nextRetryId?: () => string;
  readonly now?: () => number;
}): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? 3));
  const maxDelayMs = Math.max(0, Math.floor(input.maxDelayMs ?? 5_000));
  const wait = input.wait ?? defaultWait;
  const nextRetryId = input.nextRetryId ?? (() => crypto.randomUUID());
  const now = input.now ?? Date.now;
  let attempt = 1;
  while (true) {
    try {
      return await input.invoke(attempt);
    } catch (error) {
      if (input.signal?.aborted || attempt >= maxAttempts || !isRetryableInferenceFailure(error)) {
        throw new InferenceRequestFailure(error, attempt, input.signal?.aborted === true);
      }
      const retryId = RetryId(nextRetryId());
      const nextAttempt = attempt + 1;
      const delayMs = retryDelay(error, attempt, maxDelayMs, now());
      const failure = structuredFailure(error);
      await input.history.append(input.sessionId, [
        {
          type: "request/failure",
          time: now(),
          data: { requestId: input.requestId, attempt, failure },
        },
        {
          type: "retry/scheduled",
          time: now(),
          data: {
            retryId,
            requestId: input.requestId,
            previousAttempt: attempt,
            nextAttempt,
            delayMs,
            reason: failure,
          },
        },
      ], { durability: "flushed" });
      try {
        await wait(delayMs, input.signal);
      } catch (waitError) {
        const detail = String(input.signal?.reason ??
          (waitError instanceof Error ? waitError.message : waitError));
        await input.history.append(input.sessionId, [{
          type: "retry/cancelled",
          time: now(),
          data: {
            retryId,
            reason: {
              kind: input.signal?.aborted ? "user" : "backoff-failed",
              detail,
            },
          },
        }], { durability: "flushed" });
        throw new InferenceRequestFailure(waitError, attempt, input.signal?.aborted === true);
      }
      await input.history.append(input.sessionId, [
        {
          type: "retry/started",
          time: now(),
          data: { retryId, requestId: input.requestId, attempt: nextAttempt },
        },
        {
          type: "request/attempt",
          time: now(),
          data: { requestId: input.requestId, attempt: nextAttempt, retryId },
        },
      ], { durability: "flushed" });
      attempt = nextAttempt;
    }
  }
}

/**
 * Exposes one stream while retrying only failures that occur before any output
 * becomes observable. Once a chunk is committed, repeating the request would
 * duplicate model output or tool intent and is therefore forbidden.
 */
export function createRetryingInferenceStream<T>(input: {
  readonly history: Pick<SessionHistoryCapability, "append">;
  readonly sessionId: SessionId;
  readonly requestId: RequestId;
  readonly invoke: (
    attempt: number,
    signal: AbortSignal,
  ) => Promise<ReadableStream<T>>;
  readonly signal?: AbortSignal;
  readonly maxAttempts?: number;
  readonly maxDelayMs?: number;
  readonly wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  readonly nextRetryId?: () => string;
  readonly now?: () => number;
}): ReadableStream<T> {
  const controller = new AbortController();
  let activeReader: ReadableStreamDefaultReader<T> | null = null;
  const abortFromParent = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) abortFromParent();
  else input.signal?.addEventListener("abort", abortFromParent, { once: true });
  const cleanup = () => input.signal?.removeEventListener("abort", abortFromParent);

  return new ReadableStream<T>({
    async start(output) {
      try {
        await executeInferenceWithRetry({
          history: input.history,
          sessionId: input.sessionId,
          requestId: input.requestId,
          signal: controller.signal,
          ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
          ...(input.maxDelayMs === undefined ? {} : { maxDelayMs: input.maxDelayMs }),
          ...(input.wait === undefined ? {} : { wait: input.wait }),
          ...(input.nextRetryId === undefined ? {} : { nextRetryId: input.nextRetryId }),
          ...(input.now === undefined ? {} : { now: input.now }),
          invoke: async (attempt) => {
            const stream = await input.invoke(attempt, controller.signal);
            const reader = stream.getReader();
            activeReader = reader;
            let exposed = false;
            const prelude: T[] = [];
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) {
                  for (const part of prelude) output.enqueue(part);
                  return;
                }
                const part = streamPart(next.value);
                if (!exposed && part.type === "error") {
                  throw part.error ?? new Error("Inference stream failed before output");
                }
                if (
                  !exposed &&
                  typeof part.type === "string" &&
                  retryPreludeTypes.has(part.type)
                ) {
                  prelude.push(next.value);
                  continue;
                }
                exposed = true;
                for (const buffered of prelude) output.enqueue(buffered);
                prelude.length = 0;
                output.enqueue(next.value);
              }
            } catch (error) {
              if (exposed) throw new InferenceStreamCommittedFailure(error);
              throw error;
            } finally {
              if (activeReader === reader) activeReader = null;
              reader.releaseLock();
            }
          },
        });
        output.close();
      } catch (error) {
        output.error(error);
      } finally {
        cleanup();
      }
    },
    async cancel(reason) {
      controller.abort(reason);
      cleanup();
      await activeReader?.cancel(reason);
    },
  });
}
