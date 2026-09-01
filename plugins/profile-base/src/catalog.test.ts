import { describe, expectTypeOf, it } from "vitest";
import type { CapabilityCatalogItem } from "./catalog";

describe("profile catalog contract", () => {
  it("keeps capability cardinality as the public literal union", () => {
    expectTypeOf<CapabilityCatalogItem["cardinality"]>().toEqualTypeOf<
      "exclusive" | "multi"
    >();
  });
});
