import { describe, expect, it } from "vitest";
import { applicationName } from "./identity";

describe("application identity", () => {
  it("uses the product name during development", () => {
    expect(applicationName(false, "Electron")).toBe("Termco");
  });

  it("preserves a packaged distribution name", () => {
    expect(applicationName(true, "Company Termco")).toBe("Company Termco");
  });
});
