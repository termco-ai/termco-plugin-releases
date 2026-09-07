import { afterEach, expect, it, vi } from "vitest";
import { reviewCache } from "./reviewCache";

afterEach(() => vi.useRealTimers());

it("evicts least recently read patches to keep the memory budget bounded", () => {
  const cache = reviewCache<string>({
    ttlMs: 45_000,
    maxEntries: 3,
    maxWeight: 8,
    weight: (text) => text.length,
  });
  const put = (key: string, value: string) =>
    cache.set(key, { at: Date.now(), value });
  put("a", "aaa");
  put("b", "bbb");
  expect(cache.get("a")?.value).toBe("aaa");
  put("c", "ccc");
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("a")?.value).toBe("aaa");
  put("huge", "123456789");
  expect(cache.get("huge")).toBeUndefined();
  expect(cache.get("c")?.value).toBe("ccc");
});

it("expires old entries and honors the entry count limit", () => {
  vi.useFakeTimers();
  const cache = reviewCache<string>({ ttlMs: 45_000, maxEntries: 1 });
  cache.set("a", { at: Date.now(), value: "a" });
  cache.set("b", { at: Date.now(), value: "b" });
  expect(cache.get("a")).toBeUndefined();
  vi.advanceTimersByTime(45_000);
  expect(cache.get("b")).toBeUndefined();
});
