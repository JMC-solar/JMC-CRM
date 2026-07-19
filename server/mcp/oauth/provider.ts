import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError, InvalidTargetError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { ENV } from "../../_core/env";
import * as store from "./store";

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour — short-lived by design, no server-side revocation for access tokens

/** The one resource this authorization server ever issues tokens for. */
export function canonicalResource(): string {
  return `${ENV.appPublicUrl}/api/mcp`;
}

function getSecret() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET environment variable is required");
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function signAccessToken(payload: {
  clientId: string;
  userId: number;
  scopes: string[];
  resource?: string;
}): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
  return new SignJWT({
    // Distinguishes Tier-2 OAuth access tokens from Tier-1 session/MCP JWTs,
    // which carry `aud` instead — different claim shape, different verifier.
    tokenType: "oauth_access",
    clientId: payload.clientId,
    userId: payload.userId,
    scopes: payload.scopes,
    resource: payload.resource,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(exp)
    .sign(getSecret());
}

function assertResourceMatches(recordResource: string | undefined, requestedResource: URL | undefined) {
  const expected = canonicalResource();
  if (recordResource && recordResource !== expected) {
    throw new InvalidTargetError("resource does not match this server");
  }
  if (requestedResource && requestedResource.href !== expected) {
    throw new InvalidTargetError("resource does not match this server");
  }
}

const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    return store.getClient(clientId);
  },
  async registerClient(clientMetadata) {
    const client_id = randomUUID();
    const isPublicClient = !clientMetadata.token_endpoint_auth_method || clientMetadata.token_endpoint_auth_method === "none";
    const full: OAuthClientInformationFull = {
      ...clientMetadata,
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(isPublicClient
        ? {}
        : { client_secret: store.randomToken(), client_secret_expires_at: 0 }),
    };
    await store.saveClient(full);
    return full;
  },
};

export const oauthProvider: OAuthServerProvider = {
  clientsStore,

  /**
   * No req access here (SDK signature only gives client/params/res) — so the
   * actual login UI can't live inline. Stash the pending request and hand
   * off to a real page at /oauth/login, which owns req.body for the POSTed
   * credentials and performs the eventual redirect back to the client itself.
   */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const flowId = await store.savePendingAuth({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes,
      resource: params.resource?.href,
    });
    res.redirect(302, `/oauth/login?flow=${flowId}`);
  },

  async challengeForAuthorizationCode(client, authorizationCode) {
    const record = await store.getAuthCode(authorizationCode);
    if (!record || record.used || record.expiresAt < Date.now() || record.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid or expired authorization code");
    }
    return record.codeChallenge;
  },

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource): Promise<OAuthTokens> {
    const record = await store.getAuthCode(authorizationCode);
    if (!record || record.used || record.expiresAt < Date.now()) {
      throw new InvalidGrantError("Invalid or expired authorization code");
    }
    if (record.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was issued to a different client");
    }
    if (redirectUri && record.redirectUri !== redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the original authorization request");
    }
    assertResourceMatches(record.resource, resource);

    await store.consumeAuthCode(authorizationCode);

    const accessToken = await signAccessToken({
      clientId: client.client_id,
      userId: record.userId,
      scopes: record.scopes,
      resource: record.resource,
    });
    const refreshToken = store.randomToken();
    await store.saveRefreshToken(refreshToken, {
      clientId: client.client_id,
      userId: record.userId,
      scopes: record.scopes,
      resource: record.resource,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: record.scopes.join(" "),
    };
  },

  async exchangeRefreshToken(client, refreshToken, scopes, resource): Promise<OAuthTokens> {
    const record = await store.getRefreshToken(refreshToken);
    if (!record || record.revoked || record.expiresAt < Date.now()) {
      throw new InvalidGrantError("Invalid, expired, or revoked refresh token");
    }
    if (record.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token was issued to a different client");
    }
    assertResourceMatches(record.resource, resource);

    // Rotate on every use — a stolen refresh token stops working the moment
    // the legitimate client uses theirs again.
    await store.revokeRefreshToken(refreshToken);
    const effectiveScopes = scopes ?? record.scopes;
    const newRefreshToken = store.randomToken();
    await store.saveRefreshToken(newRefreshToken, {
      clientId: client.client_id,
      userId: record.userId,
      scopes: effectiveScopes,
      resource: record.resource,
    });

    const accessToken = await signAccessToken({
      clientId: client.client_id,
      userId: record.userId,
      scopes: effectiveScopes,
      resource: record.resource,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
      scope: effectiveScopes.join(" "),
    };
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
      payload = result.payload as Record<string, unknown>;
    } catch {
      throw new InvalidTokenError("Invalid or expired access token");
    }
    if (payload.tokenType !== "oauth_access") {
      throw new InvalidTokenError("Not an OAuth access token");
    }
    return {
      token,
      clientId: payload.clientId as string,
      scopes: (payload.scopes as string[]) ?? [],
      expiresAt: payload.exp as number,
      resource: typeof payload.resource === "string" ? new URL(payload.resource) : undefined,
      extra: { userId: payload.userId as number },
    };
  },

  async revokeToken(client, request: OAuthTokenRevocationRequest): Promise<void> {
    const record = await store.getRefreshToken(request.token);
    if (record && record.clientId === client.client_id) {
      await store.revokeRefreshToken(request.token);
    }
    // If it's not a refresh token we know about, do nothing — per spec,
    // an invalid/unknown token is a silent no-op, not an error.
  },
};
