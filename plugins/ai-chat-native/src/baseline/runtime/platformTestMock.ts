import { vi } from "vitest";

export const emit = vi.fn();
export const listen = vi.fn(() => Promise.resolve(() => {}));

export class LazyStore {
  async get(): Promise<undefined> {
    return undefined;
  }
  async set(): Promise<void> {}
  async delete(): Promise<boolean> {
    return false;
  }
  async entries(): Promise<Array<[string, unknown]>> {
    return [];
  }
  async save(): Promise<void> {}
}
