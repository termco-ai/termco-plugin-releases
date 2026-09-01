/**
 * OAuth 2.1 for remote MCP servers — discovery, Dynamic Client Registration,
 * Authorization Code + PKCE via the system browser and a loopback redirect, and
 * refresh. Runs entirely in the main process; tokens are handed to the caller to
 * persist in the keychain (never the renderer). `fetch`, the browser opener, the
 * progress sink, and the loopback server are all injectable for tests.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { McpOAuthTokens } from "./tokenStore";

type ResponseLike = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};
type FetchInit = { method: string; headers: Record<string, string>; body?: string };
export type FetchLike = (url: string, init?: FetchInit) => Promise<ResponseLike>;

export type OAuthProgress =
  | "discovering"
  | "waiting-for-browser"
  | "exchanging"
  | "done"
  | "error";

export type AuthServerMeta = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
};

export type Loopback = {
  redirectUri: string;
  waitForCode: (expectedState: string, timeoutMs: number) => Promise<string>;
  close: () => void;
};

export type InteractiveDeps = {
  fetchImpl?: FetchLike;
  openBrowser?: (url: string) => Promise<void>;
  onProgress?: (state: OAuthProgress) => void;
  loopback?: () => Promise<Loopback>;
};

const AUTH_TIMEOUT_MS = 5 * 60_000;

// ── PKCE + helpers ───────────────────────────────────────────────────────────

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest()
    .toString("base64url");
  return { verifier, challenge };
}

function randomState(): string {
  return randomBytes(16).toString("base64url");
}

function origin(url: string): string {
  return new URL(url).origin;
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetchImpl(url, { method: "GET", headers: {} });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Pull `resource_metadata="…"` out of a `WWW-Authenticate` header (RFC 9728). */
export function parseResourceMetadata(wwwAuth?: string): string | null {
  if (!wwwAuth) return null;
  const m = wwwAuth.match(/resource_metadata="([^"]+)"/i);
  return m ? m[1] : null;
}

// ── discovery ────────────────────────────────────────────────────────────────

/**
 * Resolve the authorization server's endpoints for a protected MCP server:
 * protected-resource metadata (RFC 9728) → auth-server metadata (RFC 8414 /
 * OIDC), falling back to conventional paths when a server ships no metadata.
 */
export async function discover(
  serverUrl: string,
  wwwAuth: string | undefined,
  fetchImpl: FetchLike,
): Promise<AuthServerMeta> {
  const rmUrl =
    parseResourceMetadata(wwwAuth) ??
    new URL(
      "/.well-known/oauth-protected-resource",
      origin(serverUrl),
    ).toString();
  const rm = await fetchJson(fetchImpl, rmUrl);
  const asList = rm?.authorization_servers;
  const asUrl =
    (Array.isArray(asList) && typeof asList[0] === "string"
      ? asList[0]
      : undefined) ?? origin(serverUrl);

  for (const path of [
    "/.well-known/oauth-authorization-server",
    "/.well-known/openid-configuration",
  ]) {
    const meta = await fetchJson(
      fetchImpl,
      new URL(path, asUrl).toString(),
    );
    if (meta?.authorization_endpoint && meta?.token_endpoint) {
      return {
        authorizationEndpoint: String(meta.authorization_endpoint),
        tokenEndpoint: String(meta.token_endpoint),
        registrationEndpoint:
          typeof meta.registration_endpoint === "string"
            ? meta.registration_endpoint
            : undefined,
      };
    }
  }

  const base = asUrl.replace(/\/$/, "");
  return {
    authorizationEndpoint: `${base}/authorize`,
    tokenEndpoint: `${base}/token`,
    registrationEndpoint: `${base}/register`,
  };
}

// ── dynamic client registration (RFC 7591) ───────────────────────────────────

export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  scopes: string | undefined,
  fetchImpl: FetchLike,
): Promise<{ clientId: string; clientSecret?: string }> {
  const r = await fetchImpl(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Termco",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(scopes ? { scope: scopes } : {}),
    }),
  });
  if (!r.ok) throw new Error(`client registration failed (HTTP ${r.status})`);
  const body = (await r.json()) as { client_id?: string; client_secret?: string };
  if (!body.client_id) throw new Error("client registration returned no client_id");
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

// ── authorization URL + token exchange ────────────────────────────────────────

export function buildAuthUrl(
  meta: AuthServerMeta,
  p: {
    clientId: string;
    redirectUri: string;
    challenge: string;
    state: string;
    scopes?: string;
    resource: string;
  },
): string {
  const u = new URL(meta.authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", p.state);
  u.searchParams.set("resource", p.resource);
  if (p.scopes) u.searchParams.set("scope", p.scopes);
  return u.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

async function postForm(
  fetchImpl: FetchLike,
  endpoint: string,
  fields: Record<string, string>,
): Promise<TokenResponse> {
  const r = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`token request failed (HTTP ${r.status})${detail ? `: ${detail}` : ""}`);
  }
  return (await r.json()) as TokenResponse;
}

export function exchangeCode(
  meta: AuthServerMeta,
  p: {
    code: string;
    verifier: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    resource: string;
  },
  fetchImpl: FetchLike,
): Promise<TokenResponse> {
  return postForm(fetchImpl, meta.tokenEndpoint, {
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.verifier,
    resource: p.resource,
    ...(p.clientSecret ? { client_secret: p.clientSecret } : {}),
  });
}

