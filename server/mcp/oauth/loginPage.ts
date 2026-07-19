import { Router } from "express";
import bcrypt from "bcryptjs";
import { getUserByUsername } from "../../firestore-users";
import { checkLoginRateLimit } from "../rateLimit";
import * as store from "./store";

const router = Router();

function escapeHtml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, c => map[c]);
}

function renderLoginForm(flowId: string, error?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Sign in — JMC Solar CRM</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: #1e293b; padding: 32px; border-radius: 12px; width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
  h1 { font-size: 18px; margin: 0 0 4px; color: #fff; }
  p.sub { color: #94a3b8; font-size: 13px; margin: 0 0 20px; }
  label { display: block; font-size: 13px; margin-bottom: 6px; color: #cbd5e1; }
  input { width: 100%; padding: 10px; margin-bottom: 16px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; box-sizing: border-box; }
  button { width: 100%; padding: 10px; border-radius: 6px; border: none; background: #1B2A4A; color: #fff; font-weight: 600; cursor: pointer; }
  .error { background: #7f1d1d; color: #fecaca; padding: 10px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
</style>
</head>
<body>
  <div class="card">
    <h1>JMC Solar CRM</h1>
    <p class="sub">Sign in to authorize this app to access your account.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="POST" action="/oauth/login">
      <input type="hidden" name="flow" value="${escapeHtml(flowId)}" />
      <label for="username">Username</label>
      <input type="text" id="username" name="username" autocomplete="username" autofocus required />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required />
      <button type="submit">Sign in &amp; Authorize</button>
    </form>
  </div>
</body>
</html>`;
}

const EXPIRED_MESSAGE = "This authorization request has expired or is invalid. Please try connecting again from your MCP client.";

router.get("/oauth/login", async (req, res) => {
  const flowId = typeof req.query.flow === "string" ? req.query.flow : undefined;
  if (!flowId) {
    res.status(400).send("Missing flow");
    return;
  }
  const pending = await store.getPendingAuth(flowId);
  if (!pending) {
    res.status(400).send(EXPIRED_MESSAGE);
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.send(renderLoginForm(flowId));
});

router.post("/oauth/login", async (req, res) => {
  const { flow, username, password } = req.body as { flow?: string; username?: string; password?: string };
  if (!flow) {
    res.status(400).send("Missing flow");
    return;
  }

  const pending = await store.getPendingAuth(flow);
  if (!pending) {
    res.status(400).send(EXPIRED_MESSAGE);
    return;
  }

  const rateLimit = checkLoginRateLimit(req.ip ?? "unknown");
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    res.setHeader("Content-Type", "text/html");
    res.status(429).send(renderLoginForm(flow, "Too many attempts — wait a few minutes and try again."));
    return;
  }

  if (!username || !password) {
    res.setHeader("Content-Type", "text/html");
    res.send(renderLoginForm(flow, "Username and password are required"));
    return;
  }

  const user = await getUserByUsername(username);
  const validCreds = !!user && user.status === "active" && !!user.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!validCreds) {
    res.setHeader("Content-Type", "text/html");
    res.send(renderLoginForm(flow, "Invalid username or password"));
    return;
  }

  // 2FA isn't wired into this flow yet — fail closed rather than silently
  // skip the second factor an admin explicitly turned on for this account.
  if (user!.totpEnabled) {
    res.setHeader("Content-Type", "text/html");
    res.send(
      renderLoginForm(
        flow,
        "This account has 2FA enabled. OAuth sign-in for MCP connectors doesn't support 2FA yet — ask an admin to mint you a direct MCP token instead."
      )
    );
    return;
  }

  // redirectUri/client were already validated by the SDK's /authorize handler
  // before our provider.authorize() ran and created this pending-auth row —
  // no need to re-validate the redirect target here.
  const code = store.randomToken();
  await store.saveAuthCode(code, {
    clientId: pending.clientId,
    userId: user!.id,
    codeChallenge: pending.codeChallenge,
    redirectUri: pending.redirectUri,
    resource: pending.resource,
    scopes: pending.scopes ?? [],
  });
  await store.deletePendingAuth(flow);

  const redirectUrl = new URL(pending.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (pending.state) redirectUrl.searchParams.set("state", pending.state);
  res.redirect(302, redirectUrl.href);
});

export const oauthLoginRouter = router;
