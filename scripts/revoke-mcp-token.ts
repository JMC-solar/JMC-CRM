/**
 * Revokes every outstanding MCP token for a user by bumping mcpTokenVersion.
 * Run with: tsx scripts/revoke-mcp-token.ts --username <username>
 *
 * Does not touch the browser session (tokenVersion) — only tokens minted via
 * scripts/mint-mcp-token.ts stop working. Re-mint afterward if the user still
 * needs agent access.
 */
import "../server/_core/loadEnv";
import { getUserByUsername, updateUser } from "../server/firestore-users";

function parseArgs(argv: string[]): { username?: string } {
  const out: { username?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--username") out.username = argv[++i];
  }
  return out;
}

async function main() {
  const { username } = parseArgs(process.argv.slice(2));
  if (!username) {
    console.error("Usage: tsx scripts/revoke-mcp-token.ts --username <username>");
    process.exit(1);
  }

  const user = await getUserByUsername(username);
  if (!user) {
    console.error(`No user found with username "${username}"`);
    process.exit(1);
  }

  const nextVersion = (user.mcpTokenVersion ?? 0) + 1;
  await updateUser(user.id, { mcpTokenVersion: nextVersion });
  console.log(`Revoked all MCP tokens for "${username}" (mcpTokenVersion now ${nextVersion}).`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[RevokeMcpToken] Failed:", error);
    process.exit(1);
  });
