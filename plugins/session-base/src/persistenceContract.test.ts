import { describe, expect, it } from "vitest";
import {
  SESSION_HISTORY_SERVICE,
  type SessionHistoryCapability,
  type SessionPersistenceAdapter,
} from "./index";

describe("session persistence contracts", () => {
  it("publishes one stable history capability and a narrower adapter seam", () => {
    expect(SESSION_HISTORY_SERVICE).toBe("session.history");

    if (false) {
      const capability = null as unknown as SessionHistoryCapability;
      const adapter = null as unknown as SessionPersistenceAdapter;
      void capability.create;
      void capability.append;
      void capability.readWindow;
      void capability.inspect;
      void capability.loadForContinuation;
      void capability.flush;
      void capability.fork;
      void capability.remove;
      void capability.enforceRetention;
      void capability.list;
      void capability.subscribe;
      void adapter.prepare;
      void adapter.append;
      void adapter.readWindow;
      void adapter.inspect;
      void adapter.discardUncommittedTail;
      void adapter.flush;
      void adapter.list;
      void adapter.remove;
      void adapter.dispose;
    }
  });
});
