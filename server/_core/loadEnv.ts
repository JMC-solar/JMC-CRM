import { config } from "dotenv";

// Load base .env first, then override with .env.<NODE_ENV> if it exists.
// This keeps prod and dev isolated without duplicating whole env files:
//   - npm start  -> NODE_ENV=production -> loads .env only            -> prod Firebase
//   - npm run dev-> NODE_ENV=development -> loads .env + .env.development (override) -> dev Firebase
// .env.development only needs to contain the vars that differ (the Firebase target).
// Import this module (instead of "dotenv/config") at the top of any entrypoint.
config();

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv) {
  config({ path: `.env.${nodeEnv}`, override: true });
}

// Boot banner — make it impossible to miss which Firebase project this process
// talks to, so dev can never silently write to prod (or vice versa).
try {
  const project = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}").project_id;
  console.log(`[env] NODE_ENV=${nodeEnv ?? "(unset)"} → Firebase project: ${project ?? "(none)"}`);
} catch {
  console.log(`[env] NODE_ENV=${nodeEnv ?? "(unset)"} → Firebase project: (FIREBASE_SERVICE_ACCOUNT unparseable)`);
}
