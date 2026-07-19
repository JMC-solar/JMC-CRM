import crypto from "node:crypto";
import { ENV } from "../_core/env";

const CONFIRMATION_TTL_SECONDS = 300;

/**
 * Dev writes execute immediately; prod writes require the confirm round-trip
 * below. Checked via the resolved Firebase project id (same technique the
 * superseded stdio MCP plan used for its prod refusal), not NODE_ENV alone —
 * this is what actually determines which Firestore a write lands in.
 */
export function isProdEnvironment(): boolean {
  try {
    const projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}").project_id;
    return projectId !== "jmc-solar-crm-dev";
  } catch {
    // Can't resolve which project this is — fail closed and treat as prod.
    return true;
  }
}

function argsHash(args: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

function hmac(data: string): string {
  const secret = ENV.cookieSecret;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export type ConfirmationSubject = {
  tool: string;
  /** The tool's input args, MINUS confirmToken itself. */
  args: Record<string, unknown>;
  userId: number;
};

/**
 * Stateless by necessity — serverless has nowhere to keep a "used" flag.
 * The token binds tool+args-hash+user+expiry; a valid token replayed for the
 * identical args within its 5-minute TTL is an accepted residual risk, not
 * something a nonce store solves without reintroducing server-side state.
 */
export function buildConfirmation(subject: ConfirmationSubject): { confirmToken: string; expiresInSeconds: number } {
  const exp = Math.floor(Date.now() / 1000) + CONFIRMATION_TTL_SECONDS;
  const data = `${subject.tool}:${argsHash(subject.args)}:${subject.userId}:${exp}`;
  const mac = hmac(data);
  const confirmToken = Buffer.from(`${data}:${mac}`).toString("base64url");
  return { confirmToken, expiresInSeconds: CONFIRMATION_TTL_SECONDS };
}

export function verifyConfirmation(
  token: string,
  subject: ConfirmationSubject
): { ok: true } | { ok: false; reason: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "Malformed confirmToken" };
  }

  const parts = decoded.split(":");
  if (parts.length !== 5) return { ok: false, reason: "Malformed confirmToken" };
  const [tool, hash, userIdStr, expStr, mac] = parts;
  const data = `${tool}:${hash}:${userIdStr}:${expStr}`;

  const expectedMac = hmac(data);
  const macBuf = Buffer.from(mac, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return { ok: false, reason: "Invalid confirmToken signature" };
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "confirmToken has expired — call again without one to get a fresh preview" };
  }
  if (tool !== subject.tool) return { ok: false, reason: "confirmToken was issued for a different tool" };
  if (userIdStr !== String(subject.userId)) return { ok: false, reason: "confirmToken was issued for a different user" };
  if (hash !== argsHash(subject.args)) {
    return { ok: false, reason: "confirmToken doesn't match these arguments — args changed since the preview" };
  }

  return { ok: true };
}
