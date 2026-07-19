/**
 * Mints a short-lived MCP bearer token for a given user.
 * Run with: tsx scripts/mint-mcp-token.ts --username <username> [--days 30]
 *
 * There is no UI for this (out of scope for the MCP plan) — this script is
 * the only way to hand a token to an agent. Re-run it to mint a fresh one;
 * use scripts/revoke-mcp-token.ts to invalidate every token issued so far
 * for that user.
 */
import "../server/_core/loadEnv";
import { getUserByUsername } from "../server/firestore-users";
import { sdk } from "../server/_core/sdk";

function parseArgs(argv: string[]): { username?: string; days: number } {
  const out: { username?: string; days: number } = { days: 30 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--username") out.username = argv[++i];
    if (argv[i] === "--days") out.days = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const { username, days } = parseArgs(process.argv.slice(2));
  if (!username) {
    console.error("Usage: tsx scripts/mint-mcp-token.ts --username <username> [--days 30]");
    process.exit(1);
  }
  if (!Number.isFinite(days) || days <= 0) {
    console.error(`Invalid --days value: ${days}`);
    process.exit(1);
  }

  const user = await getUserByUsername(username);
  if (!user) {
    console.error(`No user found with username "${username}"`);
    process.exit(1);
  }
  if (user.status !== "active") {
    console.error(`User "${username}" is not active (status: ${user.status})`);
    process.exit(1);
  }

  const expiresInMs = days * 24 * 60 * 60 * 1000;
  const token = await sdk.createMcpToken(user.openId, { expiresInMs });

  console.log(`\nMCP token for "${username}" (role: ${user.role}), expires in ${days} day(s):\n`);
  console.log(token);
  console.log(`\nUse as: Authorization: Bearer <token>`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[MintMcpToken] Failed:", error);
    process.exit(1);
  });