export function refreshTokens(
  meta: AuthServerMeta,
  p: {
    refreshToken: string;
    clientId: string;
    clientSecret?: string;
    resource: string;
  },
  fetchImpl: FetchLike,
): Promise<TokenResponse> {
  return postForm(fetchImpl, meta.tokenEndpoint, {
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
    client_id: p.clientId,
    resource: p.resource,
    ...(p.clientSecret ? { client_secret: p.clientSecret } : {}),
  });
}

function toTokens(
  meta: AuthServerMeta,
  clientId: string,
  clientSecret: string | undefined,
  scopes: string | undefined,
  res: TokenResponse,
  prevRefresh?: string,
): McpOAuthTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? prevRefresh,
    expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : undefined,
    clientId,
    clientSecret,
    tokenEndpoint: meta.tokenEndpoint,
    authorizationEndpoint: meta.authorizationEndpoint,
    scopes: res.scope ?? scopes,
  };
}

// ── loopback callback server ──────────────────────────────────────────────────

const donePage = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>Termco</title><body style="font-family:system-ui;padding:3rem;text-align:center"><h2>${msg}</h2></body>`;

async function realLoopback(): Promise<Loopback> {
  let onCode: ((code: string) => void) | undefined;
  let onErr: ((e: Error) => void) | undefined;
  let expected = "";
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (u.pathname !== "/callback") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const code = u.searchParams.get("code");
    const state = u.searchParams.get("state");
    const error = u.searchParams.get("error");
    res.setHeader("Content-Type", "text/html");
    if (error) {
      res.end(donePage(`Sign-in failed: ${error}`));
      onErr?.(new Error(`OAuth error: ${error}`));
    } else if (!code || state !== expected) {
      res.end(donePage("Sign-in failed (state mismatch)."));
      onErr?.(new Error("OAuth state mismatch"));
    } else {
      res.end(donePage("Signed in — you can close this tab and return to Termco."));
      onCode?.(code);
    }
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    waitForCode: (state, timeoutMs) =>
      new Promise<string>((resolve, reject) => {
        expected = state;
        onCode = resolve;
        onErr = reject;
        setTimeout(() => reject(new Error("OAuth sign-in timed out")), timeoutMs);
      }),
    close: () => server.close(),
  };
}

// ── orchestrators ──────────────────────────────────────────────────────────────

const defaultFetch: FetchLike = (u, init) => fetch(u, init);
const defaultOpenBrowser = async (): Promise<void> => {
  throw new Error("OAuth browser integration was not provided");
};

/** Full interactive Authorization Code + PKCE flow. Returns fresh tokens. */
export async function authorizeInteractive(
  serverUrl: string,
  opts: { clientId?: string; scopes?: string; wwwAuth?: string },
  deps: InteractiveDeps = {},
): Promise<McpOAuthTokens> {
  const fetchImpl = deps.fetchImpl ?? defaultFetch;
  const openBrowser = deps.openBrowser ?? defaultOpenBrowser;
  const progress = deps.onProgress ?? (() => {});
  const makeLoopback = deps.loopback ?? realLoopback;

  const lb = await makeLoopback();
  try {
    progress("discovering");
    const meta = await discover(serverUrl, opts.wwwAuth, fetchImpl);

    let clientId = opts.clientId;
    let clientSecret: string | undefined;
    if (!clientId) {
      if (!meta.registrationEndpoint) {
        throw new Error(
          "server needs a client_id but supports no dynamic registration",
        );
      }
      const reg = await registerClient(
        meta.registrationEndpoint,
        lb.redirectUri,
        opts.scopes,
        fetchImpl,
      );
      clientId = reg.clientId;
      clientSecret = reg.clientSecret;
    }

    const { verifier, challenge } = pkce();
    const state = randomState();
    const authUrl = buildAuthUrl(meta, {
      clientId,
      redirectUri: lb.redirectUri,
      challenge,
      state,
      scopes: opts.scopes,
      resource: serverUrl,
    });
    await openBrowser(authUrl);
    progress("waiting-for-browser");

    const code = await lb.waitForCode(state, AUTH_TIMEOUT_MS);
    progress("exchanging");
    const res = await exchangeCode(
      meta,
      {
        code,
        verifier,
        clientId,
        clientSecret,
        redirectUri: lb.redirectUri,
        resource: serverUrl,
      },
      fetchImpl,
    );
    progress("done");
    return toTokens(meta, clientId, clientSecret, opts.scopes, res);
  } catch (e) {
    progress("error");
    throw e;
  } finally {
    lb.close();
  }
}

/** Refresh an existing grant; returns fresh tokens (keeps the refresh token if
 * the server didn't rotate it). */
export async function refreshGrant(
  serverUrl: string,
  tokens: McpOAuthTokens,
  fetchImpl: FetchLike = defaultFetch,
): Promise<McpOAuthTokens> {
  if (!tokens.refreshToken) throw new Error("no refresh token");
  const meta: AuthServerMeta = {
    authorizationEndpoint: tokens.authorizationEndpoint,
    tokenEndpoint: tokens.tokenEndpoint,
  };
  const res = await refreshTokens(
    meta,
    {
      refreshToken: tokens.refreshToken,
      clientId: tokens.clientId,
      clientSecret: tokens.clientSecret,
      resource: serverUrl,
    },
    fetchImpl,
  );
  return toTokens(
    meta,
    tokens.clientId,
    tokens.clientSecret,
    tokens.scopes,
    res,
    tokens.refreshToken,
  );
}
