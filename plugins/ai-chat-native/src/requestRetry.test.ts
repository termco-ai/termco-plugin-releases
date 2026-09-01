import { describe, expect, it, vi } from "vitest";
import {
  RequestId,
  SessionId,
  type AppendSessionEvent,
  type SessionHistoryCapability,
} from "@termco/session-base";
import {
  createRetryingInferenceStream,
  executeInferenceWithRetry,
  isInferenceRequestFailure,
} from "./requestRetry";

async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

describe("current inference request retry", () => {
  it("durably closes a retryable attempt before starting the next attempt", async () => {
    const batches: AppendSessionEvent[][] = [];
    const append = vi.fn(async (
      _sessionId: ReturnType<typeof SessionId>,
      events: readonly AppendSessionEvent[],
    ) => {
      batches.push([...events]);
      return undefined as never;
    });
    const attempts: number[] = [];
    const wait = vi.fn(async () => undefined);

    const result = await executeInferenceWithRetry({
      history: { append } as unknown as SessionHistoryCapability,
      sessionId: SessionId("session-a"),
      requestId: RequestId("request-a"),
      wait,
      nextRetryId: () => "retry-a",
      invoke: async (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) {
          throw Object.assign(new Error("rate limited"), {
            statusCode: 429,
            retryAfterMs: 25,
          });
        }
        return { stream: "ready" };
      },
    });

    expect(result).toEqual({ stream: "ready" });
    expect(attempts).toEqual([1, 2]);
    expect(wait).toHaveBeenCalledWith(25, undefined);
    expect(batches.map((batch) => batch.map((event) => event.type))).toEqual([
      ["request/failure", "retry/scheduled"],
      ["retry/started", "request/attempt"],
    ]);
    expect(batches[0]).toEqual([
      expect.objectContaining({
        type: "request/failure",
        data: expect.objectContaining({ requestId: "request-a", attempt: 1 }),
      }),
      expect.objectContaining({
        type: "retry/scheduled",
        data: expect.objectContaining({
          retryId: "retry-a",
          previousAttempt: 1,
          nextAttempt: 2,
          delayMs: 25,
        }),
      }),
    ]);
    expect(batches[1]).toEqual([
      expect.objectContaining({
        type: "retry/started",
        data: { retryId: "retry-a", requestId: "request-a", attempt: 2 },
      }),
      expect.objectContaining({
        type: "request/attempt",
        data: { requestId: "request-a", attempt: 2, retryId: "retry-a" },
      }),
    ]);
  });

  it("durably cancels a scheduled retry when the session aborts during backoff", async () => {
    const batches: AppendSessionEvent[][] = [];
    const append = vi.fn(async (
      _sessionId: ReturnType<typeof SessionId>,
      events: readonly AppendSessionEvent[],
    ) => {
      batches.push([...events]);
      return undefined as never;
    });
    const controller = new AbortController();

    const rejection = executeInferenceWithRetry({
      history: { append } as unknown as SessionHistoryCapability,
      sessionId: SessionId("session-a"),
      requestId: RequestId("request-a"),
      signal: controller.signal,
      nextRetryId: () => "retry-cancelled",
      invoke: async () => {
        throw Object.assign(new Error("temporarily unavailable"), {
          statusCode: 503,
        });
      },
      wait: async () => {
        controller.abort("user cancelled");
        throw new DOMException("user cancelled", "AbortError");
      },
    });
    await expect(rejection).rejects.toMatchObject({
      name: "AbortError",
      attempt: 1,
      cancelled: true,
    });

    expect(batches.map((batch) => batch.map((event) => event.type))).toEqual([
      ["request/failure", "retry/scheduled"],
      ["retry/cancelled"],
    ]);
    expect(batches[1]?.[0]).toMatchObject({
      type: "retry/cancelled",
      data: {
        retryId: "retry-cancelled",
        reason: { kind: "user", detail: "user cancelled" },
      },
    });
  });

  it("reports the final attempt when bounded retries are exhausted", async () => {
    const append = vi.fn(async () => undefined as never);
    const rejection = executeInferenceWithRetry({
      history: { append } as unknown as SessionHistoryCapability,
      sessionId: SessionId("session-a"),
      requestId: RequestId("request-a"),
      maxAttempts: 2,
      wait: async () => undefined,
      nextRetryId: () => "retry-a",
      invoke: async () => {
        throw Object.assign(new Error("still unavailable"), {
          code: "UPSTREAM_DOWN",
          statusCode: 503,
        });
      },
    });

    const error = await rejection.catch((failure: unknown) => failure);
    expect(isInferenceRequestFailure(error)).toBe(true);
    expect(error).toMatchObject({
      message: "still unavailable",
      code: "UPSTREAM_DOWN",
      attempt: 2,
      cancelled: false,
    });
  });

  it("retries a provider stream that fails before emitting output", async () => {
    const append = vi.fn(async () => undefined as never);
    const attempts: number[] = [];
    const stream = createRetryingInferenceStream<string>({
      history: { append } as unknown as SessionHistoryCapability,
      sessionId: SessionId("session-a"),
      requestId: RequestId("request-a"),
      wait: async () => undefined,
      nextRetryId: () => "retry-stream",
      invoke: async (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) {
          return new ReadableStream({
            start(controller) {
              controller.error(Object.assign(new Error("gateway unavailable"), {
                statusCode: 503,
              }));
            },
          });
        }
        return new ReadableStream({
          start(controller) {
            controller.enqueue("ready");
            controller.close();
          },
        });
      },
    });

    await expect(collect(stream)).resolves.toEqual(["ready"]);
    expect(attempts).toEqual([1, 2]);
  });

  it("discards protocol prelude and retries a retryable error part before semantic output", async () => {
    const append = vi.fn(async () => undefined as never);
    const attempts: number[] = [];
    const stream = createRetryingInferenceStream<Record<string, unknown>>({
      history: { append } as unknown as SessionHistoryCapability,
      sessionId: SessionId("session-a"),
      requestId: RequestId("request-a"),
      wait: async () => undefined,
      invoke: async (attempt) => {
        attempts.push(attempt);
        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: `attempt-${attempt}` });
            if (attempt === 1) {
              controller.enqueue({
                type: "error",
                error: Object.assign(new Error("gateway unavailable"), {
                  statusCode: 503,
                }),
              });
            } else {
              controller.enqueue({ type: "text-delta", id: "text-1", text: "ready" });
              controller.enqueue({ type: "finish", finishReason: "stop" });
            }
            controller.close();
          },
        });
      },
    });

    await expect(collect(stream)).resolves.toEqual([
      { type: "start", messageId: "attempt-2" },
      { type: "text-delta", id: "text-1", text: "ready" },
      { type: "finish", finishReason: "stop" },
    ]);
    expect(attempts).toEqual([1, 2]);
  });

  it("honors Retry-After headers but caps the provider delay", async () => {
    const append = vi.fn(async (
      _sessionId: ReturnType<typeof SessionId>,
      _events: readonly AppendSessionEvent[],
    ) => undefined as never);
    const wait = vi.fn(async () => undefined);

    await executeInferenceWithRetry({
      history: { append } as unknown as SessionHistoryCapability,
      sessionId: SessionId("session-a"),
      requestId: RequestId("request-a"),
      maxDelayMs: 2_000,
      wait,
      nextRetryId: () => "retry-header",
      invoke: async (attempt) => {
        if (attempt === 1) {
          throw Object.assign(new Error("rate limited"), {
            statusCode: 429,
            response: { headers: new Headers({ "Retry-After": "9" }) },
          });
        }
        return "done";
      },
    });

    expect(wait).toHaveBeenCalledWith(2_000, undefined);
    expect(vi.mocked(append).mock.calls[0]?.[1]?.[1]).toMatchObject({
      type: "retry/scheduled",
      data: { delayMs: 2_000 },
    });
  });

  it("does not retry after provider output has been exposed", async () => {
    const append = vi.fn(async () => undefined as never);
    const attempts: number[] = [];
    const stream = createRetryingInferenceStream<string>({
      history: { append } as unknown as SessionHistoryCapability,
      sessionId: SessionId("session-a"),
      requestId: RequestId("request-a"),
      wait: async () => undefined,
      invoke: async (attempt) => {
        attempts.push(attempt);
        let pull = 0;
        return new ReadableStream({
          pull(controller) {
            pull += 1;
            if (pull === 1) {
              controller.enqueue("partial");
              return;
            }
            controller.error(Object.assign(new Error("stream disconnected"), {
              code: "ECONNRESET",
            }));
          },
        });
      },
    });

    await expect(collect(stream)).rejects.toMatchObject({
      message: "stream disconnected",
      attempt: 1,
      cancelled: false,
    });
    expect(attempts).toEqual([1]);
    expect(append).not.toHaveBeenCalled();
  });
});
