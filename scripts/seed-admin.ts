/**
 * Idempotently seeds the default admin account into Firestore.
 * Run with: pnpm seed  (see package.json -> "seed": "tsx scripts/seed-admin.ts")
 *
 * Previously this ran automatically at server boot (server/localAuth.ts
 * seedDefaultAdmin). It's now a standalone, explicitly-invoked script since
 * Vercel serverless functions must not perform one-time setup work on cold
 * start.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getUserByUsername, createUser } from "../server/firestore-users";

async function seedDefaultAdmin(): Promise<void> {
  const existing = await getUserByUsername("jmcsolar");
  if (existing) {
    console.log("[SeedAdmin] Default admin account already exists");
    return;
  }

  const passwordHash = await bcrypt.hash("juanmiguel888", 12);
  const id = await createUser({
    openId: `local_admin_${nanoid(10)}`,
    username: "jmcsolar",
    passwordHash,
    name: "JMC Solar Admin",
    email: "jmcsolarph@gmail.com",
    role: "admin",
    status: "active",
    loginMethod: "local",
    lastSignedIn: new Date(),
  });
  console.log(`[SeedAdmin] Default admin account created (username: jmcsolar, id: ${id})`);
}

seedDefaultAdmin()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[SeedAdmin] Failed to seed default admin:", error);
    process.exit(1);
  });
