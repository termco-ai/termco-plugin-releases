export type HttpStreamEvent =
  | { kind: "headers"; status: number; headers: Record<string, string> }
  | { kind: "chunk"; bytes: number[] }
  | { kind: "end" }
  | { kind: "error"; message: string };

export type DisposeHttpStream = () => Promise<void>;

export interface HttpCapability {
  ping(url: string): Promise<number>;
  request(input: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array;
    allowPrivateNetwork?: boolean;
    timeoutMs?: number;
  }): Promise<{ status: number; headers: Record<string, string>; body: number[] }>;
  stream(
    input: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: Uint8Array;
      allowPrivateNetwork?: boolean;
      timeoutMs?: number;
    },
    emit: (event: HttpStreamEvent) => void,
  ): Promise<DisposeHttpStream>;
}
