import { describe, expect, it } from "vitest";
import {
  SESSION_FORMAT_VERSION,
  type AppendSessionEvent,
  SessionContractError,
  SessionId,
  SessionSeq,
  type SessionEvent,
  type SessionHeader,
} from "./index";

declare module "./events" {
  interface SessionEventMap {
    "test/value": { readonly value: string };
  }
}

describe("@termco/session-base public contract", () => {
  it("exports stable identity, format, and structured error primitives", () => {
    expect(SESSION_FORMAT_VERSION).toBe(2);
    expect(SessionId("session-1")).toBe("session-1");
    expect(SessionSeq(7)).toBe(7);

    const error = new SessionContractError({
      code: "INVALID_HEADER",
      message: "session header is invalid",
      path: "header.id",
    });

    expect(error).toMatchObject({
      name: "SessionContractError",
      code: "INVALID_HEADER",
      message: "session header is invalid",
      path: "header.id",
    });
  });

  it("exports an immutable header and merge-extensible typed event envelope", () => {
    const header: SessionHeader = {
      formatVersion: SESSION_FORMAT_VERSION,
      id: SessionId("session-1"),
      createdAt: 1_777_777_777_777,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
    };
    const event: SessionEvent<"test/value"> = {
      type: "test/value",
      seq: SessionSeq(0),
      time: 1_777_777_777_778,
      data: { value: "typed" },
    };

    expect(header).toMatchObject({ formatVersion: 2, authority: "v2" });
    expect(event.data.value).toBe("typed");

    if (false) {
      // @ts-expect-error Session headers are immutable after creation.
      header.id = SessionId("replacement");
      // @ts-expect-error Event data is narrowed by its discriminant.
      event.data.value = 42;

      const appendIntent: AppendSessionEvent<"test/value"> = {
        type: "test/value",
        time: 1,
        data: { value: "append" },
      };
      // @ts-expect-error Committed sequence allocation belongs only to the session owner.
      appendIntent.seq = SessionSeq(1);
    }
  });
});
