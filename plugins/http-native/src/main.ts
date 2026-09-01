import { request, type Agent } from "undici";
import type { HttpCapability } from "@termco/http-base";
import type { PluginModule } from "@termco/kernel";
import { pinnedAgent } from "./index";
import { classifyAndCollectSafeIps, validateUrl } from "./classify";

function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) output[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return output;
}

async function open(
  input: Parameters<HttpCapability["request"]>[0],
  signal?: AbortSignal,
) {
  const parsed = validateUrl(input.url, Boolean(input.allowPrivateNetwork));
  const safeIps = await classifyAndCollectSafeIps(
    parsed.hostname,
    Boolean(input.allowPrivateNetwork),
  );
  const agent = pinnedAgent(safeIps);
  try {
    const response = await request(input.url, {
      method: (input.method ?? "GET").toUpperCase() as never,
      headers: input.headers ?? {},
      body: input.body ? Buffer.from(input.body) : undefined,
      dispatcher: agent,
      ...(signal ? { signal } : {}),
      ...(input.timeoutMs
        ? { headersTimeout: input.timeoutMs, bodyTimeout: input.timeoutMs }
        : {}),
    });
    return { response, agent };
  } catch (error) {
    await agent.close();
    throw error;
  }
}

const plugin: PluginModule = {
  activate(context) {
    const capability: HttpCapability = {
      async ping(url) {
        const parsed = validateUrl(url, true);
        const safeIps = await classifyAndCollectSafeIps(parsed.hostname, true);
        const agent = pinnedAgent(safeIps);
        try {
          const response = await request(url, { method: "GET", dispatcher: agent });
          response.body.destroy();
          return response.statusCode;
        } finally {
          await agent.close();
        }
      },
      async request(input) {
        const { response, agent } = await open(input);
        try {
          return {
            status: response.statusCode,
            headers: normalizeHeaders(response.headers),
            body: Array.from(Buffer.from(await response.body.arrayBuffer())),
          };
        } finally {
          await agent.close();
        }
      },
      async stream(input, emit) {
        const controller = new AbortController();
        let agent: Agent | undefined;
        const running = (async () => {
          try {
            const result = await open(input, controller.signal);
            agent = result.agent;
            emit({
              kind: "headers",
              status: result.response.statusCode,
              headers: normalizeHeaders(result.response.headers),
            });
            for await (const chunk of result.response.body) {
              emit({ kind: "chunk", bytes: Array.from(chunk as Buffer) });
            }
            emit({ kind: "end" });
          } catch (error) {
            if (!controller.signal.aborted) {
              emit({ kind: "error", message: (error as Error).message });
            }
          } finally {
            if (agent) await agent.close();
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
