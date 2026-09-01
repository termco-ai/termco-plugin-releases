import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeInteractive,
  buildAuthUrl,
  discover,
  type FetchLike,
  type Loopback,
  parseResourceMetadata,
  pkce,
  refreshGrant,
} from "./oauth";

const json = (obj: unknown) => ({
  ok: true,
  status: 200,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
});
const fail = (status: number) => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => "",
});

/** Fetch mock for a server with full discovery + DCR + token endpoints. */
function discoveryFetch(record?: { calls: { url: string; body?: string }[] }): FetchLike {
  return async (url, init) => {
    record?.calls.push({ url, body: init?.body });
    const method = init?.method ?? "GET";
    if (url.includes(".well-known/oauth-protected-resource"))
      return json({ authorization_servers: ["https://as.example.com"] });
    if (url.includes(".well-known/oauth-authorization-server"))
      return json({
        authorization_endpoint: "https://as.example.com/authorize",
        token_endpoint: "https://as.example.com/token",
        registration_endpoint: "https://as.example.com/register",
      });
    if (url === "https://as.example.com/register" && method === "POST")
      return json({ client_id: "dcr-client" });
    if (url === "https://as.example.com/token" && method === "POST")
      return json({ access_token: "at1", refresh_token: "rt1", expires_in: 3600 });
    return fail(404);
  };
}

describe("pkce", () => {
  it("derives an S256 challenge from the verifier", () => {
    const { verifier, challenge } = pkce();
    expect(challenge).toBe(
      createHash("sha256").update(verifier).digest().toString("base64url"),
    );
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("parseResourceMetadata", () => {
  it("extracts the resource_metadata URL from WWW-Authenticate", () => {
    expect(
      parseResourceMetadata('Bearer resource_metadata="https://s/.well-known/x"'),
    ).toBe("https://s/.well-known/x");
    expect(parseResourceMetadata("Bearer")).toBeNull();
    expect(parseResourceMetadata(undefined)).toBeNull();
  });
});

describe("discover", () => {
  it("resolves endpoints via protected-resource + auth-server metadata", async () => {
    const meta = await discover(
      "https://mcp.example.com/mcp",
      undefined,
      discoveryFetch(),
    );
    expect(meta).toEqual({
      authorizationEndpoint: "https://as.example.com/authorize",
      tokenEndpoint: "https://as.example.com/token",
      registrationEndpoint: "https://as.example.com/register",
    });
  });

  it("falls back to conventional paths when no metadata is served", async () => {
    const meta = await discover(
      "https://mcp.example.com/mcp",
      undefined,
      async () => fail(404),
    );
    expect(meta.authorizationEndpoint).toBe("https://mcp.example.com/authorize");
    expect(meta.tokenEndpoint).toBe("https://mcp.example.com/token");
  });
});

describe("buildAuthUrl", () => {
  it("includes PKCE, state, and the resource indicator", () => {
    const url = new URL(
      buildAuthUrl(
        {
          authorizationEndpoint: "https://as/authorize",
          tokenEndpoint: "https://as/token",
        },
        {
          clientId: "cid",
          redirectUri: "http://127.0.0.1:9/callback",
          challenge: "chal",
          state: "st",
          scopes: "read",
          resource: "https://mcp.example.com/mcp",
        },
      ),
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/mcp");
    expect(url.searchParams.get("scope")).toBe("read");
  });
});

describe("authorizeInteractive", () => {
  it("runs discovery → DCR → browser → exchange and returns tokens", async () => {
    let authUrl = "";
    let waitedState = "";
    const progress: string[] = [];
    const rec = { calls: [] as { url: string; body?: string }[] };

    const loopback = async (): Promise<Loopback> => ({
      redirectUri: "http://127.0.0.1:9999/callback",
      waitForCode: async (state) => {
        waitedState = state;
        return "the-code";
      },
      close: () => {},
    });

    const tokens = await authorizeInteractive(
      "https://mcp.example.com/mcp",
      { scopes: "read" },
      {
        fetchImpl: discoveryFetch(rec),
        openBrowser: async (u) => {
          authUrl = u;
        },
        onProgress: (s) => progress.push(s),
        loopback,
      },
    );

    expect(tokens.accessToken).toBe("at1");
    expect(tokens.refreshToken).toBe("rt1");
    expect(tokens.clientId).toBe("dcr-client");
    expect(tokens.expiresAt).toBeGreaterThan(0);
    // DCR was used (no clientId supplied)
    expect(rec.calls.some((c) => c.url.endsWith("/register"))).toBe(true);
    // the state handed to the loopback matches the one in the browser URL
    expect(new URL(authUrl).searchParams.get("state")).toBe(waitedState);
    // token exchange used the authorization_code grant + PKCE verifier
    const exchange = rec.calls.find((c) => c.url.endsWith("/token"));
    expect(exchange?.body).toMatch(/grant_type=authorization_code/);
    expect(exchange?.body).toMatch(/code=the-code/);
    expect(exchange?.body).toMatch(/code_verifier=/);
    expect(progress).toEqual([
      "discovering",
      "waiting-for-browser",
      "exchanging",
      "done",
    ]);
  });

  it("reports error progress and rethrows when the flow fails", async () => {
    const progress: string[] = [];
    await expect(
      authorizeInteractive(
        "https://mcp.example.com/mcp",
        {},
        {
          fetchImpl: discoveryFetch(),
          openBrowser: async () => {},
          onProgress: (s) => progress.push(s),
          loopback: async () => ({
            redirectUri: "http://127.0.0.1:9/callback",
            waitForCode: async () => {
              throw new Error("timed out");
            },
            close: () => {},
          }),
        },
      ),
    ).rejects.toThrow("timed out");
    expect(progress).toContain("error");
  });
});

describe("refreshGrant", () => {
  it("posts the refresh grant and keeps the old refresh token when not rotated", async () => {
    let body = "";
    const fetchImpl: FetchLike = async (_url, init) => {
      body = init?.body ?? "";
      return json({ access_token: "at2", expires_in: 60 });
    };
    const next = await refreshGrant(
      "https://mcp.example.com/mcp",
      {
        accessToken: "old",
        refreshToken: "rt1",
        clientId: "cid",
        tokenEndpoint: "https://as/token",
        authorizationEndpoint: "https://as/authorize",
      },
      fetchImpl,
    );
    expect(body).toMatch(/grant_type=refresh_token/);
    expect(next.accessToken).toBe("at2");
    expect(next.refreshToken).toBe("rt1");
  });
});
