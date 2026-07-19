// One-way copy: prod Firestore (jmc-crm-2e779) -> dev Firestore (jmc-solar-crm-dev).
// Reads prod creds from .env, dev creds from .env.development. NEVER writes to prod.
// Preserves document IDs (numeric, custom-string, and the counters collection).
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const ROOT = process.argv[2] || process.cwd();
const prodEnv = dotenv.parse(fs.readFileSync(path.join(ROOT, ".env")));
const devEnv = dotenv.parse(fs.readFileSync(path.join(ROOT, ".env.development")));
const prodSA = JSON.parse(prodEnv.FIREBASE_SERVICE_ACCOUNT);
const devSA = JSON.parse(devEnv.FIREBASE_SERVICE_ACCOUNT);

// --- Safety guards: refuse to run if source/dest aren't what we expect ---
const EXPECT_PROD = "jmc-crm-2e779";
const EXPECT_DEV = "jmc-solar-crm-dev";
if (prodSA.project_id !== EXPECT_PROD) throw new Error("source is not prod: " + prodSA.project_id);
if (devSA.project_id !== EXPECT_DEV) throw new Error("dest is not dev: " + devSA.project_id);
if (prodSA.project_id === devSA.project_id) throw new Error("source === dest, aborting");

const prodDb = getFirestore(initializeApp({ credential: cert(prodSA) }, "prod"));
const devDb = getFirestore(initializeApp({ credential: cert(devSA) }, "dev"));

async function copyCollection(id) {
  const snap = await prodDb.collection(id).get();
  let batch = devDb.batch();
  let ops = 0;
  let copied = 0;
  for (const doc of snap.docs) {
    // write to DEV only, same doc id, raw data (Timestamps/types preserved)
    batch.set(devDb.collection(id).doc(doc.id), doc.data());
    ops++;
    copied++;
    if (ops >= 400) {
      await batch.commit();
      batch = devDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return copied;
}

(async () => {
  const cols = await prodDb.listCollections();
  console.log(`copying ${cols.length} collections: ${prodSA.project_id} -> ${devSA.project_id}\n`);
  let total = 0;
  for (const c of cols) {
    const n = await copyCollection(c.id);
    total += n;
    console.log(`  ${c.id}: ${n}`);
  }
  console.log(`\nDONE. ${total} docs copied into ${devSA.project_id}.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
