import crypto from "node:crypto";
import { fdb } from "../../firestore";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * Firestore-backed state for the OAuth 2.1 authorization server. Deliberately
 * NOT in server/mcp/catalog.ts — this is auth plumbing, not CRM data, same
 * reasoning as excluding `counters`.
 *
 * Codes and refresh tokens are stored as SHA-256 hashes, never plaintext —
 * these are opaque bearer secrets (unlike a password, high-entropy already,
 * so a fast hash is enough; no bcrypt needed).
 */

const CLIENTS = "oauth_clients";
const PENDING_AUTH = "oauth_pending_auth";
const AUTH_CODES = "oauth_auth_codes";
const REFRESH_TOKENS = "oauth_refresh_tokens";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// ============ CLIENTS ============

export async function getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
  const snap = await fdb().collection(CLIENTS).doc(clientId).get();
  if (!snap.exists) return undefined;
  return snap.data() as OAuthClientInformationFull;
}

export async function saveClient(client: OAuthClientInformationFull): Promise<void> {
  await fdb().collection(CLIENTS).doc(client.client_id).set(client);
}

// ============ PENDING AUTHORIZATION (user is mid-login) ============

export type PendingAuth = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes?: string[];
  resource?: string;
  createdAt: number;
  expiresAt: number;
};

const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

export async function savePendingAuth(data: Omit<PendingAuth, "createdAt" | "expiresAt">): Promise<string> {
  const flowId = randomToken();
  const now = Date.now();
  await fdb()
    .collection(PENDING_AUTH)
    .doc(flowId)
    .set({ ...data, createdAt: now, expiresAt: now + PENDING_AUTH_TTL_MS });
  return flowId;
}

export async function getPendingAuth(flowId: string): Promise<PendingAuth | undefined> {
  const snap = await fdb().collection(PENDING_AUTH).doc(flowId).get();
  if (!snap.exists) return undefined;
  const data = snap.data() as PendingAuth;
  if (data.expiresAt < Date.now()) return undefined;
  return data;
}

export async function deletePendingAuth(flowId: string): Promise<void> {
  await fdb().collection(PENDING_AUTH).doc(flowId).delete();
}

// ============ AUTHORIZATION CODES (single-use, short TTL) ============

export type AuthCodeRecord = {
  clientId: string;
  userId: number;
  codeChallenge: string;
  redirectUri: string;
  resource?: string;
  scopes: string[];
  createdAt: number;
  expiresAt: number;
  used: boolean;
};

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

export async function saveAuthCode(code: string, data: Omit<AuthCodeRecord, "createdAt" | "expiresAt" | "used">): Promise<void> {
  const now = Date.now();
  await fdb()
    .collection(AUTH_CODES)
    .doc(hashToken(code))
    .set({ ...data, createdAt: now, expiresAt: now + AUTH_CODE_TTL_MS, used: false });
}

export async function getAuthCode(code: string): Promise<AuthCodeRecord | undefined> {
  const snap = await fdb().collection(AUTH_CODES).doc(hashToken(code)).get();
  if (!snap.exists) return undefined;
  return snap.data() as AuthCodeRecord;
}

export async function consumeAuthCode(code: string): Promise<void> {
  await fdb().collection(AUTH_CODES).doc(hashToken(code)).set({ used: true }, { merge: true });
}

// ============ REFRESH TOKENS (long-lived, revocable) ============

export type RefreshTokenRecord = {
  clientId: string;
  userId: number;
  scopes: string[];
  resource?: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
};

const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function saveRefreshToken(
  token: string,
  data: Omit<RefreshTokenRecord, "createdAt" | "expiresAt" | "revoked">
): Promise<void> {
  const now = Date.now();
  await fdb()
    .collection(REFRESH_TOKENS)
    .doc(hashToken(token))
    .set({ ...data, createdAt: now, expiresAt: now + REFRESH_TOKEN_TTL_MS, revoked: false });
}

export async function getRefreshToken(token: string): Promise<RefreshTokenRecord | undefined> {
  const snap = await fdb().collection(REFRESH_TOKENS).doc(hashToken(token)).get();
  if (!snap.exists) return undefined;
  return snap.data() as RefreshTokenRecord;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await fdb().collection(REFRESH_TOKENS).doc(hashToken(token)).set({ revoked: true }, { merge: true });
}

export async function deleteRefreshToken(token: string): Promise<void> {
  await fdb().collection(REFRESH_TOKENS).doc(hashToken(token)).delete();
}
