import { describe, expect, it } from "vitest";
import { OrderedToolScheduler, type ToolConcurrency } from "./scheduler";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

async function ticks(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

describe("ordered tool scheduler properties", () => {
  it("preserves barriers, bounded overlap, settlement, and model-order commits across generated schedules", async () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const next = random(seed);
      const scheduler = new OrderedToolScheduler<number>(3);
      const kinds: ToolConcurrency[] = Array.from({ length: 24 }, (_, index) =>
        index > 0 && next() < 0.22 ? "exclusive" : "safe"
      );
      const orders = kinds.map((kind) => scheduler.register(kind));
      let runningSafe = 0;
      let exclusiveRunning = false;
      let maximumSafe = 0;
      const commits: number[] = [];
      const violations: string[] = [];

      const results = orders.map((order, index) => scheduler.execute(
        order,
        async () => {
          const kind = kinds[index]!;
          if (kind === "safe") {
            if (exclusiveRunning) violations.push(`safe ${index} crossed exclusive`);
            runningSafe += 1;
            maximumSafe = Math.max(maximumSafe, runningSafe);
          } else {
            if (exclusiveRunning || runningSafe > 0) {
              violations.push(`exclusive ${index} overlapped another body`);
            }
            exclusiveRunning = true;
          }
          await ticks(1 + Math.floor(next() * 5));
          if (kind === "safe") runningSafe -= 1;
          else exclusiveRunning = false;
          return index;
        },
        async (value) => {
          await ticks(Math.floor(next() * 3));
          commits.push(value);
        },
      ));

      await expect(Promise.all(results)).resolves.toEqual(
        Array.from({ length: kinds.length }, (_, index) => index),
      );
      expect(violations, `seed ${seed}`).toEqual([]);
      expect(maximumSafe, `seed ${seed}`).toBeLessThanOrEqual(3);
      expect(commits, `seed ${seed}`).toEqual(
        Array.from({ length: kinds.length }, (_, index) => index),
      );
    }
  });
});
