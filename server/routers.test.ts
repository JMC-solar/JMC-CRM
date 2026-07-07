import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// The users router is backed by Firestore (server/firestore-users.ts), which
// requires live FIREBASE_SERVICE_ACCOUNT credentials. Mock it here so these
// unit tests don't depend on network access / real cloud credentials.
vi.mock("./firestore-users", () => ({
  getUserById: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByResetToken: vi.fn(),
  listUsersRaw: vi.fn().mockResolvedValue([]),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

// The CRM (leads/contacts/accounts/opportunities/activities/config/suppliers)
// and other Firestore-backed routers share server/firestore.ts, which also
// requires live FIREBASE_SERVICE_ACCOUNT credentials. Mock it here so these
// unit tests don't depend on network access / real cloud credentials.
vi.mock("./firestore", () => ({
  audit: vi.fn().mockResolvedValue(undefined),
  listAll: vi.fn().mockResolvedValue([]),
  listPaginated: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
  getById: vi.fn().mockResolvedValue(undefined),
  insertOne: vi.fn().mockResolvedValue(1),
  updateOne: vi.fn().mockResolvedValue(undefined),
  deleteOne: vi.fn().mockResolvedValue(undefined),
  insertMany: vi.fn().mockResolvedValue([]),
  allocateIds: vi.fn().mockResolvedValue(1),
  docToData: vi.fn((snap: any) => ({ ...snap.data(), id: Number(snap.id) })),
  fdb: vi.fn(),
}));

import * as firestore from "./firestore";

// Minimal in-memory fake of the pieces of the Firestore Admin SDK that the
// inventory/stock/bom routers drive directly (fdb().batch()/.runTransaction()
// for atomic read-modify-write of stock levels). Docs are keyed by String(id).
function createFakeFirestore(seed: Record<string, Record<string, any>> = {}) {
  const store = new Map<string, Map<string, any>>();
  for (const [collName, docs] of Object.entries(seed)) {
    store.set(collName, new Map(Object.entries(docs).map(([id, data]) => [id, { ...data }])));
  }
  function collMap(name: string) {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  }
  function makeDocRef(collName: string, id: string) {
    return {
      _coll: collName,
      id,
      async get() {
        const data = collMap(collName).get(id);
        return { exists: data !== undefined, id, data: () => (data ? { ...data } : undefined) };
      },
    };
  }
  const db: any = {
    collection(name: string) {
      return { doc: (id: string) => makeDocRef(name, id) };
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        set(ref: any, data: any) {
          ops.push(() => collMap(ref._coll).set(ref.id, { ...data }));
        },
        async commit() {
          ops.forEach(op => op());
        },
      };
    },
    async runTransaction(fn: (tx: any) => Promise<any>) {
      const tx = {
        async get(ref: any) {
          return ref.get();
        },
        set(ref: any, data: any, opts?: { merge?: boolean }) {
          const c = collMap(ref._coll);
          if (opts?.merge) {
            c.set(ref.id, { ...(c.get(ref.id) ?? {}), ...data });
          } else {
            c.set(ref.id, { ...data });
          }
        },
      };
      return fn(tx);
    },
  };
  return { db, store };
}

function dumpColl(store: Map<string, Map<string, any>>, name: string) {
  return Array.from((store.get(name) ?? new Map()).entries()).map(([id, data]) => ({ id, ...data }));
}

function createAuthContext(role: "admin" | "subadmin" | "purchaser" | "staff" | "sales_rep" = "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-123",
      email: "test@jmcsolar.com",
      name: "Test User",
      loginMethod: "local",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("appRouter", () => {
  describe("auth.me", () => {
    it("returns null for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeNull();
    });

    it("returns user for authenticated users", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.me();
      expect(result).toBeDefined();
      expect(result?.name).toBe("Test User");
      expect(result?.role).toBe("admin");
    });
  });

  describe("auth.logout", () => {
    it("clears cookie and returns success", async () => {
      const clearedCookies: string[] = [];
      const ctx: TrpcContext = {
        ...createAuthContext(),
        res: {
          clearCookie: (name: string) => { clearedCookies.push(name); },
        } as TrpcContext["res"],
      };
      const caller = appRouter.createCaller(ctx);
      const result = await caller.auth.logout();
      expect(result).toEqual({ success: true });
      expect(clearedCookies.length).toBe(1);
    });
  });

  describe("protected procedures", () => {
    it("leads.list throws for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.leads.list({ search: "" })).rejects.toThrow();
    });

    it("contacts.list throws for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.contacts.list({ search: "" })).rejects.toThrow();
    });

    it("inventory.list throws for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.inventory.list({ search: "" })).rejects.toThrow();
    });
  });

  describe("admin procedures", () => {
    it("users.list works for subadmin (returns their own users)", async () => {
      const ctx = createAuthContext("subadmin");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.users.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("users.list throws for unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.users.list()).rejects.toThrow();
    });

    it("users.list returns empty for restricted roles (purchaser, staff, sales_rep)", async () => {
      const ctx = createAuthContext("purchaser");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.users.list();
      expect(result).toEqual([]);
    });
  });

  // ============ DASHBOARD ============
  describe("dashboard", () => {
    beforeEach(() => {
      vi.mocked(firestore.listAll).mockReset();
      vi.mocked(firestore.fdb).mockReset();
    });

    function mockAggregateCounts(counts: Record<string, number>) {
      const db: any = {
        collection(name: string) {
          return {
            count() {
              return { async get() { return { data: () => ({ count: counts[name] ?? 0 }) }; } };
            },
          };
        },
      };
      vi.mocked(firestore.fdb).mockReturnValue(db);
    }

    it("stats aggregates counts, SUMs, and the reorderLevel low-stock compare in memory, gating revenue by role", async () => {
      mockAggregateCounts({ leads: 3, contacts: 4, quotations: 5 });
      vi.mocked(firestore.listAll).mockImplementation(async (coll: any) => {
        if (coll === "opportunities") return [
          { id: 1, status: "new", value: "100.00" },
          { id: 2, status: "won", value: "200.00" },
          { id: 3, status: "lost", value: "300.00" },
          { id: 4, status: "proposal", value: "50.50" },
        ] as any;
        if (coll === "inventory_items") return [
          { id: 1, stockOnHand: 2, reorderLevel: 5, sellingPrice: "10.00" }, // low stock
          { id: 2, stockOnHand: 10, reorderLevel: 5, sellingPrice: "20.00" }, // not low
          { id: 3, stockOnHand: 1, reorderLevel: null, sellingPrice: "5.00" }, // null reorderLevel never counts as low
        ] as any;
        if (coll === "project_payments") return [
          { id: 1, amount: "500.00" },
          { id: 2, amount: "250.25" },
        ] as any;
        return [];
      });

      const adminResult = await appRouter.createCaller(createAuthContext("admin")).dashboard.stats();
      expect(adminResult).toEqual({
        totalLeads: 3,
        totalOpportunities: 4,
        totalInventoryItems: 3,
        totalQuotations: 5,
        pipelineValue: "150.50", // new(100) + proposal(50.50); excludes won/lost
        wonDeals: 1,
        totalContacts: 4,
        lowStockItems: 1,
        conversionRate: 25, // 1 won / 4 total
        totalRevenue: "750.25",
        inventoryValue: "225.00", // 2*10 + 10*20 + 1*5
      });

      const staffResult = await appRouter.createCaller(createAuthContext("staff")).dashboard.stats();
      expect(staffResult.totalRevenue).toBe("0");
    });

    it("pipelineBreakdown groups opportunities by status via an in-memory reduce", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { status: "new" }, { status: "new" }, { status: "won" },
      ] as any);
      const result = await appRouter.createCaller(createAuthContext()).dashboard.pipelineBreakdown();
      expect(firestore.listAll).toHaveBeenCalledWith("opportunities", { select: ["status"] });
      expect(result).toEqual([{ status: "new", count: 2 }, { status: "won", count: 1 }]);
    });

    it("inventoryByCategory groups by category with counts and summed stock", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { category: "panels", stockOnHand: 5 },
        { category: "panels", stockOnHand: 3 },
        { category: "inverters", stockOnHand: 2 },
      ] as any);
      const result = await appRouter.createCaller(createAuthContext()).dashboard.inventoryByCategory();
      expect(firestore.listAll).toHaveBeenCalledWith("inventory_items", { select: ["category", "stockOnHand"] });
      expect(result).toEqual([
        { category: "panels", count: 2, totalStock: 8 },
        { category: "inverters", count: 1, totalStock: 2 },
      ]);
    });

    it("revenueByMonth is admin-gated and groups+sorts ascending capped at 12 months", async () => {
      const staffResult = await appRouter.createCaller(createAuthContext("staff")).dashboard.revenueByMonth();
      expect(staffResult).toEqual([]);
      expect(firestore.listAll).not.toHaveBeenCalled();

      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { paymentDate: new Date("2024-02-15"), amount: "100.00" },
        { paymentDate: new Date("2024-01-10"), amount: "50.00" },
        { paymentDate: new Date("2024-01-20"), amount: "25.00" },
      ] as any);
      const result = await appRouter.createCaller(createAuthContext("admin")).dashboard.revenueByMonth();
      expect(firestore.listAll).toHaveBeenCalledWith("project_payments", { select: ["paymentDate", "amount"] });
      expect(result).toEqual([
        { month: "2024-01", revenue: 75, count: 2 },
        { month: "2024-02", revenue: 100, count: 1 },
      ]);
    });

    it("leadConversion zero-fills all six statuses", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { status: "new" }, { status: "new" }, { status: "won" },
      ] as any);
      const result = await appRouter.createCaller(createAuthContext()).dashboard.leadConversion();
      expect(firestore.listAll).toHaveBeenCalledWith("leads", { select: ["status"] });
      expect(result).toEqual([
        { status: "new", count: 2 },
        { status: "contacted", count: 0 },
        { status: "qualified", count: 0 },
        { status: "proposal", count: 0 },
        { status: "won", count: 1 },
        { status: "lost", count: 0 },
      ]);
    });
  });

  // ============ CRM Firestore routers (Batch 2a) ============
  describe("leads/contacts/accounts/opportunities/activities/config/suppliers", () => {
    beforeEach(() => {
      vi.mocked(firestore.listPaginated).mockReset().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 });
      vi.mocked(firestore.listAll).mockReset().mockResolvedValue([]);
      vi.mocked(firestore.getById).mockReset().mockResolvedValue(undefined);
      vi.mocked(firestore.insertOne).mockReset().mockResolvedValue(1);
      vi.mocked(firestore.updateOne).mockReset().mockResolvedValue(undefined);
      vi.mocked(firestore.deleteOne).mockReset().mockResolvedValue(undefined);
      vi.mocked(firestore.audit).mockReset().mockResolvedValue(undefined);
    });

    it("leads.list forwards search/status/pagination to listPaginated with matching searchFields", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.leads.list({ search: "acme", status: "new", page: 2, limit: 10 });
      expect(firestore.listPaginated).toHaveBeenCalledWith("leads", {
        search: "acme",
        searchFields: ["firstName", "lastName", "company", "email", "phone", "source", "systemSize", "notes"],
        filters: [["status", "==", "new"]],
        page: 2,
        limit: 10,
      });
    });

    it("leads.create inserts with default status and audits without an entityId (matches prior behavior)", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.leads.create({ firstName: "Ada" });
      expect(result).toEqual({ success: true });
      expect(firestore.insertOne).toHaveBeenCalledWith("leads", expect.objectContaining({
        firstName: "Ada",
        lastName: null,
        status: "new",
        contactId: null,
        accountId: null,
        assignedTo: null,
        createdBy: ctx.user!.id,
      }));
      expect(firestore.audit).toHaveBeenCalledWith(ctx.user!.id, ctx.user!.name, "create", "lead", undefined, "Created lead: Ada");
    });

    it("leads.update audits with the entityId", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.leads.update({ id: 5, firstName: "Ada" });
      expect(firestore.updateOne).toHaveBeenCalledWith("leads", 5, expect.objectContaining({ firstName: "Ada", status: "new" }));
      expect(firestore.audit).toHaveBeenCalledWith(ctx.user!.id, ctx.user!.name, "update", "lead", 5, "Updated lead: Ada");
    });

    it("contacts.update does not audit (matches prior behavior)", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.contacts.update({ id: 3, firstName: "Bob" });
      expect(firestore.updateOne).toHaveBeenCalledWith("contacts", 3, { firstName: "Bob" });
      expect(firestore.audit).not.toHaveBeenCalled();
    });

    it("accounts.listAll sorts by name ascending and projects id/name only", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 2, name: "Zeta Corp" },
        { id: 1, name: "Acme Corp" },
      ] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.accounts.listAll();
      expect(firestore.listAll).toHaveBeenCalledWith("accounts");
      expect(result).toEqual([
        { id: 1, name: "Acme Corp" },
        { id: 2, name: "Zeta Corp" },
      ]);
    });

    it("opportunities.list unwraps listPaginated into a flat array capped at 200", async () => {
      vi.mocked(firestore.listPaginated).mockResolvedValueOnce({
        items: [{ id: 1, title: "Solar deal", status: "new" }],
        total: 1, page: 1, limit: 200, totalPages: 1,
      } as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.opportunities.list({ status: "new" });
      expect(firestore.listPaginated).toHaveBeenCalledWith("opportunities", expect.objectContaining({
        filters: [["status", "==", "new"]],
        page: 1,
        limit: 200,
      }));
      expect(result).toEqual([{ id: 1, title: "Solar deal", status: "new" }]);
    });

    it("activities.list replicates the DATE_FORMAT(scheduledAt) LIKE search in-memory", async () => {
      const now = new Date();
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 1, subject: "Unrelated", description: null, scheduledAt: new Date("2025-03-15T00:00:00Z"), createdAt: now },
        { id: 2, subject: "Also unrelated", description: null, scheduledAt: new Date("2025-06-01T00:00:00Z"), createdAt: now },
      ] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.activities.list({ search: "2025-03-15" });
      expect(result).toEqual([
        expect.objectContaining({ id: 1 }),
      ]);
    });

    it("config.getOptions filters by category/isActive and sorts by sortOrder (nulls first)", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 1, category: "source", value: "Referral", sortOrder: 2, isActive: 1 },
        { id: 2, category: "source", value: "Website", sortOrder: null, isActive: 1 },
        { id: 3, category: "source", value: "Ads", sortOrder: 1, isActive: 1 },
      ] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.config.getOptions({ category: "source" });
      expect(firestore.listAll).toHaveBeenCalledWith("config_options", {
        where: [["category", "==", "source"], ["isActive", "==", 1]],
      });
      expect(result.map((o: any) => o.id)).toEqual([2, 3, 1]);
    });

    it("suppliers.getItemPrices joins supplier_item_prices with inventory_items by id", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 1, supplierId: 9, inventoryItemId: 100, unitPrice: "10.00", updatedAt: new Date(0) },
      ] as any);
      vi.mocked(firestore.getById).mockResolvedValueOnce({
        id: 100, name: "Panel", sku: "PNL-1", purchasePrice: "9.00", unit: "pcs",
      } as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.suppliers.getItemPrices({ supplierId: 9 });
      expect(firestore.listAll).toHaveBeenCalledWith("supplier_item_prices", { where: [["supplierId", "==", 9]] });
      expect(firestore.getById).toHaveBeenCalledWith("inventory_items", 100);
      expect(result).toEqual([
        expect.objectContaining({ id: 1, item: expect.objectContaining({ id: 100, name: "Panel", sku: "PNL-1" }) }),
      ]);
    });

    it("suppliers.getItemPrices returns [] without fetching items when supplier has no prices", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.suppliers.getItemPrices({ supplierId: 42 });
      expect(result).toEqual([]);
      expect(firestore.getById).not.toHaveBeenCalled();
    });
  });
});

