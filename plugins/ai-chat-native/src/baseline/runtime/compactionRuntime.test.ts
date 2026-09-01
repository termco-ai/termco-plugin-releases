import type { AiInferenceCapability } from "@termco/ai-inference-base";
import { describe, expect, it, vi } from "vitest";
import {
  compactionInference,
  configureCompactionRuntime,
} from "./compactionRuntime";

function inference(): AiInferenceCapability {
  return {
    configuration: vi.fn(),
    generate: vi.fn(),
    stream: vi.fn(),
  };
}

describe("compaction inference binding", () => {
  it("disposes only the provider instance that installed it", () => {
    const first = inference();
    const second = inference();
    const disposeFirst = configureCompactionRuntime(first);
    const disposeSecond = configureCompactionRuntime(second);

    disposeFirst();
    expect(compactionInference()).toBe(second);
    disposeSecond();
    expect(() => compactionInference()).toThrow(
      "AI inference provider is not active",
    );
  });
});
