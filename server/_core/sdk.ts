import { COOKIE_NAME } from "../../shared/const";
import { ForbiddenError } from "../../shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../models";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  /** Distinguishes browser session cookies from MCP-issued tokens so each can be revoked independently and rejected on the other's surface. */
  aud?: "session" | "mcp";
  /** Snapshot of the user's revocation counter (tokenVersion/mcpTokenVersion) at mint time. */
  tokenVersion?: number;
};

export type AuthenticatedUser = User;

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) {
      throw new Error("JWT_SECRET environment variable is required");
    }
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a user
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    const user = await db.getUserByOpenId(openId);
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "jmc-solar-crm",
        name: options.name || "",
        aud: "session",
        tokenVersion: user?.tokenVersion ?? 0,
      },
      options
    );
  }

  /**
   * Mints a bearer token for MCP clients (Claude Code/Desktop, third-party
   * agents). Kept separate from createSessionToken: distinct audience claim,
   * distinct revocation counter (mcpTokenVersion), and callers are expected
   * to pass a short expiresInMs rather than relying on the 1-year default.
   */
  async createMcpToken(openId: string, options: { expiresInMs?: number } = {}): Promise<string> {
    const user = await db.getUserByOpenId(openId);
    if (!user) {
      throw new Error(`Cannot mint MCP token: no user with openId ${openId}`);
    }
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "jmc-solar-crm",
        name: user.name || "",
        aud: "mcp",
        tokenVersion: user.mcpTokenVersion ?? 0,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      aud: payload.aud ?? "session",
      tokenVersion: payload.tokenVersion ?? 0,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; aud: "session" | "mcp"; tokenVersion: number } | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, aud, tokenVersion } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId)) {
        console.warn("[Auth] Session payload missing openId");
        return null;
      }

      return {
        openId,
        appId: (appId as string) || "jmc-solar-crm",
        name: (name as string) || "",
        aud: aud === "mcp" ? "mcp" : "session",
        tokenVersion: typeof tokenVersion === "number" ? tokenVersion : 0,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // 1. Prefer the session cookie
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);

    // 2. Fallback to the Authorization header (for clients that store token in sessionStorage)
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    // MCP tokens are scoped to /api/mcp only — reject them here even if the
    // signature is valid, so a leaked MCP credential can't drive the app UI.
    if (session.aud === "mcp") {
      throw ForbiddenError("MCP tokens are not valid on this endpoint");
    }

    const user = await db.getUserByOpenId(session.openId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    if (session.tokenVersion !== (user.tokenVersion ?? 0)) {
      throw ForbiddenError("Session has been revoked");
    }

    // Throttle the lastSignedIn write — only bump it once every 6 hours
    // instead of on every single request, to keep write volume down.
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const lastSignedInAge = Date.now() - new Date(user.lastSignedIn).getTime();
    if (lastSignedInAge > SIX_HOURS_MS) {
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });
    }

    return user;
  }

  /**
   * Bearer-only auth for the MCP endpoint. Deliberately separate from
   * authenticateRequest: no cookie fallback (agents never hold browser
   * cookies), and it checks mcpTokenVersion rather than tokenVersion so MCP
   * credentials can be revoked without logging out the browser session.
   */
  async authenticateMcpRequest(req: Request): Promise<AuthenticatedUser> {
    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;

    const session = await this.verifySession(token);
    if (!session) {
      throw ForbiddenError("Invalid or missing MCP bearer token");
    }
    if (session.aud !== "mcp") {
      throw ForbiddenError("Token is not an MCP token");
    }

    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      throw ForbiddenError("User not found");
    }

    if (session.tokenVersion !== (user.mcpTokenVersion ?? 0)) {
      throw ForbiddenError("MCP token has been revoked");
    }

    return user;
  }
}

export const sdk = new SDKServer();
