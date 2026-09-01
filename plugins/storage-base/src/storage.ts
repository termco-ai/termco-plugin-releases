export interface StorageHandle {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  keys(): string[];
  values(): unknown[];
  entries(): Array<[string, unknown]>;
  clear(): void;
  reset(defaults?: Record<string, unknown>): void;
  save(): Promise<void>;
}

export interface StorageCapability {
  open(path: string, defaults?: Record<string, unknown>): Promise<StorageHandle>;
  close(path: string): Promise<void>;
}
