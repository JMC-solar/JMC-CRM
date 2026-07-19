import type { NextFunction, Request, Response } from "express";
import { sdk } from "./sdk";

/**
 * Express middleware gating plain REST routes (exports, PDFs, storage
 * minting) that sit outside the tRPC context — those routes have no auth
 * of their own today and are reachable by anyone on the internet.
 *
 * Accepts either a browser session (cookie/bearer) or an MCP bearer token —
 * these six routes are read-only, so letting an MCP-token holder fetch the
 * same document/export links the MCP pull tools hand them back doesn't
 * reopen anything. The SPA/mutation surface (tRPC, via server/_core/context.ts)
 * deliberately does NOT do this — it still rejects MCP tokens outright.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    (req as Request & { user?: typeof user }).user = user;
    return next();
  } catch {
    // fall through to the MCP check below
  }

  try {
    const user = await sdk.authenticateMcpRequest(req);
    (req as Request & { user?: typeof user }).user = user;
    return next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
