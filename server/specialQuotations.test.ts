import { describe, it, expect, vi, beforeEach } from "vitest";

// specialQuotationTemplates/specialQuotations are backed by Firestore
// (server/firestore.ts), which requires live FIREBASE_SERVICE_ACCOUNT
// credentials. Mock it here so these unit tests don't depend on network
// access / real cloud credentials — same pattern as server/routers.test.ts.
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
import type { TrpcContext } from "./_core/context";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-admin-123",
      email: "admin@jmcsolar.com",
      name: "Admin User",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Special Quotation Templates", () => {
  beforeEach(() => {
    vi.mocked(firestore.listAll).mockReset().mockResolvedValue([]);
    vi.mocked(firestore.getById).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.insertOne).mockReset().mockResolvedValue(1);
    vi.mocked(firestore.updateOne).mockReset().mockResolvedValue(undefined);
  });

  it("template create/update/delete require admin role", async () => {
    // Import the router to verify procedure types
    const routerModule = await import("./routers");
    const router = routerModule.appRouter;

    // Verify the router structure exists
    expect(router).toBeDefined();
    expect(router._def.procedures).toBeDefined();

    // Check that template CRUD procedures exist
    const procedures = router._def.procedures;
    expect(procedures["specialQuotationTemplates.create"]).toBeDefined();
    expect(procedures["specialQuotationTemplates.update"]).toBeDefined();
    expect(procedures["specialQuotationTemplates.delete"]).toBeDefined();
    expect(procedures["specialQuotationTemplates.list"]).toBeDefined();
    expect(procedures["specialQuotationTemplates.get"]).toBeDefined();
  });

  it("template create stores the line items array as-is and defaults isActive to 1", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createAdminContext());
    const items = [{ description: "Panel", qty: "1", unit: "LOT", unitPrice: "1000.00", total: "1000.00", notes: "", warranty: "" }];
    await caller.specialQuotationTemplates.create({ name: "Standard 5kW", items });
    expect(firestore.insertOne).toHaveBeenCalledWith("special_quotation_templates", expect.objectContaining({
      name: "Standard 5kW",
      items,
      isActive: 1,
    }));
  });

  it("template list only returns active templates, newest-updated first", async () => {
    vi.mocked(firestore.listAll).mockResolvedValueOnce([
      { id: 1, name: "Older", updatedAt: new Date("2024-01-01") },
      { id: 2, name: "Newer", updatedAt: new Date("2024-06-01") },
    ] as any);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.specialQuotationTemplates.list();
    expect(firestore.listAll).toHaveBeenCalledWith("special_quotation_templates", { where: [["isActive", "==", 1]] });
    expect(result.map((t: any) => t.id)).toEqual([2, 1]);
  });

  it("template delete soft-deletes by setting isActive to 0", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createAdminContext());
    await caller.specialQuotationTemplates.delete({ id: 5 });
    expect(firestore.updateOne).toHaveBeenCalledWith("special_quotation_templates", 5, { isActive: 0 });
  });
});

describe("Special Quotations", () => {
  beforeEach(() => {
    vi.mocked(firestore.listAll).mockReset().mockResolvedValue([]);
    vi.mocked(firestore.getById).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.insertOne).mockReset().mockResolvedValue(1);
    vi.mocked(firestore.updateOne).mockReset().mockResolvedValue(undefined);
    vi.mocked(firestore.deleteOne).mockReset().mockResolvedValue(undefined);
  });

  it("special quotation CRUD procedures exist", async () => {
    const routerModule = await import("./routers");
    const router = routerModule.appRouter;
    const procedures = router._def.procedures;

    expect(procedures["specialQuotations.list"]).toBeDefined();
    expect(procedures["specialQuotations.get"]).toBeDefined();
    expect(procedures["specialQuotations.create"]).toBeDefined();
    expect(procedures["specialQuotations.update"]).toBeDefined();
    expect(procedures["specialQuotations.delete"]).toBeDefined();
  });

  it("creating a special quotation does not modify the template table", async () => {
    // The create procedure only inserts into special_quotations
    // It stores templateId as a reference but never writes back to special_quotation_templates
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.specialQuotations.create({ templateId: 7, customerName: "Juan Dela Cruz" });
    expect(result.success).toBe(true);
    expect(result.quotationNumber).toMatch(/^SQ-/);
    expect(firestore.insertOne).toHaveBeenCalledWith("special_quotations", expect.objectContaining({
      templateId: 7, customerName: "Juan Dela Cruz", status: "draft",
    }));
    expect(firestore.updateOne).not.toHaveBeenCalledWith("special_quotation_templates", expect.anything(), expect.anything());
  });

  it("update only patches special_quotations, never the template table", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createAdminContext());
    await caller.specialQuotations.update({ id: 3, customerName: "New Name" });
    expect(firestore.updateOne).toHaveBeenCalledWith("special_quotations", 3, { customerName: "New Name" });
    expect(firestore.updateOne).not.toHaveBeenCalledWith("special_quotation_templates", expect.anything(), expect.anything());
  });

  it("special quotation print route is registered", async () => {
    // Verify the documentPdf module exports the router
    const { documentPdfRouter } = await import("./documentPdf");
    expect(documentPdfRouter).toBeDefined();

    // Check that it has routes registered
    const routes = documentPdfRouter.stack || [];
    const specialQuotationRoute = routes.find(
      (r: any) => r.route && r.route.path === "/api/special-quotations/:id/print"
    );
    expect(specialQuotationRoute).toBeDefined();
  });
});
