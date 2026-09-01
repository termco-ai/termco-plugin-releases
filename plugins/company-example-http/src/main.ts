import type { HttpCapability } from "@termco/http-base";
import type { PluginModule } from "@termco/kernel";

type RequestInput = Parameters<HttpCapability["request"]>[0];

function validatedUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported HTTP protocol: ${url.protocol}`);
  }
  return url.href;
}

function headers(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

async function request(input: RequestInput, signal?: AbortSignal): Promise<Response> {
  const timeoutSignal = input.timeoutMs ? AbortSignal.timeout(input.timeoutMs) : undefined;
  const effectiveSignal = signal && timeoutSignal
    ? AbortSignal.any([signal, timeoutSignal])
    : signal ?? timeoutSignal;
  return fetch(validatedUrl(input.url), {
    method: input.method ?? "GET",
    headers: input.headers,
    body: input.body ? Buffer.from(input.body) : undefined,
    signal: effectiveSignal,
    redirect: "follow",
  });
}

const plugin: PluginModule = {
  activate(context) {
    const capability: HttpCapability = {
      async ping(url) {
        const response = await request({ url });
        await response.body?.cancel();
        return response.status;
      },
      async request(input) {
        const response = await request(input);
        return {
          status: response.status,
          headers: headers(response),
          body: Array.from(new Uint8Array(await response.arrayBuffer())),
        };
      },
      async stream(input, emit) {
        const controller = new AbortController();
        const running = (async () => {
          try {
            const response = await request(input, controller.signal);
            emit({
              kind: "headers",
              status: response.status,
              headers: headers(response),
            });
            const reader = response.body?.getReader();
            if (reader) {
              for (;;) {
                const next = await reader.read();
                if (next.done) break;
                emit({ kind: "chunk", bytes: Array.from(next.value) });
              }
            }
            emit({ kind: "end" });
          } catch (error) {
            if (!controller.signal.aborted) {
              emit({
                kind: "error",
                message: error instanceof Error ? error.message : String(error),
              });
            }
          }
        })();
        return async () => {
          controller.abort(new DOMException("HTTP stream cancelled", "AbortError"));
          await running;
        };
      },
    };
    context.provide("network.http", capability);
  },
};

export default plugin;
