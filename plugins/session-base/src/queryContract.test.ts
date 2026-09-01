import { describe, expect, it } from "vitest";
import {
  SESSION_MODEL_QUERY_SERVICE,
  SESSION_QUERY_SERVICE,
  type SessionModelQueryCapability,
  type SessionQueryCapability,
} from "./index";

describe("session query contract", () => {
  it("owns semantic session search and exact event lookup", () => {
    expect(SESSION_QUERY_SERVICE).toBe("session.query");
    if (false) {
      const query = null as unknown as SessionQueryCapability;
      void query.search;
      void query.readEvent;
      void query.explainEvent;
    }
  });

  it("keeps caller-bound model query separate from the human query capability", () => {
    expect(SESSION_MODEL_QUERY_SERVICE).toBe("session.query.model");
    if (false) {
      const query = null as unknown as SessionModelQueryCapability;
      void query.search;
      void query.traceSession;
      void query.readEvent;
      void query.explainEvent;
    }
  });
});