// ============ Inventory / Stock / BOM Firestore routers (Batch 2b) ============
describe("inventory/stockTransactions/bom/stockAdjustments/inventoryAudit", () => {
  let nextId = 1000;

  beforeEach(() => {
    nextId = 1000;
    vi.mocked(firestore.listPaginated).mockReset().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    vi.mocked(firestore.listAll).mockReset().mockResolvedValue([]);
    vi.mocked(firestore.getById).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.insertOne).mockReset().mockResolvedValue(1);
    vi.mocked(firestore.updateOne).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.deleteOne).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.insertMany).mockReset().mockResolvedValue([]);
    vi.mocked(firestore.allocateIds).mockReset().mockImplementation(async () => nextId++);
    vi.mocked(firestore.audit).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.docToData).mockReset().mockImplementation((snap: any) => ({ ...snap.data(), id: Number(snap.id) }));
    vi.mocked(firestore.fdb).mockReset();
  });

  describe("inventory", () => {
    it("listAll sorts by name ascending and requests only the projected fields", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 2, name: "Zeta Panel" },
        { id: 1, name: "Acme Panel" },
      ] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inventory.listAll();
      expect(firestore.listAll).toHaveBeenCalledWith("inventory_items", {
        select: ["name", "sku", "category", "brand", "model", "unit", "purchasePrice", "sellingPrice", "stockOnHand"],
      });
      expect(result.map((i: any) => i.id)).toEqual([1, 2]);
    });

    it("priceHistory sorts newest-first and caps at 100", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 1, itemId: 5, createdAt: new Date("2024-01-01") },
        { id: 2, itemId: 5, createdAt: new Date("2024-06-01") },
      ] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inventory.priceHistory({ itemId: 5 });
      expect(firestore.listAll).toHaveBeenCalledWith("item_price_history", { where: [["itemId", "==", 5]] });
      expect(result.map((r: any) => r.id)).toEqual([2, 1]);
    });

    it("create (admin, with initial stock) batches the item + an 'initial' inventory_audit_log row", async () => {
      const { db, store } = createFakeFirestore();
      vi.mocked(firestore.fdb).mockReturnValue(db);
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inventory.create({ sku: "SKU-1", name: "Panel", category: "panels", stockOnHand: 20 });
      expect(result).toEqual({ success: true });

      const items = dumpColl(store, "inventory_items");
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ sku: "SKU-1", stockOnHand: 20 });

      const auditRows = dumpColl(store, "inventory_audit_log");
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({ transactionType: "initial", previousStock: 0, newStock: 20 });
      expect(firestore.audit).toHaveBeenCalledWith(ctx.user!.id, ctx.user!.name, "create", "inventory", items[0].id, "Added item: Panel");
    });

    it("create (non-admin) forces stockOnHand to 0 and writes no audit log row", async () => {
      const { db, store } = createFakeFirestore();
      vi.mocked(firestore.fdb).mockReturnValue(db);
      const ctx = createAuthContext("staff");
      const caller = appRouter.createCaller(ctx);
      await caller.inventory.create({ sku: "SKU-2", name: "Battery", category: "batteries", stockOnHand: 50 });
      const items = dumpColl(store, "inventory_items");
      expect(items[0].stockOnHand).toBe(0);
      expect(dumpColl(store, "inventory_audit_log")).toHaveLength(0);
    });

    it("update records price history rows only for prices that actually changed", async () => {
      vi.mocked(firestore.getById).mockResolvedValueOnce({
        id: 7, name: "Old", sku: "SK", stockOnHand: 10, purchasePrice: "5.00", sellingPrice: "9.00",
      } as any);
      const ctx = createAuthContext("staff");
      const caller = appRouter.createCaller(ctx);
      await caller.inventory.update({ id: 7, sku: "SK", name: "New", category: "panels", purchasePrice: "6.00", sellingPrice: "9.00" });
      expect(firestore.insertOne).toHaveBeenCalledWith("item_price_history", expect.objectContaining({ itemId: 7, priceType: "purchase", oldPrice: "5.00", newPrice: "6.00" }));
      expect(firestore.insertOne).not.toHaveBeenCalledWith("item_price_history", expect.objectContaining({ priceType: "selling" }));
      expect(firestore.updateOne).toHaveBeenCalledWith("inventory_items", 7, expect.objectContaining({ name: "New", category: "panels" }));
    });

    it("update (admin, stockOnHand changed) updates the item and writes an adjustment audit row transactionally", async () => {
      const { db, store } = createFakeFirestore({
        inventory_items: { "9": { id: 9, name: "Inv", sku: "IV", stockOnHand: 5, purchasePrice: "1.00", sellingPrice: "2.00" } },
      });
      vi.mocked(firestore.fdb).mockReturnValue(db);
      vi.mocked(firestore.getById).mockResolvedValueOnce({ id: 9, name: "Inv", sku: "IV", stockOnHand: 5, purchasePrice: "1.00", sellingPrice: "2.00" } as any);
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);
      await caller.inventory.update({ id: 9, sku: "IV", name: "Inv", category: "panels", purchasePrice: "1.00", sellingPrice: "2.00", stockOnHand: 8 });

      const item = dumpColl(store, "inventory_items").find((i: any) => i.id === 9);
      expect(item?.stockOnHand).toBe(8);

      const auditRows = dumpColl(store, "inventory_audit_log");
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({ transactionType: "adjustment", previousStock: 5, newStock: 8, quantity: 3 });
    });

    it("delete blocks non-admin and audits for admin", async () => {
      const staffCtx = createAuthContext("staff");
      const staffCaller = appRouter.createCaller(staffCtx);
      await expect(staffCaller.inventory.delete({ id: 1 })).rejects.toThrow(/admin/i);

      const adminCtx = createAuthContext("admin");
      const adminCaller = appRouter.createCaller(adminCtx);
      await adminCaller.inventory.delete({ id: 1 });
      expect(firestore.deleteOne).toHaveBeenCalledWith("inventory_items", 1);
      expect(firestore.audit).toHaveBeenCalledWith(adminCtx.user!.id, adminCtx.user!.name, "delete", "inventory", 1, "Deleted item #1");
    });
  });

  describe("stockTransactions", () => {
    it("list joins transactions with item names via an in-memory Map, sorted desc and capped at 200", async () => {
      vi.mocked(firestore.listAll)
        .mockResolvedValueOnce([
          { id: 1, itemId: 5, type: "stock_in", quantity: 3, createdAt: new Date("2024-01-01") },
          { id: 2, itemId: 5, type: "stock_out", quantity: 1, createdAt: new Date("2024-06-01") },
        ] as any)
        .mockResolvedValueOnce([{ id: 5, name: "Panel" }] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.stockTransactions.list();
      expect(result.map((r: any) => r.id)).toEqual([2, 1]);
      expect((result[0] as any).itemName).toBe("Panel");
    });

    it("create (stock_in) updates stockOnHand and writes a transaction + audit row atomically", async () => {
      const { db, store } = createFakeFirestore({
        inventory_items: { "1": { id: 1, name: "Panel", sku: "PNL", stockOnHand: 10, warehouseLocation: "WH-A" } },
      });
      vi.mocked(firestore.fdb).mockReturnValue(db);
      const ctx = createAuthContext("staff");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.stockTransactions.create({ itemId: 1, type: "stock_in", quantity: 5 });
      expect(result).toEqual({ success: true });

      const item = dumpColl(store, "inventory_items").find((i: any) => i.id === 1);
      expect(item?.stockOnHand).toBe(15);

      const txns = dumpColl(store, "stock_transactions");
      expect(txns).toHaveLength(1);
      expect(txns[0]).toMatchObject({ itemId: 1, type: "stock_in", quantity: 5 });

      const auditRows = dumpColl(store, "inventory_audit_log");
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({ previousStock: 10, newStock: 15, transactionType: "stock_in" });
      expect(firestore.audit).toHaveBeenCalled();
    });

    it("create blocks non-admin from the 'adjustment' type", async () => {
      const ctx = createAuthContext("staff");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.stockTransactions.create({ itemId: 1, type: "adjustment", quantity: 1 })).rejects.toThrow(/admin/i);
    });

    it("transfer throws when quantity exceeds current stock", async () => {
      vi.mocked(firestore.getById).mockResolvedValueOnce({ id: 1, stockOnHand: 3 } as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.stockTransactions.transfer({ itemId: 1, quantity: 5, sourceLocation: "A", destinationLocation: "B" })).rejects.toThrow(/insufficient/i);
    });

    it("transfer writes 2 stock_transactions rows + 2 audit rows leaving stock unchanged", async () => {
      vi.mocked(firestore.getById).mockResolvedValueOnce({ id: 1, name: "Panel", sku: "PNL", stockOnHand: 10 } as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.stockTransactions.transfer({ itemId: 1, quantity: 4, sourceLocation: "A", destinationLocation: "B" });
      expect(firestore.insertMany).toHaveBeenNthCalledWith(1, "stock_transactions", expect.arrayContaining([
        expect.objectContaining({ type: "stock_out", quantity: 4 }),
        expect.objectContaining({ type: "stock_in", quantity: 4 }),
      ]));
      expect(firestore.insertMany).toHaveBeenNthCalledWith(2, "inventory_audit_log", expect.arrayContaining([
        expect.objectContaining({ transactionType: "transfer_out", previousStock: 10, newStock: 10 }),
        expect.objectContaining({ transactionType: "transfer_in", previousStock: 10, newStock: 10 }),
      ]));
    });
  });

  describe("bom", () => {
    it("list sorts newest-first and caps at 200", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 1, name: "A", createdAt: new Date("2024-01-01") },
        { id: 2, name: "B", createdAt: new Date("2024-06-01") },
      ] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.bom.list();
      expect(result.map((r: any) => r.id)).toEqual([2, 1]);
    });

    it("getItems joins bom_package_items with inventory_items by id", async () => {
      vi.mocked(firestore.listAll)
        .mockResolvedValueOnce([{ id: 1, packageId: 4, itemId: 9, quantity: 2 }] as any)
        .mockResolvedValueOnce([{ id: 9, name: "Panel", sku: "PNL", sellingPrice: "100.00" }] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.bom.getItems({ packageId: 4 });
      expect(result).toEqual([expect.objectContaining({ id: 1, itemName: "Panel", itemSku: "PNL", sellingPrice: "100.00" })]);
    });

    it("addItem recalculates totalCost as quantity * sellingPrice via the money() helper", async () => {
      vi.mocked(firestore.listAll)
        .mockResolvedValueOnce([{ id: 1, packageId: 4, itemId: 9, quantity: 3 }] as any)
        .mockResolvedValueOnce([{ id: 9, sellingPrice: "10.50" }] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.bom.addItem({ packageId: 4, itemId: 9, quantity: 3 });
      expect(firestore.insertOne).toHaveBeenCalledWith("bom_package_items", { packageId: 4, itemId: 9, quantity: 3 });
      expect(firestore.updateOne).toHaveBeenCalledWith("bom_packages", 4, { totalCost: "31.50" });
    });

    it("delete removes all package items then the package itself, and audits", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([{ id: 1, packageId: 4 }, { id: 2, packageId: 4 }] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.bom.delete({ id: 4 });
      expect(firestore.deleteOne).toHaveBeenCalledWith("bom_package_items", 1);
      expect(firestore.deleteOne).toHaveBeenCalledWith("bom_package_items", 2);
      expect(firestore.deleteOne).toHaveBeenCalledWith("bom_packages", 4);
      expect(firestore.audit).toHaveBeenCalledWith(ctx.user!.id, ctx.user!.name, "delete", "bom_package", 4, "Deleted BOM #4");
    });
  });

  describe("stockAdjustments", () => {
    it("list restricts non-admin requesters to their own rows and joins item name/sku", async () => {
      vi.mocked(firestore.listAll)
        .mockResolvedValueOnce([{ id: 1, itemId: 9, requestedBy: 1, createdAt: new Date() }] as any)
        .mockResolvedValueOnce([{ id: 9, name: "Panel", sku: "PNL" }] as any);
      const ctx = createAuthContext("staff");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.stockAdjustments.list({});
      expect(firestore.listAll).toHaveBeenCalledWith("stock_adjustments", { where: [["requestedBy", "==", 1]] });
      expect(result[0]).toMatchObject({ itemName: "Panel", itemSku: "PNL" });
    });

    it("request (non-admin) inserts a pending row without mutating stock", async () => {
      vi.mocked(firestore.getById).mockResolvedValueOnce({ id: 9, stockOnHand: 10 } as any);
      const ctx = createAuthContext("staff");
      const caller = appRouter.createCaller(ctx);
      await caller.stockAdjustments.request({ itemId: 9, newQuantity: 15, reason: "recount" });
      expect(firestore.insertOne).toHaveBeenCalledWith("stock_adjustments", expect.objectContaining({
        status: "pending", previousQuantity: 10, newQuantity: 15, adjustmentQuantity: 5,
      }));
      expect(firestore.fdb).not.toHaveBeenCalled();
    });

    it("request (admin) applies immediately via a transaction", async () => {
      const { db, store } = createFakeFirestore({ inventory_items: { "9": { id: 9, name: "Panel", sku: "PNL", stockOnHand: 10 } } });
      vi.mocked(firestore.fdb).mockReturnValue(db);
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);
      await caller.stockAdjustments.request({ itemId: 9, newQuantity: 15, reason: "recount" });

      const item = dumpColl(store, "inventory_items").find((i: any) => i.id === 9);
      expect(item?.stockOnHand).toBe(15);
      const adjustments = dumpColl(store, "stock_adjustments");
      expect(adjustments[0]).toMatchObject({ status: "approved", previousQuantity: 10, newQuantity: 15 });
      const auditRows = dumpColl(store, "inventory_audit_log");
      expect(auditRows[0]).toMatchObject({ previousStock: 10, newStock: 15 });
    });

    it("approve applies a pending adjustment and rejects re-approval", async () => {
      const { db, store } = createFakeFirestore({
        stock_adjustments: { "1": { id: 1, itemId: 9, previousQuantity: 10, newQuantity: 20, adjustmentQuantity: 10, reason: "recount", status: "pending" } },
        inventory_items: { "9": { id: 9, name: "Panel", sku: "PNL", stockOnHand: 10 } },
      });
      vi.mocked(firestore.fdb).mockReturnValue(db);
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);
      await caller.stockAdjustments.approve({ id: 1 });

      const item = dumpColl(store, "inventory_items").find((i: any) => i.id === 9);
      expect(item?.stockOnHand).toBe(20);
      const adj = dumpColl(store, "stock_adjustments").find((a: any) => a.id === 1);
      expect(adj?.status).toBe("approved");

      await expect(caller.stockAdjustments.approve({ id: 1 })).rejects.toThrow(/already processed|not found/i);
    });

    it("reject requires a pending status", async () => {
      vi.mocked(firestore.getById).mockResolvedValueOnce({ id: 1, status: "approved" } as any);
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.stockAdjustments.reject({ id: 1 })).rejects.toThrow(/already processed|not found/i);
    });
  });

  describe("inventoryAudit", () => {
    it("list applies transactionType/date filters server-side and search in-memory", async () => {
      const rows = [
        { id: 1, itemId: 9, itemName: "Panel", itemSku: "PNL", performedByName: "Alice", reference: null, purpose: null, transactionType: "stock_in", createdAt: new Date("2024-01-01") },
        { id: 2, itemId: 9, itemName: "Battery", itemSku: "BAT", performedByName: "Bob", reference: null, purpose: null, transactionType: "stock_in", createdAt: new Date("2024-06-01") },
      ];
      vi.mocked(firestore.listAll).mockResolvedValueOnce(rows as any);
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.inventoryAudit.list({ search: "panel" });
      expect(firestore.listAll).toHaveBeenCalledWith("inventory_audit_log", { where: [] });
      expect(result.map((r: any) => r.id)).toEqual([1]);
    });

    it("list restricts non-admin/subadmin to their own performedBy rows", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([]);
      const ctx = createAuthContext("staff");
      const caller = appRouter.createCaller(ctx);
      await caller.inventoryAudit.list({});
      expect(firestore.listAll).toHaveBeenCalledWith("inventory_audit_log", { where: [["performedBy", "==", 1]] });
    });
  });
});

