import { describe, expect, it } from "vitest";
import { buildLabel } from "./model";

describe("About model", () => {
  it("formats replaceable application identity facts", () => {
    expect(buildLabel({
      name: "Company Termco",
      version: "3.4.5",
      bundleId: "com.company.termco",
      platform: "darwin",
      architecture: "arm64",
    })).toBe("macOS · arm64 · v3.4.5");
  });
});
