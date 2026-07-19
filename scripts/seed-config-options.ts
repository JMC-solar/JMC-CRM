/**
 * Idempotently seeds default config_options rows into Firestore.
 * Run with: pnpm seed:config  (see package.json -> "seed:config")
 *
 * Seeds the `payment_method` category, which is read by the
 * purchase-order, project, and net-metering payment dialogs. Without these
 * rows the Payment Method dropdowns render empty. Admins can add/remove
 * further options at runtime via Settings -> Payment Methods.
 *
 * Also seeds the `withdrawal_purpose` category with "Retail Sale", so retail
 * sale stock-out transactions link to a stable option id instead of falling
 * back to a bare string. Admins can add/remove further options at runtime
 * via Settings -> Withdrawal Purposes.
 */
import "../server/_core/loadEnv";
import { listAll, insertOne } from "../server/firestore";
import type { ConfigOption } from "../server/models";

const DEFAULTS: Record<string, string[]> = {
  payment_method: ["Cash", "Check", "Bank Transfer"],
  withdrawal_purpose: ["Retail Sale"],
};

async function seedConfigOptions(): Promise<void> {
  for (const [category, values] of Object.entries(DEFAULTS)) {
    const existing = await listAll<ConfigOption>("config_options", {
      where: [["category", "==", category]],
    });
    const existingValues = new Set(existing.map(o => o.value));

    for (const [index, value] of values.entries()) {
      if (existingValues.has(value)) {
        console.log(`[SeedConfig] ${category}/"${value}" already exists`);
        continue;
      }
      await insertOne("config_options", {
        category,
        value,
        sortOrder: index,
        isActive: 1,
      });
      console.log(`[SeedConfig] ${category}/"${value}" created`);
    }
  }
}

seedConfigOptions()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("[SeedConfig] Failed to seed config options:", error);
    process.exit(1);
  });
