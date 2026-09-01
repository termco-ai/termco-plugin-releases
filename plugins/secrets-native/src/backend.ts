import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export interface SafeStorageBackend {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface SecretStore {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, password: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
  getAll(service: string, accounts: string[]): Promise<Array<string | null>>;
}

export function createSecretStore(input: {
  userData: string;
  safeStorage: SafeStorageBackend;
}): SecretStore {
  const requireEncryption = () => {
    if (!input.safeStorage.isEncryptionAvailable()) {
      throw new Error("Electron safeStorage is unavailable");
    }
  };
  const storePath = join(input.userData, "secrets.safe-storage.json");
  const keyFor = (service: string, account: string) =>
    JSON.stringify([service, account]);
  const readStore = (): Record<string, string> => {
    try {
      const parsed = JSON.parse(readFileSync(storePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] =>
          typeof entry[1] === "string",
        ),
      );
    } catch {
      return {};
    }
  };
  const writeStore = (values: Record<string, string>) => {
    mkdirSync(input.userData, { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(values), { mode: 0o600 });
    renameSync(temporaryPath, storePath);
    try {
      chmodSync(storePath, 0o600);
    } catch {
      // Best effort on filesystems without POSIX modes.
    }
  };

  const get = async (service: string, account: string): Promise<string | null> => {
    const encrypted = readStore()[keyFor(service, account)];
    if (!encrypted) return null;
    requireEncryption();
    return input.safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  };

  return {
    get,
    async set(service, account, password) {
      requireEncryption();
      const values = readStore();
      values[keyFor(service, account)] = input.safeStorage
        .encryptString(password)
        .toString("base64");
      writeStore(values);
    },
    async delete(service, account) {
      const values = readStore();
      delete values[keyFor(service, account)];
      writeStore(values);
    },
    getAll: (service, accounts) => Promise.all(accounts.map((account) => get(service, account))),
  };
}
