import { describe, expect, it } from "vitest";
import { normalizeLogLevel } from "./log";

describe("desktop logging", () => {
  it("accepts supported levels", () => {
    expect(normalizeLogLevel("warn")).toBe("warn");
    expect(normalizeLogLevel("error")).toBe("error");
  });

  it("maps unknown values to info", () => {
    expect(normalizeLogLevel("debug")).toBe("info");
    expect(normalizeLogLevel(undefined)).toBe("info");
  });
});
