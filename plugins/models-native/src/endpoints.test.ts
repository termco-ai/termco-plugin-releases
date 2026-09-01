import { describe, expect, it } from "vitest";
import {
  type CustomEndpoint,
  compatModelIdForEndpoint,
  endpointIdFromCompatModel,
  getCompatModelInfo,
  isCompatModelId,
} from "./endpoints";

const endpoint: CustomEndpoint = {
  id: "ep1",
  name: "Homelab",
  baseURL: "http://10.0.0.5:8000/v1",
  modelId: "qwen3-32b",
  contextLimit: 32_000,
};

describe("isCompatModelId", () => {
  it("accepts the bare prefix with an empty endpoint id", () => {
    expect(isCompatModelId("compat-")).toBe(true);
    expect(endpointIdFromCompatModel("compat-")).toBe("");
  });

  it("rejects ids that merely contain the prefix", () => {
    expect(isCompatModelId("x-compat-ep1")).toBe(false);
    expect(endpointIdFromCompatModel("x-compat-ep1")).toBe("");
  });
});

describe("getCompatModelInfo", () => {
  it("builds a full ModelInfo from a matching endpoint", () => {
    const mid = compatModelIdForEndpoint(endpoint.id);
    const info = getCompatModelInfo(mid, [endpoint]);
    expect(info).toEqual({
      id: mid,
      provider: "openai-compatible",
      label: "qwen3-32b",
      hint: "Homelab",
      description: "Homelab — http://10.0.0.5:8000/v1",
      capabilities: { intelligence: 3, speed: 3, cost: 3 },
    });
  });

  it("falls back to the endpoint name when its modelId is empty", () => {
    const ep = { ...endpoint, modelId: "" };
    const info = getCompatModelInfo(compatModelIdForEndpoint(ep.id), [ep]);
    expect(info.label).toBe("Homelab");
  });

  it("falls back to a generic name when the endpoint name is empty", () => {
    const ep = { ...endpoint, name: "" };
    const info = getCompatModelInfo(compatModelIdForEndpoint(ep.id), [ep]);
    expect(info.hint).toBe("Custom endpoint");
    expect(info.description).toContain(ep.baseURL);
  });

  it("returns a placeholder when the endpoint is missing", () => {
    const mid = compatModelIdForEndpoint("gone");
    const info = getCompatModelInfo(mid, [endpoint]);
    expect(info.id).toBe(mid);
    expect(info.provider).toBe("openai-compatible");
    expect(info.label).toBe("Custom endpoint");
    expect(info.description).toBe("Custom OpenAI-compatible endpoint");
  });

  it("matches by embedded endpoint id, not list order", () => {
    const other = { ...endpoint, id: "ep2", name: "Second" };
    const info = getCompatModelInfo(compatModelIdForEndpoint("ep2"), [
      endpoint,
      other,
    ]);
    expect(info.hint).toBe("Second");
  });
});
