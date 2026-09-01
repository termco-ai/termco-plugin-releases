export interface SecretsCapability {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, password: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
  getAll(service: string, accounts: string[]): Promise<Array<string | null>>;
}
