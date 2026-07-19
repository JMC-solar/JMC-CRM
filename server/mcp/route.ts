import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { appRouter } from "../routers";
import { sdk, type AuthenticatedUser } from "../_core/sdk";
import { getUserById } from "../firestore-users";
import { HttpError } from "../../shared/_core/errors";
import { checkRateLimit } from "./rateLimit";
import { registerGenericTools } from "./tools/generic";
import { registerAnalyticsTools } from "./tools/analytics";
import { registerExportTools } from "./tools/export";
import { registerWriteTools } from "./tools/writes";
import { oauthProvider, canonicalResource } from "./oauth/provider";
import type { TrpcContext } from "../_core/context";

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

/**
 * Tier 1 (sdk-issued MCP bearer tokens, mint-mcp-token.ts) and Tier 2 (OAuth
 * 2.1 access tokens, for claude.ai/Desktop custom connectors) both land here.
 * Tier 1 is tried first since it's the cheaper check (no extra Firestore
 * lookups beyond the user itself); Tier 2 only runs if that fails.
 */
async function authenticate(req: Request): Promise<AuthenticatedUser> {
  try {
    return await sdk.authenticateMcpRequest(req);
  } catch (tier1Error) {
    const token = extractBearerToken(req);
    if (!token) throw tier1Error;

    const authInfo = await oauthProvider.verifyAccessToken(token);
    if (authInfo.resource && authInfo.resource.href !== canonicalResource()) {
      throw new HttpError(401, "Token was not issued for this resource");
    }
    const userId = authInfo.extra?.userId;
    if (typeof userId !== "number") throw new HttpError(401, "OAuth token missing userId");
    const user = await getUserById(userId);
    if (!user) throw new HttpError(401, "User not found");
    return user;
  }
}

/**
 * Absolute origin for links handed back to MCP clients (export URLs, document
 * links) — derived from the request rather than an env var so it's correct
 * in both dev and prod without separate config. Mirrors the
 * x-forwarded-proto handling in server/_core/cookies.ts#isSecureRequest,
 * since Vercel's proxy means req.protocol alone can't be trusted.
 */
function getOrigin(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto?.split(",")[0]) || req.protocol;
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.get("host");
  return `${proto}://${host}`;
}

/**
 * Mounts POST /api/mcp inside the existing Express app rather than running a
 * separate process — see .claude/plans/jiggly-rolling-zebra.md. Every request
 * gets a fresh McpServer + stateless StreamableHTTPServerTransport (no
 * sessionIdGenerator): Vercel serverless has no long-lived process to hold a
 * session in, so nothing here may depend on surviving between requests.
 */
export function registerMcpRoute(app: Express): void {
  app.post("/api/mcp", async (req: Request, res: Response) => {
    let user;
    try {
      user = await authenticate(req);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "Unauthorized";
      const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(canonicalResource()));
      res.setHeader("WWW-Authenticate", `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({ error: message });
      return;
    }

    const rateLimit = checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      res.status(429).json({ error: "Rate limit exceeded, try again shortly" });
      return;
    }

    const ctx: TrpcContext = { req, res, user };
    const caller = appRouter.createCaller(ctx);

    const server = new McpServer({ name: "jmc-solar-crm", version: "1.0.0" });
    registerGenericTools(server);
    registerAnalyticsTools(server, caller);
    registerExportTools(server, getOrigin(req));
    registerWriteTools(server, caller, user);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[MCP] request handling failed:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal MCP server error" });
      }
    }
  });
}
