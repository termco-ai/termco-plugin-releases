import { describe, expect, it } from "vitest";
import { createApplicationEvents } from "./events";

describe("events-native", () => {
  it("shares one event stream and disposes subscriptions", () => {
    const events = createApplicationEvents();
    const received: unknown[] = [];
    const dispose = events.subscribe("ssh:state-changed", (payload) => {
      received.push(payload);
    });

    events.emit("ssh:state-changed", { connectionId: "prod" });
    dispose();
    events.emit("ssh:state-changed", { connectionId: "ignored" });

    expect(received).toEqual([{ connectionId: "prod" }]);
    expect(events.listenerCount("ssh:state-changed")).toBe(0);
  });

  it("uses a listener snapshot while dispatching", () => {
    const events = createApplicationEvents();
    const calls: string[] = [];
    let disposeSecond = () => {};
    events.subscribe("event", () => {
      calls.push("first");
      disposeSecond();
    });
    disposeSecond = events.subscribe("event", () => calls.push("second"));

    events.emit("event", null);
    events.emit("event", null);

    expect(calls).toEqual(["first", "second", "first"]);
  });

  it("allows one transport to forward every named event", () => {
    const events = createApplicationEvents();
    const received: Array<[string, unknown]> = [];
    const dispose = events.subscribeAll((event, payload) => {
      received.push([event, payload]);
    });
    events.emit("first", 1);
    events.emit("second", 2);
    dispose();
    events.emit("third", 3);
    expect(received).toEqual([
      ["first", 1],
      ["second", 2],
    ]);
  });
});
