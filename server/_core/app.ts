import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { registerStorageProxy } from "./storageProxy";
import { registerMcpRoute } from "../mcp/route";
import { oauthProvider } from "../mcp/oauth/provider";
import { oauthLoginRouter } from "../mcp/oauth/loginPage";
import { appRouter } from "../routers";
import { quotationPdfRouter } from "../quotationPdf";
import { documentPdfRouter } from "../documentPdf";
import { localAuthRouter } from "../localAuth";
import { exportRouter } from "../exportRouter";
import { poPdfRouter } from "../poPdf";
import { retailPdfRouter } from "../retailPdf";
import { netMeteringBillingPdfRouter } from "../netMeteringBillingPdf";
import { projectBillingPdfRouter } from "../projectBillingPdf";
import { createContext } from "./context";
import { ENV } from "./env";

/**
 * Builds the Express app shared by both the local dev server
 * (server/_core/index.ts) and the Vercel serverless entrypoint (api/index.ts).
 * No Vite, no static file serving, no `listen()`, no boot-time seeding —
 * those are either dev-only or handled by scripts/seed-admin.ts.
 */
export function createApp(): Express {
  const app = express();

  // Body size limit reduced from the old self-hosted default (50mb) — Vercel
  // serverless functions have their own payload limits, and file uploads now
  // go through Firebase Storage rather than base64-in-JSON.
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ limit: "4mb", extended: true }));

  registerStorageProxy(app);
  registerMcpRoute(app);

  // OAuth 2.1 authorization server for claude.ai/Desktop custom connectors
  // (Tier 2 — see .claude/plans/jiggly-rolling-zebra.md). Tier 1 bearer
  // tokens (mint-mcp-token.ts) keep working unchanged; this is additive.
  // MUST be mounted at the application root per the SDK's own requirement.
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(ENV.appPublicUrl),
      resourceServerUrl: new URL(`${ENV.appPublicUrl}/api/mcp`),
      resourceName: "JMC Solar CRM",
      scopesSupported: [],
    })
  );
  app.use(oauthLoginRouter);

  app.use(quotationPdfRouter);
  app.use(documentPdfRouter);
  app.use(localAuthRouter);
  app.use(exportRouter);
  app.use(poPdfRouter);
  app.use(retailPdfRouter);
  app.use(netMeteringBillingPdfRouter);
  app.use(projectBillingPdfRouter);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.get("/api/health", async (_req, res) => {
    let firestore: { ok: true } | { ok: false; error: string };
    try {
      const { fdb } = await import("../firestore");
      await fdb().listCollections();
      firestore = { ok: true };
    } catch (error) {
      firestore = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    res.json({ ok: true, firestore });
  });

  return app;
}