// ============ Documents & money Firestore routers (Batch 2c) ============
describe("purchaseOrders/quotations/netMeteringPayments/acknowledgements/projects/netMetering/specialQuotationTemplates/specialQuotations", () => {
  let nextId = 2000;

  beforeEach(() => {
    nextId = 2000;
    vi.mocked(firestore.listPaginated).mockReset().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    vi.mocked(firestore.listAll).mockReset().mockResolvedValue([]);
    vi.mocked(firestore.getById).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.insertOne).mockReset().mockImplementation(async () => nextId++);
    vi.mocked(firestore.updateOne).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.deleteOne).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.insertMany).mockReset().mockImplementation(async (_coll: string, rows: any[]) => rows.map((_, i) => nextId + i));
    vi.mocked(firestore.allocateIds).mockReset().mockImplementation(async () => nextId++);
    vi.mocked(firestore.audit).mockReset().mockResolvedValue(undefined);
  });

  describe("purchaseOrders", () => {
    it("create computes line totals + discount + VAT into totalAmount and inserts items via insertMany", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.purchaseOrders.create({
        supplier: "Acme Supplies",
        vatEnabled: true,
        vatRate: "12",
        discountType: "fixed",
        discountValue: "100",
        items: [{ itemId: 1, quantity: 2, unitPrice: "500" }],
      });
      expect(result.success).toBe(true);
      // subtotal 1000 - 100 discount = 900, +12% VAT = 108 => 1008.00
      expect(firestore.insertOne).toHaveBeenCalledWith("purchase_orders", expect.objectContaining({ totalAmount: "1008.00", paymentStatus: "unpaid" }));
      expect(firestore.insertMany).toHaveBeenCalledWith("purchase_order_items", expect.arrayContaining([
        expect.objectContaining({ itemId: 1, quantity: 2, unitPrice: "500", lineTotal: "1000.00" }),
      ]));
    });

    it("addPayment recomputes paidAmount and marks the PO fully paid once covered", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([{ id: 1, purchaseOrderId: 5, amount: "600.00" }] as any);
      vi.mocked(firestore.getById).mockResolvedValueOnce({ id: 5, totalAmount: "600.00" } as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.purchaseOrders.addPayment({ purchaseOrderId: 5, amount: "600.00", paymentDate: "2024-01-01" });
      expect(firestore.updateOne).toHaveBeenCalledWith("purchase_orders", 5, { paidAmount: "600.00", paymentStatus: "paid" });
    });
  });

  describe("quotations", () => {
    it("create auto-creates a contact from customerName when no existing contact matches", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([]); // no existing "Ada"-named contacts
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.quotations.create({ title: "10kW System", customerName: "Ada Lovelace" });
      expect(result).toEqual({ success: true });
      expect(firestore.insertOne).toHaveBeenCalledWith("contacts", expect.objectContaining({ firstName: "Ada", lastName: "Lovelace" }));
      expect(firestore.insertOne).toHaveBeenCalledWith("quotations", expect.objectContaining({ title: "10kW System", quoteNumber: expect.stringMatching(/^QT-/) }));
    });

    it("create reuses an existing contact with a matching name instead of creating a duplicate", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([{ id: 42, firstName: "Ada", lastName: "Lovelace" }] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.quotations.create({ title: "10kW System", customerName: "Ada Lovelace" });
      expect(firestore.insertOne).not.toHaveBeenCalledWith("contacts", expect.anything());
      expect(firestore.insertOne).toHaveBeenCalledWith("quotations", expect.objectContaining({ contactId: 42 }));
    });

    it("addItem recalculates subtotal/discount/tax/total from line items + header fields", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([{ id: 1, quotationId: 9, totalPrice: "1000.00" }] as any);
      vi.mocked(firestore.getById).mockResolvedValueOnce({ id: 9, discountPercent: "10", discountManualAmount: "0", vatEnabled: 1, taxPercent: "12", laborCost: "0", installationFee: "0" } as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await caller.quotations.addItem({ quotationId: 9, description: "Panel", quantity: 2, unitPrice: "500" });
      expect(firestore.updateOne).toHaveBeenCalledWith("quotations", 9, {
        subtotal: "1000.00", discountAmount: "100.00", taxAmount: "108.00", totalAmount: "1008.00",
      });
    });
  });

  describe("projects", () => {
    it("create inserts the project and an initial project_status_history row", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.projects.create({ name: "Solar Farm A" });
      expect(result.success).toBe(true);
      expect(firestore.insertOne).toHaveBeenCalledWith("projects", expect.objectContaining({ name: "Solar Farm A", stage: "procurement" }));
      expect(firestore.insertOne).toHaveBeenCalledWith("project_status_history", expect.objectContaining({ toStage: "procurement", fromStage: null }));
    });
  });

  describe("netMetering", () => {
    it("stats buckets records by status", async () => {
      vi.mocked(firestore.listAll).mockResolvedValueOnce([
        { id: 1, status: "plan_drawings" },
        { id: 2, status: "submitted_lgu" },
        { id: 3, status: "approved" },
        { id: 4, status: "completed_energized" },
      ] as any);
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.netMetering.stats();
      expect(result).toEqual({ total: 4, planDrawings: 1, submitted: 1, approved: 1, completed: 1 });
    });
  });

  describe("specialQuotationTemplates", () => {
    it("create defaults isActive to 1", async () => {
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);
      await caller.specialQuotationTemplates.create({ name: "Standard 5kW" });
      expect(firestore.insertOne).toHaveBeenCalledWith("special_quotation_templates", expect.objectContaining({ isActive: 1, name: "Standard 5kW" }));
    });
  });

  describe("specialQuotations", () => {
    it("create generates an SQ- quotation number and defaults status to draft", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.specialQuotations.create({ customerName: "Juan Dela Cruz" });
      expect(result.quotationNumber).toMatch(/^SQ-/);
      expect(firestore.insertOne).toHaveBeenCalledWith("special_quotations", expect.objectContaining({ status: "draft", customerName: "Juan Dela Cruz" }));
    });
  });
});
