import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import {
  getUserById, getUserByUsername, listUsersRaw, createUser, updateUser, deleteUser,
} from "./firestore-users";
import {
  audit as fsAudit,
  listAll as fsListAll,
  listPaginated as fsListPaginated,
  getById as fsGetById,
  insertOne as fsInsertOne,
  updateOne as fsUpdateOne,
  deleteOne as fsDeleteOne,
  insertMany as fsInsertMany,
  allocateIds as fsAllocateIds,
  docToData as fsDocToData,
  docToDataRaw as fsDocToDataRaw,
  listAllRaw as fsListAllRaw,
  fdb,
  type PaginatedResult,
} from "./firestore";
import type { WhereFilterOp } from "firebase-admin/firestore";
import type {
  AuditLog as FsAuditLog,
  Account,
  Contact,
  Lead,
  Opportunity,
  Activity,
  Supplier,
  ConfigOption,
  SupplierItemPrice,
  InventoryItem,
  StockTransaction,
  BomPackage,
  BomPackageItem,
  StockAdjustment,
  InventoryAuditLog,
  ItemPriceHistory,
  PurchaseOrder,
  PurchaseOrderItem,
  PoPayment,
  Quotation,
  QuotationItem,
  DeliveryReceipt,
  AcknowledgementReceipt,
  Project,
  ProjectStatusHistory,
  ProjectPayment,
  NetMetering,
  NetMeteringPayment,
  NetMeteringBilling,
  ProjectBilling,
  ProjectBillingItem,
  SpecialQuotationTemplate,
  SpecialQuotation,
  CashRequest,
  CashRequestItem,
  Notification,
  RetailSale,
  RetailSaleItem,
} from "./models";
import { money } from "./models";
import { z } from "zod";

/** Recomputes a BOM package's totalCost from its line items' quantity * inventory sellingPrice. */
async function recalcBomTotalCost(packageId: number): Promise<void> {
  const [bomItems, items] = await Promise.all([
    fsListAll<BomPackageItem>("bom_package_items", { where: [["packageId", "==", packageId]] }),
    fsListAll<InventoryItem>("inventory_items"),
  ]);
  const itemMap = new Map(items.map(i => [i.id, i]));
  const totalCost = bomItems.reduce((sum, bi) => sum + bi.quantity * Number(itemMap.get(bi.itemId)?.sellingPrice || 0), 0);
  await fsUpdateOne("bom_packages", packageId, { totalCost: money(totalCost) });
}

/** "First Last" for contacts/leads, trimmed; a missing lastName is dropped rather than left as a trailing space. */
function personName(p: { firstName: string; lastName: string | null }): string | null {
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || null;
}

/** Null-safe FK -> denormalized name lookup: a null id or a dangling reference both yield null, never a crash. */
function nameFor<T>(id: number | null, map: Map<number, T>, nameFn: (row: T) => string | null): string | null {
  if (id == null) return null;
  const row = map.get(id);
  return row ? nameFn(row) : null;
}

/** Recomputes a quotation's subtotal/discountAmount/taxAmount/totalAmount from its line items + header discount/VAT/labor/installation fields. */
async function recalcQuotationTotals(quotationId: number): Promise<void> {
  const [items, quote] = await Promise.all([
    fsListAll<QuotationItem>("quotation_items", { where: [["quotationId", "==", quotationId]] }),
    fsGetById<Quotation>("quotations", quotationId),
  ]);
  const subtotal = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
  const discountPct = Number(quote?.discountPercent || 0);
  const manualDiscount = Number(quote?.discountManualAmount || 0);
  const taxPct = quote?.vatEnabled ? Number(quote?.taxPercent || 0) : 0;
  const labor = Number(quote?.laborCost || 0);
  const installation = Number(quote?.installationFee || 0);
  const percentageDiscountAmt = subtotal * (discountPct / 100);
  const totalDiscountAmt = percentageDiscountAmt + manualDiscount;
  const afterDiscount = subtotal - totalDiscountAmt;
  const taxAmt = afterDiscount * (taxPct / 100);
  const total = afterDiscount + taxAmt + labor + installation;
  await fsUpdateOne("quotations", quotationId, {
    subtotal: money(subtotal),
    discountAmount: money(totalDiscountAmt),
    taxAmount: money(taxAmt),
    totalAmount: money(total),
  });
}

/**
 * Cash requests can hold several entries. Records created before multi-entry
 * support have no `items`, so read every request through this — it falls back
 * to the single legacy purpose/amount so old records still display and total up.
 */
function crItems(r: CashRequest): CashRequestItem[] {
  if (r.items && r.items.length > 0) return r.items;
  return [{ purposeOptionId: r.purposeOptionId, purposeLabel: r.purposeLabel, amount: r.amount }];
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      const u = opts.ctx.user;
      if (!u) return null;
      // Never leak credentials/secrets to the client. Admin password reset
      // is handled separately in the users router (admin-only).
      const { passwordHash, totpSecret, resetToken, resetTokenExpiry, ...safe } = u;
      return safe;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ DASHBOARD ============
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      const [leadsCountSnap, contactsCountSnap, quotesCountSnap, opportunityRows, inventoryRows] = await Promise.all([
        fdb().collection("leads").count().get(),
        fdb().collection("contacts").count().get(),
        fdb().collection("quotations").count().get(),
        fsListAll<Opportunity>("opportunities", { select: ["status", "value"] }),
        fsListAll<InventoryItem>("inventory_items", { select: ["stockOnHand", "reorderLevel", "sellingPrice"] }),
      ]);

      let pipelineValue = 0;
      let wonDeals = 0;
      for (const o of opportunityRows) {
        if (o.status === "won") wonDeals++;
        else if (o.status !== "lost") pipelineValue += Number(o.value || 0);
      }
      const totalOpps = opportunityRows.length;

      let lowStockItems = 0;
      let inventoryValue = 0;
      for (const item of inventoryRows) {
        if (item.reorderLevel != null && item.stockOnHand <= item.reorderLevel) lowStockItems++;
        inventoryValue += item.stockOnHand * Number(item.sellingPrice || 0);
      }

      // Only fetch revenue for admin users
      let totalRevenue = "0";
      if (ctx.user?.role === "admin") {
        const paymentRows = await fsListAll<ProjectPayment>("project_payments", { select: ["amount"] });
        totalRevenue = money(paymentRows.reduce((sum, p) => sum + Number(p.amount || 0), 0));
      }

      const conversionRate = totalOpps > 0 ? Math.round((wonDeals / totalOpps) * 100) : 0;

      return {
        totalLeads: leadsCountSnap.data().count,
        totalOpportunities: totalOpps,
        totalInventoryItems: inventoryRows.length,
        totalQuotations: quotesCountSnap.data().count,
        pipelineValue: money(pipelineValue),
        wonDeals,
        totalContacts: contactsCountSnap.data().count,
        lowStockItems,
        conversionRate,
        // Company cash figures are admin-only. Sub-admins still get the counts
        // (item count, low-stock alerts) — just not the peso totals.
        totalRevenue,
        inventoryValue: ctx.user?.role === "admin" ? money(inventoryValue) : "0",
      };
    }),
    pipelineBreakdown: protectedProcedure.query(async () => {
      const rows = await fsListAll<Opportunity>("opportunities", { select: ["status"] });
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.status, (counts.get(r.status) || 0) + 1);
      return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
    }),
    inventoryByCategory: protectedProcedure.query(async () => {
      const rows = await fsListAll<InventoryItem>("inventory_items", { select: ["category", "stockOnHand"] });
      const byCategory = new Map<string, { count: number; totalStock: number }>();
      for (const r of rows) {
        const entry = byCategory.get(r.category) || { count: 0, totalStock: 0 };
        entry.count++;
        entry.totalStock += r.stockOnHand || 0;
        byCategory.set(r.category, entry);
      }
      return Array.from(byCategory.entries()).map(([category, v]) => ({ category, count: v.count, totalStock: v.totalStock }));
    }),
    revenueByMonth: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") return [];
      const rows = await fsListAll<ProjectPayment>("project_payments", { select: ["paymentDate", "amount"] });
      const byMonth = new Map<string, { revenue: number; count: number }>();
      for (const p of rows) {
        const d = p.paymentDate;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const entry = byMonth.get(key) || { revenue: 0, count: 0 };
        entry.revenue += Number(p.amount || 0);
        entry.count++;
        byMonth.set(key, entry);
      }
      return Array.from(byMonth.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, 12)
        .map(([month, v]) => ({ month, revenue: v.revenue, count: v.count }));
    }),
    leadConversion: protectedProcedure.query(async () => {
      const statuses = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
      const rows = await fsListAll<Lead>("leads", { select: ["status"] });
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.status, (counts.get(r.status) || 0) + 1);
      return statuses.map(s => ({ status: s, count: counts.get(s) || 0 }));
    }),
  }),

  // ============ LEADS ============
  leads: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), status: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) })).query(async ({ input }) => {
      const filters: [string, WhereFilterOp, any][] = [];
      if (input.status) filters.push(["status", "==", input.status]);
      const result = (await fsListPaginated("leads", {
        search: input.search,
        searchFields: ["firstName", "lastName", "company", "email", "phone", "source", "systemSize", "notes"],
        filters,
        page: input.page,
        limit: input.limit,
      })) as unknown as PaginatedResult<Lead>;

      // Denormalize FK names for the page's rows in 3 batched reads (one per referenced
      // collection) rather than one Firestore read per lead — see personName/nameFor above.
      const [contacts, accounts, users] = await Promise.all([
        fsListAll<Contact>("contacts"),
        fsListAll<Account>("accounts"),
        listUsersRaw(),
      ]);
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const accountMap = new Map(accounts.map(a => [a.id, a]));
      const userMap = new Map(users.map(u => [u.id, u]));

      return {
        ...result,
        items: result.items.map(l => ({
          ...l,
          contactName: nameFor(l.contactId, contactMap, personName),
          accountName: nameFor(l.accountId, accountMap, a => a.name),
          assignedToName: nameFor(l.assignedTo, userMap, u => u.name),
        })),
      };
    }),
    create: protectedProcedure.input(z.object({
      firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), source: z.string().optional(),
      status: z.string().optional(), systemSize: z.string().optional(), estimatedValue: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await fsInsertOne("leads", {
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        source: input.source ?? null,
        status: input.status || "new",
        systemSize: input.systemSize ?? null,
        estimatedValue: input.estimatedValue ?? null,
        notes: input.notes ?? null,
        contactId: null,
        accountId: null,
        assignedTo: null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "lead", undefined, `Created lead: ${input.firstName}`);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), source: z.string().optional(),
      status: z.string().optional(), systemSize: z.string().optional(), estimatedValue: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await fsUpdateOne("leads", id, { ...data, status: data.status || "new" });
      await fsAudit(ctx.user.id, ctx.user.name, "update", "lead", id, `Updated lead: ${input.firstName}`);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await fsDeleteOne("leads", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "lead", input.id, `Deleted lead #${input.id}`);
      return { success: true };
    }),
  }),

  // ============ CONTACTS ============
  contacts: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) })).query(async ({ input }) => {
      return fsListPaginated("contacts", {
        search: input.search,
        searchFields: ["firstName", "lastName", "email", "company", "phone", "position", "city", "address"],
        page: input.page,
        limit: input.limit,
      });
    }),
    create: protectedProcedure.input(z.object({
      firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), position: z.string().optional(),
      address: z.string().optional(), city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const id = await fsInsertOne("contacts", {
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        position: input.position ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "contact", id, `Created contact: ${input.firstName}`);
      return { success: true, id };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), position: z.string().optional(),
      address: z.string().optional(), city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!["admin", "subadmin"].includes(ctx.user.role)) {
        throw new Error("Only Admin or Sub Admin can edit contacts");
      }
      const { id, ...data } = input;
      await fsUpdateOne("contacts", id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (!["admin", "subadmin"].includes(ctx.user.role)) {
        throw new Error("Only Admin or Sub Admin can delete contacts");
      }
      await fsDeleteOne("contacts", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "contact", input.id, `Deleted contact #${input.id}`);
      return { success: true };
    }),
  }),

  // ============ ACCOUNTS ============
  accounts: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ input }) => {
      const result = (await fsListPaginated("accounts", {
        search: input.search,
        searchFields: ["name", "email", "industry", "phone", "city", "website"],
        page: 1,
        limit: 200,
      })) as unknown as PaginatedResult<Account>;
      return result.items;
    }),
    listAll: protectedProcedure.query(async () => {
      const all = await fsListAll<Account>("accounts");
      return all
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(a => ({ id: a.id, name: a.name }));
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1), industry: z.string().optional(), phone: z.string().optional(),
      email: z.string().optional(), website: z.string().optional(), address: z.string().optional(), city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const id = await fsInsertOne("accounts", {
        name: input.name,
        industry: input.industry ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        website: input.website ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "account", id, `Created account: ${input.name}`);
      return { success: true, id };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), name: z.string().min(1), industry: z.string().optional(), phone: z.string().optional(),
      email: z.string().optional(), website: z.string().optional(), address: z.string().optional(), city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await fsUpdateOne("accounts", id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await fsDeleteOne("accounts", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "account", input.id, `Deleted account #${input.id}`);
      return { success: true };
    }),
  }),

  // ============ OPPORTUNITIES ============
  opportunities: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), status: z.string().optional() })).query(async ({ input }) => {
      const filters: [string, WhereFilterOp, any][] = [];
      if (input.status) filters.push(["status", "==", input.status]);
      const result = (await fsListPaginated("opportunities", {
        search: input.search,
        searchFields: ["title", "systemSize", "systemType", "notes"],
        filters,
        page: 1,
        limit: 200,
      })) as unknown as PaginatedResult<Opportunity>;

      // Denormalize FK names for the page's rows in 4 batched reads (one per referenced
      // collection) rather than one Firestore read per opportunity.
      const [contacts, accounts, leads, users] = await Promise.all([
        fsListAll<Contact>("contacts"),
        fsListAll<Account>("accounts"),
        fsListAll<Lead>("leads"),
        listUsersRaw(),
      ]);
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const accountMap = new Map(accounts.map(a => [a.id, a]));
      const leadMap = new Map(leads.map(l => [l.id, l]));
      const userMap = new Map(users.map(u => [u.id, u]));

      return result.items.map(o => ({
        ...o,
        contactName: nameFor(o.contactId, contactMap, personName),
        accountName: nameFor(o.accountId, accountMap, a => a.name),
        leadName: nameFor(o.leadId, leadMap, personName),
        assignedToName: nameFor(o.assignedTo, userMap, u => u.name),
      }));
    }),
    listAll: protectedProcedure.query(async () => {
      const result = (await fsListPaginated("opportunities", {
        page: 1,
        limit: 100,
      })) as unknown as PaginatedResult<Opportunity>;
      return result.items.map(o => ({ id: o.id, title: o.title, status: o.status }));
    }),
    create: protectedProcedure.input(z.object({
      title: z.string().min(1), status: z.string().optional(), value: z.string().optional(),
      systemSize: z.string().optional(), systemType: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await fsInsertOne("opportunities", {
        title: input.title,
        status: input.status || "new",
        value: input.value ?? null,
        systemSize: input.systemSize ?? null,
        systemType: input.systemType ?? null,
        contactId: null,
        accountId: null,
        leadId: null,
        assignedTo: null,
        expectedCloseDate: null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "opportunity", undefined, `Created opportunity: ${input.title}`);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), title: z.string().min(1), status: z.string().optional(), value: z.string().optional(),
      systemSize: z.string().optional(), systemType: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await fsUpdateOne("opportunities", id, { ...data, status: data.status || "new" });
      await fsAudit(ctx.user.id, ctx.user.name, "update", "opportunity", id, `Updated opportunity: ${input.title}`);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await fsDeleteOne("opportunities", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "opportunity", input.id, `Deleted opportunity #${input.id}`);
      return { success: true };
    }),
  }),

  // ============ ACTIVITIES ============
  activities: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ input }) => {
      const all = await fsListAll<Activity>("activities");
      const search = input.search?.trim().toLowerCase();
      let items = all;
      if (search) {
        items = all.filter(a => {
          if (a.subject && a.subject.toLowerCase().includes(search)) return true;
          if (a.description && a.description.toLowerCase().includes(search)) return true;
          if (a.scheduledAt) {
            const dateStr = a.scheduledAt.toISOString().slice(0, 10);
            if (dateStr.includes(search)) return true;
          }
          return false;
        });
      }
      const page = items
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 200);

      // Denormalize FK names for the page's rows in 3 batched reads (one per referenced
      // collection) rather than one Firestore read per activity.
      const [contacts, opportunities, leads] = await Promise.all([
        fsListAll<Contact>("contacts"),
        fsListAll<Opportunity>("opportunities"),
        fsListAll<Lead>("leads"),
      ]);
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const opportunityMap = new Map(opportunities.map(o => [o.id, o]));
      const leadMap = new Map(leads.map(l => [l.id, l]));

      return page.map(a => ({
        ...a,
        contactName: nameFor(a.contactId, contactMap, personName),
        opportunityName: nameFor(a.opportunityId, opportunityMap, o => o.title),
        leadName: nameFor(a.leadId, leadMap, personName),
      }));
    }),
    create: protectedProcedure.input(z.object({
      type: z.string(), subject: z.string().min(1), description: z.string().optional(),
      contactId: z.number().optional(), opportunityId: z.number().optional(), leadId: z.number().optional(),
    })).mutation(async ({ input, ctx }) => {
      await fsInsertOne("activities", {
        type: input.type,
        subject: input.subject,
        description: input.description ?? null,
        contactId: input.contactId ?? null,
        opportunityId: input.opportunityId ?? null,
        leadId: input.leadId ?? null,
        scheduledAt: null,
        completedAt: null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "activity", undefined, `Logged ${input.type}: ${input.subject}`);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await fsDeleteOne("activities", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "activity", input.id, `Deleted activity #${input.id}`);
      return { success: true };
    }),
  }),

  // ============ CONFIG OPTIONS ============
  config: router({
    getOptions: protectedProcedure.input(z.object({ category: z.string() })).query(async ({ input }) => {
      const options = await fsListAll<ConfigOption>("config_options", {
        where: [
          ["category", "==", input.category],
          ["isActive", "==", 1],
        ],
      });
      return options
        .slice()
        .sort((a, b) => (a.sortOrder ?? -Infinity) - (b.sortOrder ?? -Infinity));
    }),
    addOption: adminProcedure.input(z.object({ category: z.string(), value: z.string().min(1) })).mutation(async ({ input }) => {
      await fsInsertOne("config_options", {
        category: input.category,
        value: input.value,
        sortOrder: 0,
        isActive: 1,
      });
      return { success: true };
    }),
    removeOption: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await fsUpdateOne("config_options", input.id, { isActive: 0 });
      return { success: true };
    }),
  }),

  // ============ SUPPLIERS ============
  suppliers: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ input }) => {
      const result = (await fsListPaginated("suppliers", {
        search: input.search,
        searchFields: ["name", "code", "contactPerson", "phone", "email", "address", "city", "notes"],
        page: 1,
        limit: 200,
      })) as unknown as PaginatedResult<Supplier>;
      return result.items;
    }),
    listAll: protectedProcedure.query(async () => {
      const result = (await fsListPaginated("suppliers", {
        page: 1,
        limit: 500,
        orderBy: "name",
        dir: "asc",
      })) as unknown as PaginatedResult<Supplier>;
      return result.items.map(s => ({ id: s.id, name: s.name, code: s.code }));
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1), code: z.string().optional(), contactPerson: z.string().optional(),
      phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(),
      city: z.string().optional(), paymentTerms: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await fsInsertOne("suppliers", {
        name: input.name,
        code: input.code ?? null,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        paymentTerms: input.paymentTerms ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "supplier", undefined, `Created supplier: ${input.name}`);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), name: z.string().min(1), code: z.string().optional(), contactPerson: z.string().optional(),
      phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(),
      city: z.string().optional(), paymentTerms: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await fsUpdateOne("suppliers", id, data);
      await fsAudit(ctx.user.id, ctx.user.name, "update", "supplier", id, `Updated supplier: ${input.name}`);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await fsDeleteOne("suppliers", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "supplier", input.id, `Deleted supplier #${input.id}`);
      return { success: true };
    }),
    // Get all item prices for a specific supplier
    getItemPrices: protectedProcedure.input(z.object({ supplierId: z.number() })).query(async ({ input }) => {
      const prices = await fsListAll<SupplierItemPrice>("supplier_item_prices", {
        where: [["supplierId", "==", input.supplierId]],
      });
      if (prices.length === 0) return [];
      prices.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const itemIds = Array.from(new Set(prices.map(p => p.inventoryItemId)));
      const fetchedItems = await Promise.all(itemIds.map(id => fsGetById<InventoryItem>("inventory_items", id)));
      const itemMap = new Map<number, InventoryItem>();
      fetchedItems.forEach((it, idx) => { if (it) itemMap.set(itemIds[idx], it); });
      return prices.map(p => {
        const it = itemMap.get(p.inventoryItemId);
        return {
          ...p,
          item: it ? { id: it.id, name: it.name, sku: it.sku, purchasePrice: it.purchasePrice, unit: it.unit } : null,
        };
      });
    }),
  }),

  // ============ INVENTORY ============
  inventory: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), category: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) })).query(async ({ input }) => {
      const filters: [string, WhereFilterOp, any][] = [];
      if (input.category) filters.push(["category", "==", input.category]);
      return fsListPaginated("inventory_items", {
        search: input.search,
        searchFields: ["name", "sku", "brand", "model", "description", "warehouseLocation"],
        filters,
        page: input.page,
        limit: input.limit,
      });
    }),
    listAll: protectedProcedure.query(async () => {
      const items = await fsListAll<InventoryItem>("inventory_items", {
        select: ["name", "sku", "category", "brand", "model", "unit", "purchasePrice", "sellingPrice", "stockOnHand"],
      });
      return items
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .slice(0, 500);
    }),
    create: protectedProcedure.input(z.object({
      sku: z.string().min(1), name: z.string().min(1), category: z.string(),
      brand: z.string().optional(), model: z.string().optional(), description: z.string().optional(),
      purchasePrice: z.string().optional(), sellingPrice: z.string().optional(),
      stockOnHand: z.number().optional(), reorderLevel: z.number().optional(),
      unit: z.string().optional(), warehouseLocation: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Non-admin users cannot set initial stock directly - must use Stock In transaction
      const initialStock = ctx.user.role === 'admin' ? (input.stockOnHand ?? 0) : 0;
      const now = new Date();
      const itemId = await fsAllocateIds("inventory_items");
      const batch = fdb().batch();
      batch.set(fdb().collection("inventory_items").doc(String(itemId)), {
        id: itemId,
        sku: input.sku, name: input.name, category: input.category,
        description: input.description ?? null,
        brand: input.brand ?? null, model: input.model ?? null, specs: null,
        unit: input.unit ?? null,
        purchasePrice: input.purchasePrice ?? null, sellingPrice: input.sellingPrice ?? null,
        stockOnHand: initialStock, stockReserved: 0,
        reorderLevel: input.reorderLevel ?? 5,
        warehouseLocation: input.warehouseLocation ?? null,
        createdBy: ctx.user.id,
        createdAt: now, updatedAt: now,
      });
      // If admin set initial stock, log it in audit
      if (initialStock > 0) {
        const auditId = await fsAllocateIds("inventory_audit_log");
        batch.set(fdb().collection("inventory_audit_log").doc(String(auditId)), {
          id: auditId,
          itemId, itemName: input.name, itemSku: input.sku,
          transactionType: 'initial', quantity: initialStock,
          previousStock: 0, newStock: initialStock,
          sourceLocation: null,
          destinationLocation: input.warehouseLocation || null,
          reference: 'Initial stock set on creation', purpose: null, notes: null,
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
          createdAt: now,
        });
      }
      await batch.commit();
      await fsAudit(ctx.user.id, ctx.user.name, "create", "inventory", itemId, `Added item: ${input.name}`);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), sku: z.string().min(1), name: z.string().min(1), category: z.string(),
      brand: z.string().optional(), model: z.string().optional(), description: z.string().optional(),
      purchasePrice: z.string().optional(), sellingPrice: z.string().optional(),
      stockOnHand: z.number().optional(), reorderLevel: z.number().optional(),
      unit: z.string().optional(), warehouseLocation: z.string().optional(),
      priceChangeNotes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, stockOnHand, priceChangeNotes, ...data } = input;
      // Get current item for audit log and price history
      const currentItem = await fsGetById<InventoryItem>("inventory_items", id);
      // Track price changes
      if (currentItem) {
        const oldPurchase = currentItem.purchasePrice || "0";
        const newPurchase = data.purchasePrice || "0";
        if (oldPurchase !== newPurchase) {
          await fsInsertOne("item_price_history", { itemId: id, priceType: "purchase", oldPrice: oldPurchase, newPrice: newPurchase, changedBy: ctx.user.id, changedByName: ctx.user.name || "Unknown", notes: priceChangeNotes ?? null });
        }
        const oldSelling = currentItem.sellingPrice || "0";
        const newSelling = data.sellingPrice || "0";
        if (oldSelling !== newSelling) {
          await fsInsertOne("item_price_history", { itemId: id, priceType: "selling", oldPrice: oldSelling, newPrice: newSelling, changedBy: ctx.user.id, changedByName: ctx.user.name || "Unknown", notes: priceChangeNotes ?? null });
        }
      }
      const prevStock = currentItem?.stockOnHand ?? 0;
      const patch = { ...data, category: data.category as any };
      // Non-admin cannot directly edit stockOnHand - enforced at backend
      if (ctx.user.role !== 'admin') {
        // Strip stockOnHand for non-admin - they must use transactions
        await fsUpdateOne("inventory_items", id, patch);
      } else if (stockOnHand !== undefined && stockOnHand !== prevStock) {
        // Admin can edit stock directly - read-modify-write the item + audit row atomically
        const auditId = await fsAllocateIds("inventory_audit_log");
        await fdb().runTransaction(async (tx) => {
          const itemRef = fdb().collection("inventory_items").doc(String(id));
          const snap = await tx.get(itemRef);
          const liveStock = snap.exists ? ((snap.data()?.stockOnHand as number) ?? 0) : 0;
          tx.set(itemRef, { ...patch, stockOnHand, updatedAt: new Date() }, { merge: true });
          tx.set(fdb().collection("inventory_audit_log").doc(String(auditId)), {
            id: auditId,
            itemId: id, itemName: currentItem?.name || input.name, itemSku: currentItem?.sku || input.sku,
            transactionType: 'adjustment', quantity: Math.abs(stockOnHand - liveStock),
            previousStock: liveStock, newStock: stockOnHand,
            sourceLocation: null, destinationLocation: null,
            reference: 'Direct edit by admin', purpose: null, notes: null,
            performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
            createdAt: new Date(),
          });
        });
      } else {
        await fsUpdateOne("inventory_items", id, { ...patch, ...(stockOnHand !== undefined ? { stockOnHand } : {}) });
      }
      await fsAudit(ctx.user.id, ctx.user.name, "update", "inventory", id, `Updated item: ${input.name}`);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error("Only Admin can delete inventory items");
      await fsDeleteOne("inventory_items", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "inventory", input.id, `Deleted item #${input.id}`);
      return { success: true };
    }),
    priceHistory: protectedProcedure.input(z.object({ itemId: z.number() })).query(async ({ input }) => {
      const rows = await fsListAll<ItemPriceHistory>("item_price_history", {
        where: [["itemId", "==", input.itemId]],
      });
      return rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 100);
    }),
  }),

  // ============ STOCK TRANSACTIONS ============
  stockTransactions: router({
    list: protectedProcedure.query(async () => {
      const [transactions, items] = await Promise.all([
        fsListAll<StockTransaction>("stock_transactions"),
        fsListAll<InventoryItem>("inventory_items"),
      ]);
      const itemMap = new Map(items.map(i => [i.id, i]));
      return transactions
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 200)
        .map(t => ({ ...t, itemName: itemMap.get(t.itemId)?.name ?? null }));
    }),
    create: protectedProcedure.input(z.object({
      itemId: z.number(), type: z.string(), quantity: z.number().min(1),
      reference: z.string().optional(), notes: z.string().optional(),
      purpose: z.string().optional(), purposeOptionId: z.number().optional(),
      purposeRefId: z.number().optional(), purposeRefName: z.string().optional(),
      accountId: z.number().optional(), accountName: z.string().optional(),
      contactId: z.number().optional(), contactName: z.string().optional(),
      sourceLocation: z.string().optional(), destinationLocation: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Only admin can do adjustments directly
      if (input.type === 'adjustment' && ctx.user.role !== 'admin') {
        throw new Error("Only admin can perform stock adjustments");
      }

      const txnId = await fsAllocateIds("stock_transactions");
      const auditId = await fsAllocateIds("inventory_audit_log");
      const now = new Date();

      // Read-modify-write the item's stock (for stock_in/stock_out) atomically
      // alongside the stock_transactions row and the inventory_audit_log row.
      await fdb().runTransaction(async (tx) => {
        const itemRef = fdb().collection("inventory_items").doc(String(input.itemId));
        const snap = await tx.get(itemRef);
        const item = snap.exists ? (snap.data() as InventoryItem | undefined) : undefined;
        const prevStock = item?.stockOnHand ?? 0;
        let newStock = prevStock;

        tx.set(fdb().collection("stock_transactions").doc(String(txnId)), {
          id: txnId,
          itemId: input.itemId, type: input.type, quantity: input.quantity,
          reference: input.reference ?? null, purpose: input.purpose ?? null,
          purposeOptionId: input.purposeOptionId ?? null,
          purposeRefId: input.purposeRefId ?? null, purposeRefName: input.purposeRefName ?? null,
          accountId: input.accountId ?? null, accountName: input.accountName ?? null,
          contactId: input.contactId ?? null, contactName: input.contactName ?? null,
          notes: input.notes ?? null,
          createdBy: ctx.user.id, createdByName: ctx.user.name || 'Unknown',
          createdAt: now,
        });

        if (input.type === "stock_in") {
          newStock = prevStock + input.quantity;
          tx.set(itemRef, { stockOnHand: newStock, updatedAt: now }, { merge: true });
        } else if (input.type === "stock_out") {
          newStock = prevStock - input.quantity;
          tx.set(itemRef, { stockOnHand: newStock, updatedAt: now }, { merge: true });
        }

        // Write to inventory audit log
        const attribution = input.accountName ? `Account: ${input.accountName}` : (input.contactName ? `Contact: ${input.contactName}` : null);
        const auditPurpose = input.purpose ? (attribution ? `${input.purpose} [${attribution}]` : input.purpose) : attribution;
        tx.set(fdb().collection("inventory_audit_log").doc(String(auditId)), {
          id: auditId,
          itemId: input.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
          transactionType: input.type, quantity: input.quantity,
          previousStock: prevStock, newStock,
          sourceLocation: input.sourceLocation || item?.warehouseLocation || null,
          destinationLocation: input.destinationLocation || null,
          reference: input.reference || null, purpose: auditPurpose,
          notes: input.notes || null,
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Unknown',
          createdAt: now,
        });
      });

      await fsAudit(ctx.user.id, ctx.user.name, "create", "stock_transaction", input.itemId, `${input.type} x${input.quantity} for item #${input.itemId}${input.purpose ? ` (${input.purpose})` : ''}`);
      return { success: true };
    }),
    // Warehouse Transfer: stock-out from source + stock-in to destination
    transfer: protectedProcedure.input(z.object({
      itemId: z.number(), quantity: z.number().min(1),
      sourceLocation: z.string().min(1), destinationLocation: z.string().min(1),
      reference: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const item = await fsGetById<InventoryItem>("inventory_items", input.itemId);
      const prevStock = item?.stockOnHand ?? 0;
      if (input.quantity > prevStock) throw new Error("Insufficient stock for transfer");

      const now = new Date();
      const reference = input.reference || `Transfer: ${input.sourceLocation} → ${input.destinationLocation}`;

      // Net stock effect is zero (stock-out + stock-in), so no item read-modify-write is needed here.
      await fsInsertMany("stock_transactions", [
        {
          itemId: input.itemId, type: 'stock_out', quantity: input.quantity,
          reference, purpose: 'Warehouse Transfer', notes: input.notes ?? null,
          purposeRefId: null, purposeRefName: null, accountId: null, accountName: null,
          contactId: null, contactName: null,
          createdBy: ctx.user.id, createdByName: ctx.user.name || 'Unknown', createdAt: now,
        },
        {
          itemId: input.itemId, type: 'stock_in', quantity: input.quantity,
          reference, purpose: 'Warehouse Transfer', notes: input.notes ?? null,
          purposeRefId: null, purposeRefName: null, accountId: null, accountName: null,
          contactId: null, contactName: null,
          createdBy: ctx.user.id, createdByName: ctx.user.name || 'Unknown', createdAt: now,
        },
      ]);

      // Stock stays the same (out + in), but update location if needed
      // Log transfer_out and transfer_in in audit
      await fsInsertMany("inventory_audit_log", [
        {
          itemId: input.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
          transactionType: 'transfer_out', quantity: input.quantity,
          previousStock: prevStock, newStock: prevStock,
          sourceLocation: input.sourceLocation, destinationLocation: input.destinationLocation,
          reference, purpose: 'Warehouse Transfer',
          notes: input.notes ?? null,
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Unknown', createdAt: now,
        },
        {
          itemId: input.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
          transactionType: 'transfer_in', quantity: input.quantity,
          previousStock: prevStock, newStock: prevStock,
          sourceLocation: input.sourceLocation, destinationLocation: input.destinationLocation,
          reference, purpose: 'Warehouse Transfer',
          notes: input.notes ?? null,
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Unknown', createdAt: now,
        },
      ]);

      await fsAudit(ctx.user.id, ctx.user.name, "create", "stock_transfer", input.itemId, `Transfer x${input.quantity} of item #${input.itemId} from ${input.sourceLocation} to ${input.destinationLocation}`);
      return { success: true };
    }),
  }),

  // ============ RETAIL SALES ============
  // Walk-in product sales: a customer + multiple inventory line items, distinct from
  // the Projects (installation job) flow. Creating/editing/deleting is admin or
  // sub-admin only (no subadmin middleware exists — see the inline role checks below,
  // matching the idiom used for user creation around line ~1751).
  retail: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }).optional()).query(async ({ input, ctx }) => {
      // Reads are gated too, not just writes: the sidebar hides Retail from the limited
      // roles, but the endpoint is callable directly and exposes customer names, line
      // items, and prices.
      if (!["admin", "subadmin"].includes(ctx.user.role)) {
        throw new Error("Only Admin or Sub Admin can view retail sales");
      }
      const { search, page = 1, limit = 20 } = input || {};
      const [allSales, contacts, allLineItems] = await Promise.all([
        fsListAll<RetailSale>("retail_sales"),
        fsListAll<Contact>("contacts"),
        fsListAll<RetailSaleItem>("retail_sale_items"),
      ]);
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      // Counted here so the list page doesn't have to fire a retail.get per row just
      // to show how many items a sale had.
      const itemCountBySale = new Map<number, number>();
      allLineItems.forEach(li => {
        itemCountBySale.set(li.retailSaleId, (itemCountBySale.get(li.retailSaleId) ?? 0) + 1);
      });
      let items = allSales;
      if (search) {
        const s = search.trim().toLowerCase();
        items = items.filter(sale => (nameFor(sale.contactId, contactMap, personName) ?? sale.customerName ?? "").toLowerCase().includes(s));
      }
      items = items.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      const pageItems = items.slice(start, start + limit);
      return {
        items: pageItems.map(sale => ({
          ...sale,
          customerName: nameFor(sale.contactId, contactMap, personName) ?? sale.customerName,
          itemCount: itemCountBySale.get(sale.id) ?? 0,
        })),
        total, page, limit, totalPages,
      };
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      if (!["admin", "subadmin"].includes(ctx.user.role)) {
        throw new Error("Only Admin or Sub Admin can view retail sales");
      }
      const sale = await fsGetById<RetailSale>("retail_sales", input.id);
      if (!sale) return null;
      const [contact, lineItems] = await Promise.all([
        fsGetById<Contact>("contacts", sale.contactId),
        fsListAll<RetailSaleItem>("retail_sale_items", { where: [["retailSaleId", "==", input.id]] }),
      ]);
      return {
        ...sale,
        customerName: (contact ? personName(contact) : null) ?? sale.customerName,
        items: lineItems,
      };
    }),
    create: protectedProcedure.input(z.object({
      contactId: z.number(),
      saleDate: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.number().int().positive(),
      })).min(1, "At least one item is required"),
    })).mutation(async ({ input, ctx }) => {
      if (!["admin", "subadmin"].includes(ctx.user.role)) {
        throw new Error("Only Admin or Sub Admin can record retail sales");
      }

      const contact = await fsGetById<Contact>("contacts", input.contactId);
      if (!contact) throw new Error("Selected customer does not exist");
      const customerName = personName(contact);

      // Look up the "Retail Sale" withdrawal_purpose option if an admin has configured
      // one (Settings -> Withdrawal Purposes); tag stock_out rows with it if present,
      // otherwise fall back to a plain string label so the movement is still readable.
      const retailPurposeOptions = await fsListAll<ConfigOption>("config_options", {
        where: [["category", "==", "withdrawal_purpose"], ["value", "==", "Retail Sale"], ["isActive", "==", 1]],
      });
      const retailPurposeOption = retailPurposeOptions[0];

      // Aggregate requested quantity per item (the same item may appear on more than
      // one line) so stock validation checks the sale's true total draw per item.
      const requestedByItem = new Map<number, number>();
      for (const line of input.items) {
        requestedByItem.set(line.itemId, (requestedByItem.get(line.itemId) ?? 0) + line.quantity);
      }

      // Pre-allocate every id up front — allocateIds opens its own transaction, so it
      // cannot be called from inside the runTransaction below (see stockTransactions.create).
      const saleId = await fsAllocateIds("retail_sales");
      const firstLineItemId = await fsAllocateIds("retail_sale_items", input.items.length);
      const firstStockTxnId = await fsAllocateIds("stock_transactions", input.items.length);
      const firstAuditLogId = await fsAllocateIds("inventory_audit_log", input.items.length);

      const now = new Date();
      const saleDate = input.saleDate ? new Date(input.saleDate) : now;

      await fdb().runTransaction(async (tx) => {
        // Declared inside the callback: Firestore retries the whole body on write
        // contention, and a subtotal accumulated outside would keep adding on top of
        // the aborted attempt's total.
        let subtotal = 0;

        // ---- READS (Firestore transactions require every read before any write) ----
        const itemIds = Array.from(requestedByItem.keys());
        const itemSnaps = await tx.getAll(...itemIds.map(id => fdb().collection("inventory_items").doc(String(id))));
        const itemById = new Map<number, InventoryItem>();
        itemSnaps.forEach((snap, idx) => {
          if (!snap.exists) throw new Error(`Inventory item #${itemIds[idx]} does not exist`);
          itemById.set(itemIds[idx], fsDocToData<InventoryItem>(snap));
        });

        // ---- VALIDATE, inside the transaction and after the reads, so a concurrent
        // sale against the same item(s) cannot drive stock negative. ----
        for (const [itemId, qty] of Array.from(requestedByItem.entries())) {
          const item = itemById.get(itemId)!;
          if (qty > item.stockOnHand) {
            throw new Error(`Insufficient stock for "${item.name}": requested ${qty}, only ${item.stockOnHand} on hand`);
          }
          // sellingPrice is a free-form string on the item and may be unset or garbage.
          // Without this the line would silently record at 0.00 (or literal "NaN"),
          // deducting stock for no revenue. The UI blocks this too, but the endpoint
          // is callable directly.
          const price = Number(item.sellingPrice);
          if (!item.sellingPrice || !Number.isFinite(price) || price < 0) {
            throw new Error(`"${item.name}" has no valid selling price set in Inventory — set one before selling it`);
          }
        }

        // ---- WRITES: one retail_sale_items + stock_transactions + inventory_audit_log
        // row per line, chaining previousStock/newStock per item across lines. ----
        const runningStock = new Map<number, number>(itemIds.map(id => [id, itemById.get(id)!.stockOnHand]));
        input.items.forEach((line, idx) => {
          const item = itemById.get(line.itemId)!;
          const unitPrice = item.sellingPrice || "0";
          const lineTotal = money(line.quantity * Number(unitPrice));
          subtotal += Number(lineTotal);

          const lineItemId = firstLineItemId + idx;
          tx.set(fdb().collection("retail_sale_items").doc(String(lineItemId)), {
            id: lineItemId, retailSaleId: saleId, itemId: line.itemId,
            itemName: item.name, itemSku: item.sku, description: item.description, unit: item.unit,
            quantity: line.quantity, unitPrice, lineTotal,
            createdAt: now,
          });

          const prevStock = runningStock.get(line.itemId)!;
          const newStock = prevStock - line.quantity;
          runningStock.set(line.itemId, newStock);

          const stockTxnId = firstStockTxnId + idx;
          tx.set(fdb().collection("stock_transactions").doc(String(stockTxnId)), {
            id: stockTxnId, itemId: line.itemId, type: "stock_out", quantity: line.quantity,
            reference: `Retail Sale #${saleId}`,
            purpose: retailPurposeOption?.value ?? "Retail Sale",
            purposeOptionId: retailPurposeOption?.id ?? null,
            purposeRefId: saleId, purposeRefName: `Retail Sale #${saleId}`,
            accountId: null, accountName: null,
            contactId: input.contactId, contactName: customerName,
            notes: input.notes ?? null,
            createdBy: ctx.user.id, createdByName: ctx.user.name || "Unknown",
            createdAt: now,
          });

          const auditId = firstAuditLogId + idx;
          tx.set(fdb().collection("inventory_audit_log").doc(String(auditId)), {
            id: auditId, itemId: line.itemId, itemName: item.name, itemSku: item.sku,
            transactionType: "stock_out", quantity: line.quantity,
            previousStock: prevStock, newStock,
            sourceLocation: item.warehouseLocation ?? null, destinationLocation: null,
            reference: `Retail Sale #${saleId}`, purpose: retailPurposeOption?.value ?? "Retail Sale",
            notes: input.notes ?? null,
            performedBy: ctx.user.id, performedByName: ctx.user.name || "Unknown",
            createdAt: now,
          });

          tx.set(fdb().collection("inventory_items").doc(String(line.itemId)), { stockOnHand: newStock, updatedAt: now }, { merge: true });
        });

        tx.set(fdb().collection("retail_sales").doc(String(saleId)), {
          id: saleId,
          contactId: input.contactId,
          customerName,
          saleDate,
          subtotal: money(subtotal),
          totalAmount: money(subtotal),
          notes: input.notes ?? null,
          createdBy: ctx.user.id, createdByName: ctx.user.name || "Unknown",
          createdAt: now, updatedAt: now,
        });
      });

      await fsAudit(ctx.user.id, ctx.user.name, "create", "retail_sale", saleId, `Recorded retail sale #${saleId} for ${customerName ?? `customer #${input.contactId}`} (${input.items.length} item line(s))`);
      return { success: true, id: saleId };
    }),
    // Deliberately narrow: line items are immutable after creation (see report to the
    // UI-building agent for the reasoning). Only the customer, date, and notes can be
    // changed here — changing items requires delete + recreate.
    update: protectedProcedure.input(z.object({
      id: z.number(),
      contactId: z.number().optional(),
      saleDate: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!["admin", "subadmin"].includes(ctx.user.role)) {
        throw new Error("Only Admin or Sub Admin can edit retail sales");
      }
      const { id, contactId, saleDate, notes } = input;
      const updates: Record<string, unknown> = {};
      if (contactId !== undefined) {
        const contact = await fsGetById<Contact>("contacts", contactId);
        if (!contact) throw new Error("Selected customer does not exist");
        updates.contactId = contactId;
        updates.customerName = personName(contact);
      }
      if (saleDate !== undefined) updates.saleDate = new Date(saleDate);
      if (notes !== undefined) updates.notes = notes;
      await fsUpdateOne("retail_sales", id, updates);
      await fsAudit(ctx.user.id, ctx.user.name, "update", "retail_sale", id, `Updated retail sale #${id}`);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (!["admin", "subadmin"].includes(ctx.user.role)) {
        throw new Error("Only Admin or Sub Admin can delete retail sales");
      }
      const sale = await fsGetById<RetailSale>("retail_sales", input.id);
      if (!sale) throw new Error("Retail sale not found");
      const lineItems = await fsListAll<RetailSaleItem>("retail_sale_items", { where: [["retailSaleId", "==", input.id]] });

      // Pre-allocate reversal ids up front, same reasoning as create().
      const firstReversalTxnId = await fsAllocateIds("stock_transactions", lineItems.length);
      const firstReversalAuditId = await fsAllocateIds("inventory_audit_log", lineItems.length);
      const now = new Date();

      await fdb().runTransaction(async (tx) => {
        // Re-read the sale inside the transaction. The existence check above runs
        // outside it, so two concurrent deletes of the same sale would both get past
        // it; the loser's retry would then restore the same stock a second time while
        // its tx.delete() calls no-op silently.
        const saleRef = fdb().collection("retail_sales").doc(String(input.id));
        const saleSnap = await tx.get(saleRef);
        if (!saleSnap.exists) throw new Error("Retail sale not found");

        const itemIds = Array.from(new Set(lineItems.map(li => li.itemId)));
        // Guard tx.getAll(), which throws if called with zero refs — a sale could in
        // principle have no line items (e.g. a pre-existing corrupt record).
        const itemSnaps = itemIds.length > 0
          ? await tx.getAll(...itemIds.map(id => fdb().collection("inventory_items").doc(String(id))))
          : [];
        // A referenced item may have since been deleted from Inventory; restore stock
        // for items that still exist, but still write the compensating history rows
        // for every line so the reversal is fully audited either way.
        const itemById = new Map<number, InventoryItem | undefined>();
        itemSnaps.forEach((snap, idx) => {
          itemById.set(itemIds[idx], snap.exists ? fsDocToData<InventoryItem>(snap) : undefined);
        });
        const runningStock = new Map<number, number>(itemIds.map(id => [id, itemById.get(id)?.stockOnHand ?? 0]));

        lineItems.forEach((li, idx) => {
          const item = itemById.get(li.itemId);
          const prevStock = runningStock.get(li.itemId)!;
          const newStock = prevStock + li.quantity;
          runningStock.set(li.itemId, newStock);

          const txnId = firstReversalTxnId + idx;
          tx.set(fdb().collection("stock_transactions").doc(String(txnId)), {
            id: txnId, itemId: li.itemId, type: "stock_in", quantity: li.quantity,
            reference: `Reversal of Retail Sale #${input.id}`, purpose: "Retail Sale Reversal",
            purposeOptionId: null, purposeRefId: input.id, purposeRefName: `Retail Sale #${input.id}`,
            accountId: null, accountName: null,
            contactId: sale.contactId, contactName: sale.customerName,
            notes: `Retail sale #${input.id} deleted`,
            createdBy: ctx.user.id, createdByName: ctx.user.name || "Unknown",
            createdAt: now,
          });

          const auditId = firstReversalAuditId + idx;
          tx.set(fdb().collection("inventory_audit_log").doc(String(auditId)), {
            id: auditId, itemId: li.itemId, itemName: item?.name ?? li.itemName, itemSku: item?.sku ?? li.itemSku,
            transactionType: "stock_in", quantity: li.quantity,
            previousStock: prevStock, newStock,
            sourceLocation: null, destinationLocation: item?.warehouseLocation ?? null,
            reference: `Reversal of Retail Sale #${input.id}`, purpose: "Retail Sale Reversal",
            notes: `Retail sale #${input.id} deleted`,
            performedBy: ctx.user.id, performedByName: ctx.user.name || "Unknown",
            createdAt: now,
          });

          if (item) {
            tx.set(fdb().collection("inventory_items").doc(String(li.itemId)), { stockOnHand: newStock, updatedAt: now }, { merge: true });
          }
        });

        lineItems.forEach(li => tx.delete(fdb().collection("retail_sale_items").doc(String(li.id))));
        tx.delete(saleRef);
      });

      await fsAudit(ctx.user.id, ctx.user.name, "delete", "retail_sale", input.id, `Deleted retail sale #${input.id} for ${sale.customerName ?? `customer #${sale.contactId}`}, restored stock for ${lineItems.length} line item(s)`);
      return { success: true };
    }),
  }),

  // ============ PURCHASE ORDERS ============
  purchaseOrders: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      supplierId: z.number().optional(),
      deliveryStatus: z.string().optional(),
      paymentStatus: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }).optional()).query(async ({ input }) => {
      const { search, supplierId, deliveryStatus, paymentStatus, dateFrom, dateTo, page = 1, limit = 20 } = input || {};
      const [allPos, poItems] = await Promise.all([
        fsListAll<PurchaseOrder>("purchase_orders"),
        search ? fsListAll<PurchaseOrderItem>("purchase_order_items") : Promise.resolve([] as PurchaseOrderItem[]),
      ]);
      let items = allPos;
      if (supplierId) items = items.filter(p => p.supplierId === supplierId);
      if (deliveryStatus) items = items.filter(p => p.deliveryStatus === deliveryStatus);
      if (paymentStatus) items = items.filter(p => p.paymentStatus === paymentStatus);
      if (dateFrom) { const from = new Date(dateFrom).getTime(); items = items.filter(p => p.createdAt.getTime() >= from); }
      if (dateTo) { const to = new Date(dateTo).getTime(); items = items.filter(p => p.createdAt.getTime() <= to); }
      if (search) {
        const s = search.trim().toLowerCase();
        const poIdsWithMatchingItems = new Set(
          poItems
            .filter(i => (i.itemName || "").toLowerCase().includes(s) || (i.description || "").toLowerCase().includes(s) || (i.itemSku || "").toLowerCase().includes(s))
            .map(i => i.purchaseOrderId)
        );
        items = items.filter(p => {
          if ((p.poNumber || "").toLowerCase().includes(s)) return true;
          if ((p.supplier || "").toLowerCase().includes(s)) return true;
          if ((p.notes || "").toLowerCase().includes(s)) return true;
          const d = p.createdAt;
          const ymd = d.toISOString().slice(0, 10);
          const my = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          const y = String(d.getFullYear());
          if (ymd.includes(s) || my.includes(s) || y.includes(s)) return true;
          if (poIdsWithMatchingItems.has(p.id)) return true;
          return false;
        });
      }
      items = items.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      const pageItems = items.slice(start, start + limit);
      return { items: pageItems, total, page, limit, totalPages };
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const po = await fsGetById<PurchaseOrder>("purchase_orders", input.id);
      if (!po) throw new Error("Purchase order not found");
      const [items, payments, statusHistory] = await Promise.all([
        fsListAll<PurchaseOrderItem>("purchase_order_items", { where: [["purchaseOrderId", "==", input.id]] }),
        fsListAll<PoPayment>("po_payments", { where: [["purchaseOrderId", "==", input.id]] }),
        fsListAll<{ id: number; purchaseOrderId: number; type: string; status: string; eventDate: Date; changedBy: number; changedByName: string; createdAt: Date }>("po_status_history", { where: [["purchaseOrderId", "==", input.id]] }),
      ]);
      payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      statusHistory.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
      return { ...po, items, payments, statusHistory };
    }),

    create: protectedProcedure.input(z.object({
      supplier: z.string().min(1),
      supplierId: z.number().optional(),
      notes: z.string().optional(),
      orderedAt: z.string().optional(),
      vatEnabled: z.boolean().default(false),
      vatRate: z.string().optional(),
      discountType: z.enum(["none", "percentage", "fixed"]).default("none"),
      discountValue: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        itemName: z.string().optional(),
        itemSku: z.string().optional(),
        description: z.string().optional(),
        unit: z.string().optional(),
        quantity: z.number().min(1),
        unitPrice: z.string().optional(),
      })).min(1),
    })).mutation(async ({ input, ctx }) => {
      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      // Calculate subtotal
      let subtotal = 0;
      const lineItems = input.items.map(item => {
        const lineTotal = item.quantity * parseFloat(item.unitPrice || "0");
        subtotal += lineTotal;
        return { ...item, lineTotal: money(lineTotal), unitPrice: item.unitPrice || "0" };
      });
      // Apply discount
      let discountAmount = 0;
      if (input.discountType === "percentage") {
        discountAmount = subtotal * (parseFloat(input.discountValue || "0") / 100);
      } else if (input.discountType === "fixed") {
        discountAmount = parseFloat(input.discountValue || "0");
      }
      const afterDiscount = subtotal - discountAmount;
      // Apply VAT
      let vatAmount = 0;
      if (input.vatEnabled) {
        vatAmount = afterDiscount * (parseFloat(input.vatRate || "12") / 100);
      }
      const totalAmount = afterDiscount + vatAmount;
      const poId = await fsInsertOne("purchase_orders", {
        poNumber,
        supplier: input.supplier,
        supplierId: input.supplierId ?? null,
        status: "draft",
        deliveryStatus: "not_delivered",
        paymentStatus: "unpaid",
        totalAmount: money(totalAmount),
        paidAmount: "0",
        vatEnabled: input.vatEnabled ? 1 : 0,
        vatRate: input.vatRate || "12",
        discountType: input.discountType || "none",
        discountValue: input.discountValue || "0",
        notes: input.notes ?? null,
        orderedAt: input.orderedAt ? new Date(input.orderedAt) : null,
        receivedAt: null,
        deliveredAt: null,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || 'Unknown',
      });
      // Insert line items
      await fsInsertMany("purchase_order_items", lineItems.map(item => ({
        purchaseOrderId: poId,
        itemId: item.itemId,
        itemName: item.itemName ?? null,
        itemSku: item.itemSku ?? null,
        description: item.description ?? null,
        unit: item.unit ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        receivedQuantity: 0,
      })));
      await fsAudit(ctx.user.id, ctx.user.name, "create", "purchase_order", poId, `Created PO: ${poNumber} for ${input.supplier} with ${input.items.length} items, total ₱${totalAmount.toLocaleString()}`);
      return { success: true, poId, poNumber };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.string().optional(),
      deliveryStatus: z.string().optional(),
      paymentStatus: z.string().optional(),
      notes: z.string().optional(),
      vatEnabled: z.boolean().optional(),
      vatRate: z.string().optional(),
      discountType: z.enum(["none", "percentage", "fixed"]).optional(),
      discountValue: z.string().optional(),
      recalculate: z.boolean().optional(),
      // User-picked dates for the order-status / delivery-status change (ISO yyyy-mm-dd)
      statusDate: z.string().optional(),
      deliveryDate: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const current = await fsGetById<PurchaseOrder>("purchase_orders", input.id);
      const updates: Record<string, unknown> = {};
      const historyInserts: Promise<unknown>[] = [];

      if (input.status) {
        updates.status = input.status;
        if (current && input.status !== current.status) {
          const when = input.statusDate ? new Date(input.statusDate) : new Date();
          if (input.status === "received") updates.receivedAt = when;
          historyInserts.push(fsInsertOne("po_status_history", {
            purchaseOrderId: input.id,
            type: "order",
            status: input.status,
            eventDate: when,
            changedBy: ctx.user.id,
            changedByName: ctx.user.name || "Unknown",
          }));
        }
      }
      if (input.deliveryStatus) {
        updates.deliveryStatus = input.deliveryStatus;
        const when = input.deliveryDate ? new Date(input.deliveryDate) : new Date();
        if (input.deliveryStatus === "fully_delivered") updates.deliveredAt = when;
        if (current && input.deliveryStatus !== current.deliveryStatus) {
          historyInserts.push(fsInsertOne("po_status_history", {
            purchaseOrderId: input.id,
            type: "delivery",
            status: input.deliveryStatus,
            eventDate: when,
            changedBy: ctx.user.id,
            changedByName: ctx.user.name || "Unknown",
          }));
        }
      }
      if (input.paymentStatus) updates.paymentStatus = input.paymentStatus;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.vatEnabled !== undefined) updates.vatEnabled = input.vatEnabled ? 1 : 0;
      if (input.vatRate !== undefined) updates.vatRate = input.vatRate;
      if (input.discountType !== undefined) updates.discountType = input.discountType;
      if (input.discountValue !== undefined) updates.discountValue = input.discountValue;
      // Recalculate total if VAT/discount changed
      if (input.recalculate) {
        const items = await fsListAll<PurchaseOrderItem>("purchase_order_items", { where: [["purchaseOrderId", "==", input.id]] });
        let subtotal = 0;
        for (const item of items) { subtotal += parseFloat(item.lineTotal || "0"); }
        const vatEnabled = input.vatEnabled !== undefined ? input.vatEnabled : false;
        const vatRate = parseFloat(input.vatRate || "12");
        const discountType = input.discountType || "none";
        const discountValue = parseFloat(input.discountValue || "0");
        let discountAmount = 0;
        if (discountType === "percentage") discountAmount = subtotal * (discountValue / 100);
        else if (discountType === "fixed") discountAmount = discountValue;
        const afterDiscount = subtotal - discountAmount;
        let vatAmount = 0;
        if (vatEnabled) vatAmount = afterDiscount * (vatRate / 100);
        updates.totalAmount = money(afterDiscount + vatAmount);
      }
      await fsUpdateOne("purchase_orders", input.id, updates);
      if (historyInserts.length) await Promise.all(historyInserts);
      await fsAudit(ctx.user.id, ctx.user.name, "update", "purchase_order", input.id, `Updated PO #${input.id}: ${JSON.stringify(updates)}`);
      return { success: true };
    }),

    addPayment: protectedProcedure.input(z.object({
      purchaseOrderId: z.number(),
      amount: z.string().min(1),
      paymentDate: z.string().min(1),
      paymentMethod: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await fsInsertOne("po_payments", {
        purchaseOrderId: input.purchaseOrderId,
        amount: input.amount,
        paymentDate: new Date(input.paymentDate),
        paymentMethod: input.paymentMethod ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      });
      // Recalculate paid amount
      const [payments, po] = await Promise.all([
        fsListAll<PoPayment>("po_payments", { where: [["purchaseOrderId", "==", input.purchaseOrderId]] }),
        fsGetById<PurchaseOrder>("purchase_orders", input.purchaseOrderId),
      ]);
      const paidAmount = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const totalAmount = parseFloat(po?.totalAmount || "0");
      let paymentStatus: "unpaid" | "partially_paid" | "paid" = "unpaid";
      if (paidAmount >= totalAmount && totalAmount > 0) paymentStatus = "paid";
      else if (paidAmount > 0) paymentStatus = "partially_paid";
      await fsUpdateOne("purchase_orders", input.purchaseOrderId, { paidAmount: money(paidAmount), paymentStatus });
      await fsAudit(ctx.user.id, ctx.user.name, "payment", "purchase_order", input.purchaseOrderId, `Payment of ₱${input.amount} recorded for PO #${input.purchaseOrderId}. Method: ${input.paymentMethod || 'N/A'}. Ref: ${input.reference || 'N/A'}`);
      return { success: true };
    }),

    // Get supplier-specific price for a given supplier+item pair
    getSupplierItemPrice: protectedProcedure.input(z.object({
      supplierId: z.number(),
      itemId: z.number(),
    })).query(async ({ input }) => {
      const records = await fsListAll<SupplierItemPrice>("supplier_item_prices", {
        where: [["supplierId", "==", input.supplierId], ["inventoryItemId", "==", input.itemId]],
      });
      return records[0] || null;
    }),

    // Get all supplier prices for a given supplier (used in PO create)
    getSupplierPrices: protectedProcedure.input(z.object({
      supplierId: z.number(),
    })).query(async ({ input }) => {
      return fsListAll<SupplierItemPrice>("supplier_item_prices", { where: [["supplierId", "==", input.supplierId]] });
    }),

    // Update supplier-item price record (upsert)
    updateSupplierItemPrice: protectedProcedure.input(z.object({
      supplierId: z.number(),
      inventoryItemId: z.number(),
      unitPrice: z.string(),
      purchaseOrderId: z.number().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Upsert: check if record exists
      const existingRows = await fsListAll<SupplierItemPrice>("supplier_item_prices", {
        where: [["supplierId", "==", input.supplierId], ["inventoryItemId", "==", input.inventoryItemId]],
      });
      const existing = existingRows[0];
      if (existing) {
        await fsUpdateOne("supplier_item_prices", existing.id, {
          unitPrice: input.unitPrice,
          lastPurchaseOrderId: input.purchaseOrderId ?? null,
          updatedBy: ctx.user.id,
        });
      } else {
        await fsInsertOne("supplier_item_prices", {
          supplierId: input.supplierId,
          inventoryItemId: input.inventoryItemId,
          unitPrice: input.unitPrice,
          lastPurchaseOrderId: input.purchaseOrderId ?? null,
          updatedBy: ctx.user.id,
        });
      }
      return { success: true };
    }),

    // Update item master's current purchase price
    updateItemPurchasePrice: protectedProcedure.input(z.object({
      itemId: z.number(),
      purchasePrice: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Get current price for history
      const currentItem = await fsGetById<InventoryItem>("inventory_items", input.itemId);
      const oldPrice = currentItem?.purchasePrice || "0";
      if (oldPrice !== input.purchasePrice) {
        await fsInsertOne("item_price_history", { itemId: input.itemId, priceType: "purchase", oldPrice, newPrice: input.purchasePrice, changedBy: ctx.user.id, changedByName: ctx.user.name || "Unknown", notes: input.notes || null });
      }
      await fsUpdateOne("inventory_items", input.itemId, { purchasePrice: input.purchasePrice });
      await fsAudit(ctx.user.id, ctx.user.name, "update_price", "inventory_item", input.itemId, `Updated purchase price to ₱${input.purchasePrice}`);
      return { success: true };
    }),

    // Analytics: purchases by supplier
    analyticsBySupplier: protectedProcedure.query(async () => {
      const allPos = await fsListAll<PurchaseOrder>("purchase_orders");
      const groups = new Map<string, { supplierId: number | null; supplier: string; totalPOs: number; totalValue: number; totalPaid: number }>();
      for (const po of allPos) {
        const key = `${po.supplierId ?? "null"}::${po.supplier}`;
        const g = groups.get(key) ?? { supplierId: po.supplierId, supplier: po.supplier, totalPOs: 0, totalValue: 0, totalPaid: 0 };
        g.totalPOs += 1;
        g.totalValue += Number(po.totalAmount || 0);
        g.totalPaid += Number(po.paidAmount || 0);
        groups.set(key, g);
      }
      return Array.from(groups.values())
        .sort((a, b) => b.totalValue - a.totalValue)
        .map(g => ({ supplierId: g.supplierId, supplier: g.supplier, totalPOs: g.totalPOs, totalValue: money(g.totalValue), totalPaid: money(g.totalPaid) }));
    }),

    // Analytics: outstanding POs
    analyticsOutstanding: protectedProcedure.query(async () => {
      const allPos = await fsListAll<PurchaseOrder>("purchase_orders", { select: ["paymentStatus", "deliveryStatus"] });
      let unpaid = 0, partiallyPaid = 0, notDelivered = 0, partiallyDelivered = 0;
      for (const po of allPos) {
        if (po.paymentStatus === "unpaid") unpaid++;
        else if (po.paymentStatus === "partially_paid") partiallyPaid++;
        if (po.deliveryStatus === "not_delivered") notDelivered++;
        else if (po.deliveryStatus === "partially_delivered") partiallyDelivered++;
      }
      return { unpaid, partiallyPaid, notDelivered, partiallyDelivered };
    }),
  }),

  // ============ BOM PACKAGES ============
  bom: router({
    list: protectedProcedure.query(async () => {
      const packages = await fsListAll<BomPackage>("bom_packages");
      return packages
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 200);
    }),
    getItems: protectedProcedure.input(z.object({ packageId: z.number() })).query(async ({ input }) => {
      const [bomItems, items] = await Promise.all([
        fsListAll<BomPackageItem>("bom_package_items", { where: [["packageId", "==", input.packageId]] }),
        fsListAll<InventoryItem>("inventory_items"),
      ]);
      const itemMap = new Map(items.map(i => [i.id, i]));
      return bomItems.map(bi => {
        const it = itemMap.get(bi.itemId);
        return {
          ...bi,
          itemName: it?.name ?? null,
          itemSku: it?.sku ?? null,
          sellingPrice: it?.sellingPrice ?? null,
        };
      });
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1), description: z.string().optional(),
      systemSize: z.string().optional(), systemType: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const id = await fsInsertOne("bom_packages", {
        name: input.name,
        description: input.description ?? null,
        systemSize: input.systemSize ?? null,
        systemType: input.systemType ?? null,
        totalCost: null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "bom_package", id, `Created BOM: ${input.name}`);
      return { success: true };
    }),
    addItem: protectedProcedure.input(z.object({
      packageId: z.number(), itemId: z.number(), quantity: z.number().min(1),
    })).mutation(async ({ input }) => {
      await fsInsertOne("bom_package_items", {
        packageId: input.packageId, itemId: input.itemId, quantity: input.quantity,
      });
      await recalcBomTotalCost(input.packageId);
      return { success: true };
    }),
    removeItem: protectedProcedure.input(z.object({ id: z.number(), packageId: z.number() })).mutation(async ({ input }) => {
      await fsDeleteOne("bom_package_items", input.id);
      await recalcBomTotalCost(input.packageId);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const packageItems = await fsListAll<BomPackageItem>("bom_package_items", { where: [["packageId", "==", input.id]] });
      await Promise.all(packageItems.map(pi => fsDeleteOne("bom_package_items", pi.id)));
      await fsDeleteOne("bom_packages", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "bom_package", input.id, `Deleted BOM #${input.id}`);
      return { success: true };
    }),
  }),

  // ============ QUOTATIONS ============
  quotations: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      address: z.string().optional(),
      kwRating: z.string().optional(),
      setupType: z.string().optional(),
      month: z.number().optional(),
      year: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional()).query(async ({ input }) => {
      const p = input || { page: 1, limit: 20 };
      const [allQuotes, accounts, contacts, opportunities, users] = await Promise.all([
        fsListAll<Quotation>("quotations"),
        fsListAll<Account>("accounts"),
        fsListAll<Contact>("contacts"),
        fsListAll<Opportunity>("opportunities"),
        listUsersRaw(),
      ]);
      const accountMap = new Map(accounts.map(a => [a.id, a]));
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const opportunityMap = new Map(opportunities.map(o => [o.id, o]));
      const userMap = new Map(users.map(u => [u.id, u]));
      let items = allQuotes;
      if (p.address) items = items.filter(q => (q.customerAddress || "").toLowerCase().includes(p.address!.toLowerCase()));
      if (p.kwRating) items = items.filter(q => (q.title || "").toLowerCase().includes(p.kwRating!.toLowerCase()));
      if (p.setupType) items = items.filter(q => (q.title || "").toLowerCase().includes(p.setupType!.toLowerCase()));
      if (p.year) {
        const startOfYear = new Date(p.year, (p.month || 1) - 1, 1).getTime();
        const endDate = (p.month ? new Date(p.year, p.month, 0, 23, 59, 59) : new Date(p.year, 11, 31, 23, 59, 59)).getTime();
        items = items.filter(q => q.createdAt.getTime() >= startOfYear && q.createdAt.getTime() <= endDate);
      }
      if (p.dateFrom) { const from = new Date(p.dateFrom).getTime(); items = items.filter(q => q.createdAt.getTime() >= from); }
      if (p.dateTo) { const to = new Date(p.dateTo + "T23:59:59").getTime(); items = items.filter(q => q.createdAt.getTime() <= to); }
      if (p.search) {
        const s = p.search.trim().toLowerCase();
        items = items.filter(q => {
          if ((q.customerName || "").toLowerCase().includes(s)) return true;
          if ((q.title || "").toLowerCase().includes(s)) return true;
          if ((q.quoteNumber || "").toLowerCase().includes(s)) return true;
          if ((q.customerAddress || "").toLowerCase().includes(s)) return true;
          if ((q.customerEmail || "").toLowerCase().includes(s)) return true;
          if ((q.notes || "").toLowerCase().includes(s)) return true;
          const acct = q.accountId ? accountMap.get(q.accountId) : undefined;
          if (acct && (acct.name || "").toLowerCase().includes(s)) return true;
          const d = q.createdAt;
          const ymd = d.toISOString().slice(0, 10);
          const my = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          const y = String(d.getFullYear());
          return ymd.includes(s) || my.includes(s) || y.includes(s);
        });
      }
      items = items.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = items.length;
      const pageItems = items.slice((p.page - 1) * p.limit, (p.page - 1) * p.limit + p.limit);
      // Denormalize FK names for the page's rows in 4 batched reads (one per referenced
      // collection) rather than one Firestore read per quotation — see personName/nameFor above.
      return {
        items: pageItems.map(q => ({
          ...q,
          accountName: nameFor(q.accountId, accountMap, a => a.name),
          contactName: nameFor(q.contactId, contactMap, personName),
          opportunityName: nameFor(q.opportunityId, opportunityMap, o => o.title),
          approvedByName: nameFor(q.approvedBy, userMap, u => u.name),
          lastEditedByName: nameFor(q.lastEditedBy, userMap, u => u.name),
        })),
        total,
      };
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const quote = await fsGetById<Quotation>("quotations", input.id);
      if (!quote) return null;
      const [account, contact, opportunity, approvedByUser, lastEditedByUser] = await Promise.all([
        quote.accountId != null ? fsGetById<Account>("accounts", quote.accountId) : Promise.resolve(null),
        quote.contactId != null ? fsGetById<Contact>("contacts", quote.contactId) : Promise.resolve(null),
        quote.opportunityId != null ? fsGetById<Opportunity>("opportunities", quote.opportunityId) : Promise.resolve(null),
        quote.approvedBy != null ? getUserById(quote.approvedBy) : Promise.resolve(null),
        quote.lastEditedBy != null ? getUserById(quote.lastEditedBy) : Promise.resolve(null),
      ]);
      return {
        ...quote,
        accountName: account?.name ?? null,
        contactName: contact ? personName(contact) : null,
        opportunityName: opportunity?.title ?? null,
        approvedByName: approvedByUser?.name ?? null,
        lastEditedByName: lastEditedByUser?.name ?? null,
      };
    }),
    getItems: protectedProcedure.input(z.object({ quotationId: z.number() })).query(async ({ input }) => {
      return fsListAll<QuotationItem>("quotation_items", { where: [["quotationId", "==", input.quotationId]] });
    }),
    create: protectedProcedure.input(z.object({
      title: z.string().min(1), contactId: z.number().optional(),
      accountId: z.number().optional(),
      customerName: z.string().optional(), customerEmail: z.string().optional(),
      customerPhone: z.string().optional(), customerAddress: z.string().optional(), notes: z.string().optional(),
      opportunityId: z.number().optional(), discountPercent: z.string().optional(),
      discountManualAmount: z.string().optional(),
      vatEnabled: z.boolean().default(false), taxPercent: z.string().optional(),
      laborCost: z.string().optional(), installationFee: z.string().optional(),
      paymentTerms: z.string().optional(), warrantyTerms: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const quoteNumber = `QT-${Date.now().toString(36).toUpperCase()}`;
      // Auto-create contact if customerName is provided but no contactId is linked
      let contactId: number | null = input.contactId ?? null;
      if (!contactId && input.customerName && input.customerName.trim()) {
        // Check if contact already exists with this name
        const nameParts = input.customerName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || null;
        const candidates = await fsListAll<Contact>("contacts", { where: [["firstName", "==", firstName]] });
        const existing = candidates.find(c => (lastName ? c.lastName === lastName : (!c.lastName || c.lastName === "")));
        if (existing) {
          contactId = existing.id;
        } else {
          // Create new contact
          contactId = await fsInsertOne("contacts", {
            firstName,
            lastName,
            email: input.customerEmail || null,
            phone: input.customerPhone || null,
            company: null,
            position: null,
            address: input.customerAddress || null,
            city: null,
            notes: null,
            createdBy: ctx.user.id,
          });
          await fsAudit(ctx.user.id, ctx.user.name, "create", "contact", contactId, `Auto-created contact: ${input.customerName} (from quotation)`);
        }
      }
      const id = await fsInsertOne("quotations", {
        title: input.title,
        version: 1,
        status: "draft",
        opportunityId: input.opportunityId ?? null,
        contactId,
        accountId: input.accountId ?? null,
        customerName: input.customerName ?? null,
        customerEmail: input.customerEmail ?? null,
        customerPhone: input.customerPhone ?? null,
        customerAddress: input.customerAddress ?? null,
        subtotal: null,
        discountPercent: input.discountPercent ?? null,
        discountManualAmount: input.discountManualAmount ?? null,
        discountAmount: null,
        vatEnabled: input.vatEnabled ? 1 : 0,
        taxPercent: input.taxPercent ?? null,
        taxAmount: null,
        totalAmount: null,
        laborCost: input.laborCost ?? null,
        installationFee: input.installationFee ?? null,
        lastEditedBy: null,
        paymentTerms: input.paymentTerms ?? null,
        warrantyTerms: input.warrantyTerms ?? null,
        validUntil: null,
        notes: input.notes ?? null,
        approvedBy: null,
        approvedAt: null,
        quoteNumber,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || 'Unknown',
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "quotation", id, `Created quotation: ${quoteNumber}`);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), title: z.string().optional(), contactId: z.number().nullable().optional(),
      accountId: z.number().nullable().optional(),
      customerName: z.string().optional(), customerEmail: z.string().optional(),
      customerPhone: z.string().optional(), customerAddress: z.string().optional(), notes: z.string().optional(),
      opportunityId: z.number().nullable().optional(), discountPercent: z.string().optional(),
      discountManualAmount: z.string().optional(),
      vatEnabled: z.boolean().optional(), taxPercent: z.string().optional(),
      laborCost: z.string().optional(), installationFee: z.string().optional(),
      paymentTerms: z.string().optional(), warrantyTerms: z.string().optional(),
      status: z.enum(["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "expired"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, vatEnabled, ...fields } = input;
      const updateData: Record<string, unknown> = { ...fields, lastEditedBy: ctx.user.id };
      if (vatEnabled !== undefined) updateData.vatEnabled = vatEnabled ? 1 : 0;
      await fsUpdateOne("quotations", id, updateData);
      await recalcQuotationTotals(id);
      await fsAudit(ctx.user.id, ctx.user.name, "update", "quotation", id, `Updated quotation #${id}`);
      return { success: true };
    }),
    addItem: protectedProcedure.input(z.object({
      quotationId: z.number(), itemId: z.number().optional(), itemType: z.enum(["inventory", "labor", "custom"]).default("inventory"),
      description: z.string().min(1), quantity: z.number().min(1), unitPrice: z.string(),
    })).mutation(async ({ input }) => {
      const totalPrice = money(input.quantity * Number(input.unitPrice));
      await fsInsertOne("quotation_items", {
        quotationId: input.quotationId,
        itemId: input.itemId ?? null,
        itemType: input.itemType,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalPrice,
      });
      await recalcQuotationTotals(input.quotationId);
      return { success: true };
    }),
    removeItem: protectedProcedure.input(z.object({ id: z.number(), quotationId: z.number() })).mutation(async ({ input }) => {
      await fsDeleteOne("quotation_items", input.id);
      await recalcQuotationTotals(input.quotationId);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const items = await fsListAll<QuotationItem>("quotation_items", { where: [["quotationId", "==", input.id]] });
      await Promise.all(items.map(i => fsDeleteOne("quotation_items", i.id)));
      await fsDeleteOne("quotations", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "quotation", input.id, `Deleted quotation #${input.id}`);
      return { success: true };
    }),
    createDeliveryReceipt: protectedProcedure.input(z.object({
      quotationId: z.number(), deliveryDate: z.string(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const quote = await fsGetById<Quotation>("quotations", input.quotationId);
      if (!quote) throw new Error("Quotation not found");
      const receiptNumber = `DR-${Date.now().toString(36).toUpperCase()}`;
      const id = await fsInsertOne("delivery_receipts", {
        quotationId: input.quotationId, receiptNumber, deliveryDate: new Date(input.deliveryDate),
        customerName: quote.customerName ?? null, customerAddress: quote.customerAddress ?? null,
        projectReference: quote.title ?? null, notes: input.notes ?? null,
        createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      });
      return { success: true, receiptNumber, id };
    }),
    getDeliveryReceipts: protectedProcedure.input(z.object({ quotationId: z.number() })).query(async ({ input }) => {
      const receipts = await fsListAll<DeliveryReceipt>("delivery_receipts", { where: [["quotationId", "==", input.quotationId]] });
      return receipts.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
    createAcknowledgement: protectedProcedure.input(z.object({
      quotationId: z.number(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const quote = await fsGetById<Quotation>("quotations", input.quotationId);
      if (!quote) throw new Error("Quotation not found");
      const receiptNumber = `ACK-${Date.now().toString(36).toUpperCase()}`;
      const id = await fsInsertOne("acknowledgement_receipts", {
        type: "quotation", referenceId: input.quotationId, receiptNumber,
        customerName: quote.customerName ?? null, projectReference: quote.title ?? null,
        amount: quote.totalAmount ?? null, paymentDate: null, paymentMethod: null, paymentReference: null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      });
      return { success: true, receiptNumber, id };
    }),
    getAcknowledgements: protectedProcedure.input(z.object({ quotationId: z.number() })).query(async ({ input }) => {
      const acks = await fsListAll<AcknowledgementReceipt>("acknowledgement_receipts", {
        where: [["type", "==", "quotation"], ["referenceId", "==", input.quotationId]],
      });
      return acks.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
  }),

  // ============ NET METERING PAYMENTS ============
  netMeteringPayments: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().optional(), netMeteringId: z.number().optional() })).query(async ({ input }) => {
      const filters: [string, WhereFilterOp, any][] = [];
      if (input.projectId) filters.push(["projectId", "==", input.projectId]);
      if (input.netMeteringId) filters.push(["netMeteringId", "==", input.netMeteringId]);
      const [payments, acks] = await Promise.all([
        fsListAll<NetMeteringPayment>("net_metering_payments", { where: filters }),
        fsListAll<AcknowledgementReceipt>("acknowledgement_receipts", { where: [["type", "==", "net_metering_payment"]] }),
      ]);
      const ackMap = new Map<number, number>();
      acks.forEach(a => { if (!ackMap.has(a.referenceId) || a.id > ackMap.get(a.referenceId)!) ackMap.set(a.referenceId, a.id); });
      return payments
        .slice()
        .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime())
        .map(p => ({ ...p, lastAckId: ackMap.get(p.id) || null }));
    }),
    add: protectedProcedure.input(z.object({
      projectId: z.number(), netMeteringId: z.number(),
      paymentDate: z.string(), amount: z.string(), paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await fsInsertOne("net_metering_payments", {
        projectId: input.projectId, netMeteringId: input.netMeteringId,
        paymentDate: new Date(input.paymentDate), amount: input.amount,
        paymentMethod: input.paymentMethod ?? null, paymentReference: input.paymentReference ?? null,
        notes: input.notes ?? null, createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await fsDeleteOne("net_metering_payments", input.id);
      return { success: true };
    }),
    centralList: protectedProcedure.input(z.object({
      search: z.string().optional(),
      electricCompany: z.string().optional(),
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional()).query(async ({ input }) => {
      const p = input || { page: 1, limit: 20 };
      const [nmRecords, allPayments, projectsList, allBillings] = await Promise.all([
        fsListAll<NetMetering>("net_metering"),
        fsListAll<NetMeteringPayment>("net_metering_payments"),
        fsListAll<Project>("projects", { select: ["name", "customerName"] }),
        fsListAll<NetMeteringBilling>("net_metering_billings"),
      ]);
      const projectMap = new Map(projectsList.map(pr => [pr.id, pr]));
      const billingMap = new Map(allBillings.map(b => [b.netMeteringId, b]));
      let results = nmRecords
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(nm => {
          const payments = allPayments.filter(pm => pm.netMeteringId === nm.id);
          const totalPaid = payments.reduce((s, pm) => s + Number(pm.amount), 0);
          const lastPayment = payments.length > 0 ? payments.slice().sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime())[0] : null;
          const project = nm.projectId ? projectMap.get(nm.projectId) : null;
          const billing = billingMap.get(nm.id) || null;
          const totalBilled = Number(billing?.total || 0);
          return {
            id: nm.id, projectId: nm.projectId, projectName: project?.name || nm.projectName || "-",
            customerName: project?.customerName || nm.clientName || "-",
            electricCompany: nm.electricCompany || "-",
            totalPaid, paymentCount: payments.length,
            lastPaymentDate: lastPayment?.paymentDate || null,
            status: nm.status,
            // Billing side, so the roll-up shows what's owed as well as what's paid.
            billingNumber: billing?.billingNumber || null,
            totalBilled,
            balance: totalBilled - totalPaid,
          };
        });
      // Apply filters
      if (p.search) {
        const s = p.search.toLowerCase();
        results = results.filter(r => r.projectName.toLowerCase().includes(s) || r.customerName.toLowerCase().includes(s) || r.electricCompany.toLowerCase().includes(s));
      }
      if (p.electricCompany) results = results.filter(r => r.electricCompany.toLowerCase().includes(p.electricCompany!.toLowerCase()));
      if (p.status) results = results.filter(r => r.status === p.status);
      if (p.dateFrom) {
        const from = new Date(p.dateFrom).getTime();
        results = results.filter(r => r.lastPaymentDate && r.lastPaymentDate.getTime() >= from);
      }
      if (p.dateTo) {
        const to = new Date(p.dateTo + "T23:59:59").getTime();
        results = results.filter(r => r.lastPaymentDate && r.lastPaymentDate.getTime() <= to);
      }
      const total = results.length;
      const items = results.slice(((p.page || 1) - 1) * (p.limit || 20), (p.page || 1) * (p.limit || 20));
      return { items, total };
    }),
  }),

  // ============ ACKNOWLEDGEMENT RECEIPTS ============
  // ============ PROJECT BILLING ============
  // One billing sheet per project. Seeded from the contract amount, with
  // additions added on top; the total is the final amount billed to the client.
  projectBillings: router({
    get: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const rows = await fsListAll<ProjectBilling>("project_billings", {
        where: [["projectId", "==", input.projectId]],
      });
      return rows[0] ?? null;
    }),

    save: protectedProcedure.input(z.object({
      projectId: z.number(),
      items: z.array(z.object({ description: z.string().min(1), amount: z.number().nonnegative() })).min(1),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const items: ProjectBillingItem[] = input.items.map(it => ({ description: it.description, amount: money(it.amount) }));
      const total = money(input.items.reduce((sum, it) => sum + it.amount, 0));
      const existing = await fsListAll<ProjectBilling>("project_billings", {
        where: [["projectId", "==", input.projectId]],
      });

      if (existing[0]) {
        await fsUpdateOne("project_billings", existing[0].id, {
          items, total, notes: input.notes ?? existing[0].notes ?? null,
        });
        await fsAudit(ctx.user.id, ctx.user.name, "update", "project_billing", existing[0].id, `Updated project billing ${existing[0].billingNumber}: ${items.length} entries, total ₱${total}`);
        return { success: true, id: existing[0].id, billingNumber: existing[0].billingNumber };
      }

      const billingNumber = `PB-${Date.now().toString(36).toUpperCase()}`;
      const id = await fsInsertOne("project_billings", {
        projectId: input.projectId,
        billingNumber, items, total,
        notes: input.notes ?? null,
        createdBy: ctx.user.id, createdByName: ctx.user.name || "Unknown",
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "project_billing", id, `Issued project billing ${billingNumber}: ${items.length} entries, total ₱${total}`);
      return { success: true, id, billingNumber };
    }),
  }),

  // ============ NET METERING BILLING ============
  // One billing sheet per net metering record. Admins and sub-admins build it
  // up from free-text entries (description + amount); the total is what the
  // client owes, and net metering payments are settled against it.
  netMeteringBillings: router({
    get: protectedProcedure.input(z.object({ netMeteringId: z.number() })).query(async ({ input }) => {
      const rows = await fsListAll<NetMeteringBilling>("net_metering_billings", {
        where: [["netMeteringId", "==", input.netMeteringId]],
      });
      return rows[0] ?? null;
    }),

    save: protectedProcedure.input(z.object({
      netMeteringId: z.number(),
      projectId: z.number().optional(),
      items: z.array(z.object({ description: z.string().min(1), amount: z.number().nonnegative() })).min(1),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const items = input.items.map(it => ({ description: it.description, amount: money(it.amount) }));
      const total = money(input.items.reduce((sum, it) => sum + it.amount, 0));
      const existing = await fsListAll<NetMeteringBilling>("net_metering_billings", {
        where: [["netMeteringId", "==", input.netMeteringId]],
      });

      if (existing[0]) {
        await fsUpdateOne("net_metering_billings", existing[0].id, {
          items, total,
          notes: input.notes ?? existing[0].notes ?? null,
          projectId: input.projectId ?? existing[0].projectId ?? null,
        });
        await fsAudit(ctx.user.id, ctx.user.name, "update", "net_metering_billing", existing[0].id, `Updated NM billing ${existing[0].billingNumber}: ${items.length} entries, total ₱${total}`);
        return { success: true, id: existing[0].id, billingNumber: existing[0].billingNumber };
      }

      const billingNumber = `NMB-${Date.now().toString(36).toUpperCase()}`;
      const id = await fsInsertOne("net_metering_billings", {
        netMeteringId: input.netMeteringId,
        projectId: input.projectId ?? null,
        billingNumber, items, total,
        notes: input.notes ?? null,
        createdBy: ctx.user.id, createdByName: ctx.user.name || "Unknown",
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "net_metering_billing", id, `Issued NM billing ${billingNumber}: ${items.length} entries, total ₱${total}`);
      return { success: true, id, billingNumber };
    }),
  }),

  acknowledgements: router({
    createForProjectPayment: protectedProcedure.input(z.object({
      paymentId: z.number(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const payment = await fsGetById<ProjectPayment>("project_payments", input.paymentId);
      if (!payment) throw new Error("Payment not found");
      const project = await fsGetById<Project>("projects", payment.projectId);
      const receiptNumber = `ACK-${Date.now().toString(36).toUpperCase()}`;
      const id = await fsInsertOne("acknowledgement_receipts", {
        type: "project_payment", referenceId: input.paymentId, receiptNumber,
        customerName: project?.customerName ?? null, projectReference: project?.name ?? null,
        amount: payment.amount, paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod ?? null, paymentReference: payment.paymentReference ?? null,
        notes: input.notes ?? null, createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      });
      return { success: true, receiptNumber, id };
    }),
    createForNetMeteringPayment: protectedProcedure.input(z.object({
      paymentId: z.number(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const payment = await fsGetById<NetMeteringPayment>("net_metering_payments", input.paymentId);
      if (!payment) throw new Error("Payment not found");
      const project = await fsGetById<Project>("projects", payment.projectId);
      const receiptNumber = `ACK-${Date.now().toString(36).toUpperCase()}`;
      const id = await fsInsertOne("acknowledgement_receipts", {
        type: "net_metering_payment", referenceId: input.paymentId, receiptNumber,
        customerName: project?.customerName ?? null, projectReference: `${project?.name || ""} - Net Metering`,
        amount: payment.amount, paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod ?? null, paymentReference: payment.paymentReference ?? null,
        notes: input.notes ?? null, createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      });
      return { success: true, receiptNumber, id };
    }),
    getForPayment: protectedProcedure.input(z.object({ paymentId: z.number(), type: z.enum(["project_payment", "net_metering_payment"]) })).query(async ({ input }) => {
      const acks = await fsListAll<AcknowledgementReceipt>("acknowledgement_receipts", {
        where: [["type", "==", input.type], ["referenceId", "==", input.paymentId]],
      });
      return acks.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
    getForProject: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const [projPayments, nmPayments] = await Promise.all([
        fsListAll<ProjectPayment>("project_payments", { where: [["projectId", "==", input.projectId]] }),
        fsListAll<NetMeteringPayment>("net_metering_payments", { where: [["projectId", "==", input.projectId]] }),
      ]);
      const projIds = new Set(projPayments.map(p => p.id));
      const nmIds = new Set(nmPayments.map(p => p.id));
      if (projIds.size === 0 && nmIds.size === 0) return [];
      const acks = await fsListAll<AcknowledgementReceipt>("acknowledgement_receipts");
      return acks
        .filter(a => (a.type === "project_payment" && projIds.has(a.referenceId)) || (a.type === "net_metering_payment" && nmIds.has(a.referenceId)))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return (await fsGetById<AcknowledgementReceipt>("acknowledgement_receipts", input.id)) || null;
    }),
  }),

  // ============ USERS (Admin only) ============
  // Migrated to Firestore (server/firestore-users.ts + server/firestore.ts).
  // Firestore has no server-side LIKE/join, so search is done in-memory and
  // the audit trail's userName is denormalized at write time instead of
  // joined at read time.
  users: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ input, ctx }) => {
      const role = ctx.user.role;
      const search = input?.search?.trim().toLowerCase();

      const matchesSearch = (u: { username: string | null; name: string | null; email: string | null; mobile: string | null; role: string }) => {
        if (!search) return true;
        return [u.username, u.name, u.email, u.mobile, u.role].some(
          v => v != null && String(v).toLowerCase().includes(search)
        );
      };
      const project = (u: Awaited<ReturnType<typeof listUsersRaw>>[number]) => ({
        id: u.id, name: u.name, username: u.username, email: u.email,
        mobile: u.mobile, role: u.role, status: u.status,
        createdAt: u.createdAt, lastSignedIn: u.lastSignedIn, createdBy: u.createdBy,
        loginMethod: u.loginMethod, totpEnabled: u.totpEnabled,
      });

      // Admin sees all users; SubAdmin sees users they created + themselves
      let scoped: Awaited<ReturnType<typeof listUsersRaw>>;
      if (role === "admin") {
        scoped = await listUsersRaw();
      } else if (role === "subadmin") {
        const all = await listUsersRaw();
        scoped = all.filter(u => u.createdBy === ctx.user.id || u.id === ctx.user.id);
      } else {
        return [];
      }

      return scoped
        .filter(matchesSearch)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 200)
        .map(project);
    }),
    create: protectedProcedure.input(z.object({
      username: z.string().min(3),
      password: z.string().min(6),
      name: z.string().min(1),
      email: z.string().email().optional(),
      mobile: z.string().optional(),
      role: z.enum(["admin", "subadmin", "purchaser", "staff", "sales_rep"]),
    })).mutation(async ({ input, ctx }) => {
      const { hashPassword, generateLocalOpenId } = await import("./localAuth");
      const currentRole = ctx.user.role;
      // Admin can create subadmin; SubAdmin can create purchaser, staff, sales_rep
      if (currentRole === "admin" && !["subadmin", "purchaser", "staff", "sales_rep"].includes(input.role)) {
        throw new Error("Admin can only create subadmin, purchaser, staff, or sales_rep accounts");
      }
      if (currentRole === "subadmin" && !["purchaser", "staff", "sales_rep"].includes(input.role)) {
        throw new Error("Sub Admin can only create purchaser, staff, or sales_rep accounts");
      }
      if (!["admin", "subadmin"].includes(currentRole)) {
        throw new Error("You do not have permission to create users");
      }
      // Check username uniqueness
      const existing = await getUserByUsername(input.username);
      if (existing) throw new Error("Username already exists");
      const passwordHash = await hashPassword(input.password);
      const openId = generateLocalOpenId();
      await createUser({
        openId,
        username: input.username,
        passwordHash,
        name: input.name,
        email: input.email || null,
        mobile: input.mobile || null,
        role: input.role,
        status: "active",
        loginMethod: "local",
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create_user", "user", 0, `Created ${input.role} user: ${input.username}`);
      return { success: true };
    }),
    updateRole: adminProcedure.input(z.object({ userId: z.number(), role: z.enum(["admin", "subadmin", "purchaser", "staff", "sales_rep"]) })).mutation(async ({ input, ctx }) => {
      await updateUser(input.userId, { role: input.role });
      await fsAudit(ctx.user.id, ctx.user.name, "update_role", "user", input.userId, `Changed role to ${input.role}`);
      return { success: true };
    }),
    deactivate: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      await updateUser(input.userId, { status: "inactive" });
      await fsAudit(ctx.user.id, ctx.user.name, "deactivate_user", "user", input.userId, "Deactivated user");
      return { success: true };
    }),
    activate: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      await updateUser(input.userId, { status: "active" });
      await fsAudit(ctx.user.id, ctx.user.name, "activate_user", "user", input.userId, "Activated user");
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) throw new Error("Cannot delete your own account");
      await deleteUser(input.userId);
      await fsAudit(ctx.user.id, ctx.user.name, "delete_user", "user", input.userId, "Deleted user");
      return { success: true };
    }),
    resetPassword: adminProcedure.input(z.object({ userId: z.number(), newPassword: z.string().min(6) })).mutation(async ({ input, ctx }) => {
      const { hashPassword } = await import("./localAuth");
      const passwordHash = await hashPassword(input.newPassword);
      await updateUser(input.userId, { passwordHash });
      await fsAudit(ctx.user.id, ctx.user.name, "reset_password", "user", input.userId, "Reset user password");
      return { success: true };
    }),
    // Admin: send password reset email to user
    sendResetEmail: adminProcedure.input(z.object({ userId: z.number(), origin: z.string() })).mutation(async ({ input, ctx }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) throw new Error("User not found");
      if (!targetUser.email) throw new Error("User does not have an email address");
      const { nanoid } = await import("nanoid");
      const resetToken = nanoid(40);
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await updateUser(input.userId, { resetToken, resetTokenExpiry });
      const resetLink = `${input.origin}/reset-password?token=${resetToken}`;
      const { sendPasswordResetEmail } = await import("./email");
      const sent = await sendPasswordResetEmail(targetUser.email, resetLink, targetUser.name || targetUser.username || "User");
      if (!sent) throw new Error("Failed to send email. Check SMTP configuration.");
      await fsAudit(ctx.user.id, ctx.user.name, "send_reset_email", "user", input.userId, `Sent password reset email to ${targetUser.email}`);
      return { success: true };
    }),
    // Admin: reset 2FA for a user (clears TOTP secret, user must set up again)
    reset2FA: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) throw new Error("User not found");
      await updateUser(input.userId, { totpEnabled: false, totpSecret: null });
      await fsAudit(ctx.user.id, ctx.user.name, "reset_2fa", "user", input.userId, `Reset 2FA for user ${targetUser.username || targetUser.name}`);
      return { success: true };
    }),
    // Admin: update another user's details (username, email, mobile)
    updateUserDetails: adminProcedure.input(z.object({
      userId: z.number(),
      username: z.string().min(3).optional(),
      email: z.string().email().optional(),
      mobile: z.string().optional(),
      name: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const updateData: Record<string, any> = {};
      if (input.username) {
        const existing = await getUserByUsername(input.username);
        if (existing && existing.id !== input.userId) throw new Error("Username already taken");
        updateData.username = input.username;
      }
      if (input.email !== undefined) updateData.email = input.email;
      if (input.mobile !== undefined) updateData.mobile = input.mobile;
      if (input.name !== undefined) updateData.name = input.name;
      if (Object.keys(updateData).length > 0) {
        await updateUser(input.userId, updateData);
        await fsAudit(ctx.user.id, ctx.user.name, "update_user_details", "user", input.userId, `Updated: ${Object.keys(updateData).join(", ")}`);
      }
      return { success: true };
    }),
    // Self-service: change own username
    changeUsername: protectedProcedure.input(z.object({ newUsername: z.string().min(3) })).mutation(async ({ input, ctx }) => {
      const existing = await getUserByUsername(input.newUsername);
      if (existing && existing.id !== ctx.user.id) throw new Error("Username already taken");
      await updateUser(ctx.user.id, { username: input.newUsername });
      return { success: true };
    }),
    // Self-service: change own password
    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string(), newPassword: z.string().min(6) })).mutation(async ({ input, ctx }) => {
      const bcrypt = await import("bcryptjs");
      const user = await getUserById(ctx.user.id);
      if (!user || !user.passwordHash) throw new Error("Cannot change password for OAuth accounts");
      const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!isValid) throw new Error("Current password is incorrect");
      const { hashPassword } = await import("./localAuth");
      const passwordHash = await hashPassword(input.newPassword);
      await updateUser(ctx.user.id, { passwordHash });
      return { success: true };
    }),
    // Self-service: update own profile
    updateProfile: protectedProcedure.input(z.object({ name: z.string().optional(), email: z.string().email().optional(), mobile: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const updateData: Record<string, any> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.mobile !== undefined) updateData.mobile = input.mobile;
      if (Object.keys(updateData).length > 0) {
        await updateUser(ctx.user.id, updateData);
      }
      return { success: true };
    }),
    // NOTE: reads only the Firestore `audit_logs` collection, populated by
    // this router's own mutations above (server/firestore.ts#audit). Actions
    // logged by not-yet-migrated routers still land in the MySQL `audit_logs`
    // table (drizzle) and will NOT show up here until those routers are
    // migrated too — see server/firestore.ts audit() for the write side.
    auditLogs: protectedProcedure.input(z.object({ limit: z.number().optional() })).query(async ({ input }) => {
      const all = await fsListAll<FsAuditLog>("audit_logs");
      return all
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, input.limit || 50)
        .map(a => ({
          id: a.id,
          action: a.action,
          entity: a.entity,
          entityId: a.entityId,
          details: a.details,
          createdAt: a.createdAt,
          userName: a.userName,
        }));
    }),
  }),
  // ============ PROJECTS ============
  projects: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      stage: z.string().optional(),
      typeOfSetup: z.string().optional(),
      sizeOfSetup: z.string().optional(),
      startDateFrom: z.string().optional(),
      startDateTo: z.string().optional(),
      createdDateFrom: z.string().optional(),
      createdDateTo: z.string().optional(),
    })).query(async ({ input }) => {
      const [allProjects, allPayments] = await Promise.all([
        fsListAll<Project>("projects"),
        fsListAll<ProjectPayment>("project_payments"),
      ]);
      let rows = allProjects;
      if (input.search) {
        const s = input.search.toLowerCase();
        rows = rows.filter(r => {
          if ((r.name || "").toLowerCase().includes(s)) return true;
          if ((r.customerName || "").toLowerCase().includes(s)) return true;
          if ((r.address || "").toLowerCase().includes(s)) return true;
          if ((r.sizeOfSetup || "").toLowerCase().includes(s)) return true;
          if ((r.typeOfSetup || "").toLowerCase().includes(s)) return true;
          if ((r.description || "").toLowerCase().includes(s)) return true;
          if ((r.notes || "").toLowerCase().includes(s)) return true;
          const d = r.createdAt;
          const ymd = d.toISOString().slice(0, 10);
          const my = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          const y = String(d.getFullYear());
          return ymd.includes(s) || my.includes(s) || y.includes(s);
        });
      }
      if (input.stage) rows = rows.filter(r => r.stage === input.stage);
      if (input.typeOfSetup) rows = rows.filter(r => r.typeOfSetup === input.typeOfSetup);
      if (input.sizeOfSetup) rows = rows.filter(r => (r.sizeOfSetup || "").toLowerCase().includes(input.sizeOfSetup!.toLowerCase()));
      if (input.startDateFrom) { const from = new Date(input.startDateFrom).getTime(); rows = rows.filter(r => r.startDate && r.startDate.getTime() >= from); }
      if (input.startDateTo) { const to = new Date(input.startDateTo).getTime(); rows = rows.filter(r => r.startDate && r.startDate.getTime() <= to); }
      if (input.createdDateFrom) { const from = new Date(input.createdDateFrom).getTime(); rows = rows.filter(r => r.createdAt.getTime() >= from); }
      if (input.createdDateTo) { const to = new Date(input.createdDateTo).getTime(); rows = rows.filter(r => r.createdAt.getTime() <= to); }
      rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);

      // Compute payment status for each project
      const paymentsMap = new Map<number, number>();
      for (const pmt of allPayments) {
        paymentsMap.set(pmt.projectId, (paymentsMap.get(pmt.projectId) || 0) + Number(pmt.amount));
      }
      return rows.map(r => {
        const totalAmount = parseFloat(r.totalProjectAmount || "0");
        const totalPaid = paymentsMap.get(r.id) || 0;
        let paymentStatus = "unpaid";
        if (totalAmount > 0 && totalPaid >= totalAmount) paymentStatus = "fully_paid";
        else if (totalPaid > 0) paymentStatus = "partially_paid";
        return { ...r, paymentStatus };
      });
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return (await fsGetById<Project>("projects", input.id)) || null;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      sizeOfSetup: z.string().optional(),
      typeOfSetup: z.string().optional(),
      customerName: z.string().optional(),
      address: z.string().optional(),
      stage: z.string().optional(),
      startDate: z.string().optional(),
      targetCompletionDate: z.string().optional(),
      opportunityId: z.number().optional(),
      quotationId: z.number().optional(),
      contactId: z.number().optional(),
      notes: z.string().optional(),
      totalProjectAmount: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const stage = input.stage || "procurement";
      const id = await fsInsertOne("projects", {
        name: input.name,
        description: input.description ?? null,
        sizeOfSetup: input.sizeOfSetup ?? null,
        typeOfSetup: input.typeOfSetup ?? null,
        customerName: input.customerName ?? null,
        address: input.address ?? null,
        stage,
        startDate: input.startDate ? new Date(input.startDate) : null,
        targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : null,
        completedDate: null,
        opportunityId: input.opportunityId ?? null,
        quotationId: input.quotationId ?? null,
        contactId: input.contactId ?? null,
        totalProjectAmount: input.totalProjectAmount ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      });
      // Record initial status
      await fsInsertOne("project_status_history", {
        projectId: id,
        fromStage: null,
        toStage: stage,
        notes: "Project created",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name || "Unknown",
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "project", id, `Created project: ${input.name}`);
      return { success: true, id };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
      sizeOfSetup: z.string().optional(),
      typeOfSetup: z.string().optional(),
      customerName: z.string().optional(),
      address: z.string().optional(),
      startDate: z.string().optional(),
      targetCompletionDate: z.string().optional(),
      opportunityId: z.number().optional(),
      quotationId: z.number().optional(),
      contactId: z.number().optional(),
      notes: z.string().optional(),
      totalProjectAmount: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetCompletionDate: data.targetCompletionDate ? new Date(data.targetCompletionDate) : null,
      };
      await fsUpdateOne("projects", id, updateData);
      await fsAudit(ctx.user.id, ctx.user.name, "update", "project", id, `Updated project: ${input.name}`);
      return { success: true };
    }),
    updateStage: protectedProcedure.input(z.object({
      id: z.number(),
      stage: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Get current stage
      const current = await fsGetById<Project>("projects", input.id);
      const fromStage = current?.stage || null;
      // Update project stage
      const updateData: Record<string, unknown> = { stage: input.stage };
      if (input.stage === "completed") updateData.completedDate = new Date();
      await fsUpdateOne("projects", input.id, updateData);
      // Record status change
      await fsInsertOne("project_status_history", {
        projectId: input.id,
        fromStage,
        toStage: input.stage,
        notes: input.notes || null,
        changedBy: ctx.user.id,
        changedByName: ctx.user.name || "Unknown",
      });
      await fsAudit(ctx.user.id, ctx.user.name, "update_stage", "project", input.id, `Stage: ${fromStage} → ${input.stage}`);
      return { success: true };
    }),
    getHistory: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const rows = await fsListAll<ProjectStatusHistory>("project_status_history", { where: [["projectId", "==", input.projectId]] });
      return rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const history = await fsListAll<ProjectStatusHistory>("project_status_history", { where: [["projectId", "==", input.id]] });
      await Promise.all(history.map(h => fsDeleteOne("project_status_history", h.id)));
      await fsDeleteOne("projects", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "project", input.id, `Deleted project #${input.id}`);
      return { success: true };
    }),
    stats: protectedProcedure.query(async () => {
      const rows = await fsListAll<Project>("projects", { select: ["stage"] });
      const counts = { total: rows.length, procurement: 0, implementation: 0, ongoing: 0, completed: 0 };
      for (const r of rows) {
        if (r.stage === "procurement") counts.procurement++;
        else if (r.stage === "implementation") counts.implementation++;
        else if (r.stage === "ongoing") counts.ongoing++;
        else if (r.stage === "completed") counts.completed++;
      }
      return counts;
    }),
    // --- Project Payments ---
    getPayments: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const [payments, acks] = await Promise.all([
        fsListAll<ProjectPayment>("project_payments", { where: [["projectId", "==", input.projectId]] }),
        fsListAll<AcknowledgementReceipt>("acknowledgement_receipts", { where: [["type", "==", "project_payment"]] }),
      ]);
      const ackMap = new Map<number, number>();
      acks.forEach(a => { if (!ackMap.has(a.referenceId) || a.id > ackMap.get(a.referenceId)!) ackMap.set(a.referenceId, a.id); });
      return payments
        .slice()
        .sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime())
        .map(p => ({ ...p, lastAckId: ackMap.get(p.id) || null }));
    }),
    addPayment: protectedProcedure.input(z.object({
      projectId: z.number(),
      paymentDate: z.string(),
      amount: z.string(),
      paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await fsInsertOne("project_payments", {
        projectId: input.projectId,
        paymentDate: new Date(input.paymentDate),
        amount: input.amount,
        paymentMethod: input.paymentMethod || null,
        paymentReference: input.paymentReference || null,
        notes: input.notes || null,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || "Unknown",
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "project_payment", input.projectId, `Payment of ${input.amount} for project #${input.projectId}`);
      return { success: true };
    }),
    deletePayment: protectedProcedure.input(z.object({ id: z.number(), projectId: z.number() })).mutation(async ({ input, ctx }) => {
      await fsDeleteOne("project_payments", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "project_payment", input.id, `Deleted payment for project #${input.projectId}`);
      return { success: true };
    }),
    paymentSummary: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const [project, payments] = await Promise.all([
        fsGetById<Project>("projects", input.projectId),
        fsListAll<ProjectPayment>("project_payments", { where: [["projectId", "==", input.projectId]] }),
      ]);
      const totalProjectAmount = Number(project?.totalProjectAmount || 0);
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const balance = totalProjectAmount - totalPaid;
      let status: "unpaid" | "partially_paid" | "fully_paid" = "unpaid";
      if (totalPaid >= totalProjectAmount && totalProjectAmount > 0) status = "fully_paid";
      else if (totalPaid > 0) status = "partially_paid";
      return { totalPaid, totalProjectAmount, balance, status };
    }),
    // Central payments list across all projects
    paymentsList: protectedProcedure.input(z.object({
      search: z.string().optional(),
      paymentStatus: z.enum(["all", "unpaid", "partially_paid", "fully_paid"]).default("all"),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })).query(async ({ input }) => {
      const [allProjects, allPayments] = await Promise.all([
        fsListAll<Project>("projects"),
        fsListAll<ProjectPayment>("project_payments"),
      ]);
      const paymentsByProject = new Map<number, ProjectPayment[]>();
      for (const pmt of allPayments) {
        const arr = paymentsByProject.get(pmt.projectId) ?? [];
        arr.push(pmt);
        paymentsByProject.set(pmt.projectId, arr);
      }
      const sortedProjects = allProjects.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const results = [];
      for (const project of sortedProjects) {
        // Search filter
        if (input.search) {
          const s = input.search.toLowerCase();
          if (!project.name.toLowerCase().includes(s) && !(project.customerName || "").toLowerCase().includes(s) && !(project.address || "").toLowerCase().includes(s) && !(project.typeOfSetup || "").toLowerCase().includes(s) && !(project.sizeOfSetup || "").toLowerCase().includes(s)) continue;
        }
        const payments = paymentsByProject.get(project.id) ?? [];
        const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
        const totalProjectAmount = Number(project.totalProjectAmount || 0);
        const balance = totalProjectAmount - totalPaid;
        let status: "unpaid" | "partially_paid" | "fully_paid" = "unpaid";
        if (totalPaid >= totalProjectAmount && totalProjectAmount > 0) status = "fully_paid";
        else if (totalPaid > 0) status = "partially_paid";
        // Status filter
        if (input.paymentStatus !== "all" && status !== input.paymentStatus) continue;
        // Get last payment date
        const lastPayment = payments.length > 0 ? payments.slice().sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime())[0] : null;
        // Date filter on last payment
        if (input.dateFrom && lastPayment && lastPayment.paymentDate.getTime() < new Date(input.dateFrom).getTime()) continue;
        if (input.dateTo && lastPayment && lastPayment.paymentDate.getTime() > new Date(input.dateTo).getTime()) continue;
        results.push({
          projectId: project.id,
          projectName: project.name,
          customerName: project.customerName || "-",
          totalProjectAmount,
          totalPaid,
          balance,
          status,
          lastPaymentDate: lastPayment?.paymentDate || null,
          stage: project.stage,
        });
      }
      return results;
    }),
    paymentAnalytics: protectedProcedure.query(async () => {
      const [allProjects, allPayments] = await Promise.all([
        fsListAll<Project>("projects"),
        fsListAll<ProjectPayment>("project_payments"),
      ]);
      const paidByProject = new Map<number, number>();
      for (const pmt of allPayments) paidByProject.set(pmt.projectId, (paidByProject.get(pmt.projectId) || 0) + Number(pmt.amount || 0));
      let totalReceivables = 0;
      let unpaidCount = 0;
      let partiallyPaidCount = 0;
      let fullyPaidCount = 0;
      for (const project of allProjects) {
        const totalPaid = paidByProject.get(project.id) || 0;
        const totalProjectAmount = Number(project.totalProjectAmount || 0);
        const balance = totalProjectAmount - totalPaid;
        if (totalPaid >= totalProjectAmount && totalProjectAmount > 0) fullyPaidCount++;
        else if (totalPaid > 0) { partiallyPaidCount++; totalReceivables += balance; }
        else { unpaidCount++; totalReceivables += totalProjectAmount; }
      }
      // Monthly payments (last 12 months)
      const monthlyMap: Record<string, number> = {};
      for (const p of allPayments) {
        const d = p.paymentDate;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap[key] = (monthlyMap[key] || 0) + Number(p.amount);
      }
      const monthlyPayments = Object.entries(monthlyMap).sort().slice(-12).map(([month, amount]) => ({ month, amount }));
      return { totalReceivables, unpaidCount, partiallyPaidCount, fullyPaidCount, monthlyPayments };
    }),
  }),
  // ============ NET METERING ============
  netMetering: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      typeOfSetup: z.string().optional(),
      sizeOfSetup: z.string().optional(),
      electricCompany: z.string().optional(),
    })).query(async ({ input }) => {
      let rows = await fsListAll<NetMetering>("net_metering");
      if (input.search) {
        const s = input.search.toLowerCase();
        rows = rows.filter(r => {
          if ((r.clientName || "").toLowerCase().includes(s)) return true;
          if ((r.address || "").toLowerCase().includes(s)) return true;
          if ((r.projectName || "").toLowerCase().includes(s)) return true;
          if ((r.electricCompany || "").toLowerCase().includes(s)) return true;
          if ((r.applicationNumber || "").toLowerCase().includes(s)) return true;
          if ((r.sizeOfSetup || "").toLowerCase().includes(s)) return true;
          if ((r.typeOfSetup || "").toLowerCase().includes(s)) return true;
          if ((r.notes || "").toLowerCase().includes(s)) return true;
          const d = r.createdAt;
          const ymd = d.toISOString().slice(0, 10);
          const my = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          const y = String(d.getFullYear());
          return ymd.includes(s) || my.includes(s) || y.includes(s);
        });
      }
      if (input.status) rows = rows.filter(r => r.status === input.status);
      if (input.typeOfSetup) rows = rows.filter(r => r.typeOfSetup === input.typeOfSetup);
      if (input.sizeOfSetup) rows = rows.filter(r => (r.sizeOfSetup || "").toLowerCase().includes(input.sizeOfSetup!.toLowerCase()));
      if (input.electricCompany) rows = rows.filter(r => (r.electricCompany || "").toLowerCase().includes(input.electricCompany!.toLowerCase()));
      return rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return (await fsGetById<NetMetering>("net_metering", input.id)) || null;
    }),
    getByProjectId: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const rows = await fsListAll<NetMetering>("net_metering", { where: [["projectId", "==", input.projectId]] });
      return rows[0] || null;
    }),
    create: protectedProcedure.input(z.object({
      projectId: z.number().optional(),
      clientName: z.string().min(1),
      projectName: z.string().optional(),
      address: z.string().optional(),
      sizeOfSetup: z.string().optional(),
      typeOfSetup: z.string().optional(),
      status: z.string().optional(),
      electricCompany: z.string().optional(),
      applicationNumber: z.string().optional(),
      notes: z.string().optional(),
      submittedDate: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const id = await fsInsertOne("net_metering", {
        projectId: input.projectId ?? null,
        clientName: input.clientName,
        projectName: input.projectName ?? null,
        address: input.address ?? null,
        sizeOfSetup: input.sizeOfSetup ?? null,
        typeOfSetup: input.typeOfSetup ?? null,
        status: input.status || "plan_drawings",
        electricCompany: input.electricCompany ?? null,
        applicationNumber: input.applicationNumber ?? null,
        notes: input.notes ?? null,
        submittedDate: input.submittedDate ? new Date(input.submittedDate) : null,
        approvedDate: null,
        completedDate: null,
        createdBy: ctx.user.id,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "create", "net_metering", id, `Created net metering for: ${input.clientName}`);
      return { id };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      clientName: z.string().min(1),
      projectName: z.string().optional(),
      address: z.string().optional(),
      sizeOfSetup: z.string().optional(),
      typeOfSetup: z.string().optional(),
      status: z.string().optional(),
      electricCompany: z.string().optional(),
      applicationNumber: z.string().optional(),
      notes: z.string().optional(),
      submittedDate: z.string().optional(),
      approvedDate: z.string().optional(),
      completedDate: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = {
        ...data,
        submittedDate: data.submittedDate ? new Date(data.submittedDate) : null,
        approvedDate: data.approvedDate ? new Date(data.approvedDate) : null,
        completedDate: data.completedDate ? new Date(data.completedDate) : null,
      };
      await fsUpdateOne("net_metering", id, updateData);
      await fsAudit(ctx.user.id, ctx.user.name, "update", "net_metering", id, `Updated net metering for: ${input.clientName}`);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await fsDeleteOne("net_metering", input.id);
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "net_metering", input.id, "Deleted net metering record");
      return { success: true };
    }),
    stats: protectedProcedure.query(async () => {
      const rows = await fsListAll<NetMetering>("net_metering", { select: ["status"] });
      const counts = { total: rows.length, planDrawings: 0, submitted: 0, approved: 0, completed: 0 };
      for (const r of rows) {
        if (r.status === "plan_drawings") counts.planDrawings++;
        else if (r.status === "submitted_lgu" || r.status === "submitted_fire" || r.status === "submitted_electric") counts.submitted++;
        else if (r.status === "approved") counts.approved++;
        else if (r.status === "completed_energized") counts.completed++;
      }
      return counts;
    }),
  }),

  // ============ STOCK ADJUSTMENTS (Admin-only approval) ============
  stockAdjustments: router({
    list: protectedProcedure.input(z.object({ status: z.string().optional() })).query(async ({ input, ctx }) => {
      const filters: [string, WhereFilterOp, any][] = [];
      if (input.status) filters.push(["status", "==", input.status]);
      // Sub-admins only see their own requests
      if (ctx.user.role !== 'admin') filters.push(["requestedBy", "==", ctx.user.id]);
      const [adjustments, items] = await Promise.all([
        fsListAll<StockAdjustment>("stock_adjustments", { where: filters }),
        fsListAll<InventoryItem>("inventory_items"),
      ]);
      const itemMap = new Map(items.map(i => [i.id, i]));
      return adjustments
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 200)
        .map(a => ({
          ...a,
          itemName: itemMap.get(a.itemId)?.name ?? null,
          itemSku: itemMap.get(a.itemId)?.sku ?? null,
        }));
    }),
    // Sub-admin can request an adjustment
    request: protectedProcedure.input(z.object({
      itemId: z.number(), newQuantity: z.number().min(0), reason: z.string().min(1), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') {
        // Non-admin: just record a pending request, no stock mutation.
        const item = await fsGetById<InventoryItem>("inventory_items", input.itemId);
        const prevQty = item?.stockOnHand ?? 0;
        await fsInsertOne("stock_adjustments", {
          itemId: input.itemId, previousQuantity: prevQty, newQuantity: input.newQuantity,
          adjustmentQuantity: input.newQuantity - prevQty, reason: input.reason,
          status: 'pending',
          requestedBy: ctx.user.id, requestedByName: ctx.user.name || 'Unknown',
          approvedBy: null, approvedByName: null, approvedAt: null,
          notes: input.notes || null,
        });
        await fsAudit(ctx.user.id, ctx.user.name, "create", "stock_adjustment", input.itemId, `Requested adjustment for item #${input.itemId}: ${prevQty} → ${input.newQuantity} (${input.reason})`);
        return { success: true };
      }

      // Admin: apply immediately - read-modify-write the item + adjustment row + audit row atomically.
      const adjId = await fsAllocateIds("stock_adjustments");
      const auditId = await fsAllocateIds("inventory_audit_log");
      const now = new Date();

      const { prevQty } = await fdb().runTransaction(async (tx) => {
        const itemRef = fdb().collection("inventory_items").doc(String(input.itemId));
        const snap = await tx.get(itemRef);
        const item = snap.exists ? (snap.data() as InventoryItem | undefined) : undefined;
        const prevQty = item?.stockOnHand ?? 0;

        tx.set(fdb().collection("stock_adjustments").doc(String(adjId)), {
          id: adjId,
          itemId: input.itemId, previousQuantity: prevQty, newQuantity: input.newQuantity,
          adjustmentQuantity: input.newQuantity - prevQty, reason: input.reason,
          status: 'approved',
          requestedBy: ctx.user.id, requestedByName: ctx.user.name || 'Unknown',
          approvedBy: ctx.user.id, approvedByName: ctx.user.name || 'Admin', approvedAt: now,
          notes: input.notes || null,
          createdAt: now, updatedAt: now,
        });
        tx.set(itemRef, { stockOnHand: input.newQuantity, updatedAt: now }, { merge: true });
        tx.set(fdb().collection("inventory_audit_log").doc(String(auditId)), {
          id: auditId,
          itemId: input.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
          transactionType: 'adjustment', quantity: input.newQuantity - prevQty,
          previousStock: prevQty, newStock: input.newQuantity,
          sourceLocation: null, destinationLocation: null,
          reference: `Stock Adjustment`, purpose: input.reason, notes: input.notes || null,
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
          createdAt: now,
        });

        return { prevQty };
      });

      await fsAudit(ctx.user.id, ctx.user.name, "create", "stock_adjustment", input.itemId, `Applied adjustment for item #${input.itemId}: ${prevQty} → ${input.newQuantity} (${input.reason})`);
      return { success: true };
    }),
    // Admin approve
    approve: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const auditId = await fsAllocateIds("inventory_audit_log");
      const now = new Date();

      const adj = await fdb().runTransaction(async (tx) => {
        const adjRef = fdb().collection("stock_adjustments").doc(String(input.id));
        const adjSnap = await tx.get(adjRef);
        if (!adjSnap.exists) throw new Error("Adjustment not found or already processed");
        const adjData = fsDocToData<StockAdjustment>(adjSnap);
        if (adjData.status !== 'pending') throw new Error("Adjustment not found or already processed");

        const itemRef = fdb().collection("inventory_items").doc(String(adjData.itemId));
        const itemSnap = await tx.get(itemRef);
        const item = itemSnap.exists ? (itemSnap.data() as InventoryItem | undefined) : undefined;

        tx.set(adjRef, { status: 'approved', approvedBy: ctx.user.id, approvedByName: ctx.user.name || 'Admin', approvedAt: now }, { merge: true });
        tx.set(itemRef, { stockOnHand: adjData.newQuantity, updatedAt: now }, { merge: true });
        tx.set(fdb().collection("inventory_audit_log").doc(String(auditId)), {
          id: auditId,
          itemId: adjData.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
          transactionType: 'adjustment', quantity: adjData.adjustmentQuantity,
          previousStock: adjData.previousQuantity, newStock: adjData.newQuantity,
          sourceLocation: null, destinationLocation: null,
          reference: `Stock Adjustment #${adjData.id} (approved)`, purpose: adjData.reason || 'Adjustment', notes: adjData.notes || null,
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
          createdAt: now,
        });

        return adjData;
      });

      await fsAudit(ctx.user.id, ctx.user.name, "approve", "stock_adjustment", input.id, `Approved adjustment #${input.id}: ${adj.previousQuantity} → ${adj.newQuantity}`);
      return { success: true };
    }),
    // Admin reject
    reject: adminProcedure.input(z.object({ id: z.number(), notes: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const adj = await fsGetById<StockAdjustment>("stock_adjustments", input.id);
      if (!adj || adj.status !== 'pending') throw new Error("Adjustment not found or already processed");
      await fsUpdateOne("stock_adjustments", input.id, {
        status: 'rejected', approvedBy: ctx.user.id, approvedByName: ctx.user.name || 'Admin',
        approvedAt: new Date(), notes: input.notes || adj.notes,
      });
      await fsAudit(ctx.user.id, ctx.user.name, "reject", "stock_adjustment", input.id, `Rejected adjustment #${input.id}`);
      return { success: true };
    }),
  }),

  // ============ INVENTORY AUDIT LOG ============
  inventoryAudit: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(), transactionType: z.string().optional(),
      itemId: z.number().optional(), limit: z.number().optional(),
      fromDate: z.number().optional(), toDate: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      const filters: [string, WhereFilterOp, any][] = [];
      if (input.transactionType) filters.push(["transactionType", "==", input.transactionType]);
      if (input.itemId) filters.push(["itemId", "==", input.itemId]);
      // Admin and Sub-Admin can see all audit logs; lower roles see only their own
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'subadmin') {
        filters.push(["performedBy", "==", ctx.user.id]);
      }

      let rows = await fsListAll<InventoryAuditLog>("inventory_audit_log", { where: filters });

      if (input.fromDate) {
        const from = new Date(input.fromDate).getTime();
        rows = rows.filter(r => r.createdAt.getTime() >= from);
      }
      if (input.toDate) {
        const to = new Date(input.toDate).getTime();
        rows = rows.filter(r => r.createdAt.getTime() <= to);
      }
      const search = input.search?.trim().toLowerCase();
      if (search) {
        rows = rows.filter(r =>
          (r.itemName || "").toLowerCase().includes(search) ||
          (r.itemSku || "").toLowerCase().includes(search) ||
          (r.performedByName || "").toLowerCase().includes(search) ||
          (r.reference || "").toLowerCase().includes(search) ||
          (r.purpose || "").toLowerCase().includes(search)
        );
      }

      return rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, input.limit || 500);
    }),
  }),

  // ============ SPECIAL QUOTATION TEMPLATES ============
  specialQuotationTemplates: router({
    list: protectedProcedure.query(async () => {
      const rows = await fsListAll<SpecialQuotationTemplate>("special_quotation_templates", { where: [["isActive", "==", 1]] });
      return rows.slice().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return (await fsGetById<SpecialQuotationTemplate>("special_quotation_templates", input.id)) || null;
    }),
    create: adminProcedure.input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      systemTitle: z.string().optional(),
      systemDescription: z.string().optional(),
      kwRating: z.string().optional(),
      setupType: z.string().optional(),
      items: z.any().optional(),
      subtotal: z.string().optional(),
      vatRate: z.string().optional(),
      discount: z.string().optional(),
      remarks: z.string().optional(),
      warrantyClaims: z.string().optional(),
      paymentTerms: z.string().optional(),
      paymentDetails: z.string().optional(),
      deliveryTerms: z.string().optional(),
      preparedBy: z.string().optional(),
      contactInfo: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const id = await fsInsertOne("special_quotation_templates", {
        name: input.name,
        description: input.description ?? null,
        systemTitle: input.systemTitle ?? null,
        systemDescription: input.systemDescription ?? null,
        kwRating: input.kwRating ?? null,
        setupType: input.setupType ?? null,
        items: input.items ?? null,
        subtotal: input.subtotal || null,
        vatRate: input.vatRate || null,
        discount: input.discount || null,
        remarks: input.remarks ?? null,
        warrantyClaims: input.warrantyClaims ?? null,
        paymentTerms: input.paymentTerms ?? null,
        paymentDetails: input.paymentDetails ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        preparedBy: input.preparedBy ?? null,
        contactInfo: input.contactInfo ?? null,
        isActive: 1,
        createdBy: ctx.user.id,
      });
      return { success: true, id };
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      systemTitle: z.string().optional(),
      systemDescription: z.string().optional(),
      kwRating: z.string().optional(),
      setupType: z.string().optional(),
      items: z.any().optional(),
      subtotal: z.string().optional(),
      vatRate: z.string().optional(),
      discount: z.string().optional(),
      remarks: z.string().optional(),
      warrantyClaims: z.string().optional(),
      paymentTerms: z.string().optional(),
      paymentDetails: z.string().optional(),
      deliveryTerms: z.string().optional(),
      preparedBy: z.string().optional(),
      contactInfo: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await fsUpdateOne("special_quotation_templates", id, data);
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await fsUpdateOne("special_quotation_templates", input.id, { isActive: 0 });
      return { success: true };
    }),
  }),

  // ============ SPECIAL QUOTATIONS ============
  specialQuotations: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
    })).query(async ({ input }) => {
      const page = input.page || 1;
      const limit = input.limit || 20;
      let items = await fsListAll<SpecialQuotation>("special_quotations");
      if (input.search) {
        const s = input.search.toLowerCase();
        items = items.filter(q => {
          if ((q.customerName || "").toLowerCase().includes(s)) return true;
          if ((q.quotationNumber || "").toLowerCase().includes(s)) return true;
          if ((q.systemTitle || "").toLowerCase().includes(s)) return true;
          if ((q.customerAddress || "").toLowerCase().includes(s)) return true;
          if ((q.kwRating || "").toLowerCase().includes(s)) return true;
          if ((q.setupType || "").toLowerCase().includes(s)) return true;
          if ((q.preparedBy || "").toLowerCase().includes(s)) return true;
          const d = q.createdAt;
          const ymd = d.toISOString().slice(0, 10);
          const my = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          const y = String(d.getFullYear());
          return ymd.includes(s) || my.includes(s) || y.includes(s);
        });
      }
      if (input.status) items = items.filter(q => q.status === input.status);
      items = items.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const total = items.length;
      const pageItems = items.slice((page - 1) * limit, (page - 1) * limit + limit);
      return { items: pageItems, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return (await fsGetById<SpecialQuotation>("special_quotations", input.id)) || null;
    }),
    create: protectedProcedure.input(z.object({
      templateId: z.number().optional(),
      customerName: z.string().optional(),
      customerAddress: z.string().optional(),
      systemTitle: z.string().optional(),
      systemDescription: z.string().optional(),
      kwRating: z.string().optional(),
      setupType: z.string().optional(),
      items: z.any().optional(),
      subtotal: z.string().optional(),
      vatRate: z.string().optional(),
      vatAmount: z.string().optional(),
      discount: z.string().optional(),
      total: z.string().optional(),
      remarks: z.string().optional(),
      warrantyClaims: z.string().optional(),
      paymentTerms: z.string().optional(),
      paymentDetails: z.string().optional(),
      deliveryTerms: z.string().optional(),
      preparedBy: z.string().optional(),
      contactInfo: z.string().optional(),
      date: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const quotationNumber = `SQ-${Date.now().toString(36).toUpperCase()}`;
      const id = await fsInsertOne("special_quotations", {
        templateId: input.templateId ?? null,
        quotationNumber,
        date: input.date ? new Date(input.date) : new Date(),
        customerName: input.customerName ?? null,
        customerAddress: input.customerAddress ?? null,
        systemTitle: input.systemTitle ?? null,
        systemDescription: input.systemDescription ?? null,
        kwRating: input.kwRating ?? null,
        setupType: input.setupType ?? null,
        items: input.items ?? null,
        subtotal: input.subtotal || null,
        vatRate: input.vatRate || null,
        vatAmount: input.vatAmount || null,
        discount: input.discount || null,
        total: input.total || null,
        remarks: input.remarks ?? null,
        warrantyClaims: input.warrantyClaims ?? null,
        paymentTerms: input.paymentTerms ?? null,
        paymentDetails: input.paymentDetails ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        preparedBy: input.preparedBy ?? null,
        contactInfo: input.contactInfo ?? null,
        status: "draft",
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || "Admin",
      });
      return { success: true, id, quotationNumber };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      customerName: z.string().optional(),
      customerAddress: z.string().optional(),
      systemTitle: z.string().optional(),
      systemDescription: z.string().optional(),
      kwRating: z.string().optional(),
      setupType: z.string().optional(),
      items: z.any().optional(),
      subtotal: z.string().optional(),
      vatRate: z.string().optional(),
      vatAmount: z.string().optional(),
      discount: z.string().optional(),
      total: z.string().optional(),
      remarks: z.string().optional(),
      warrantyClaims: z.string().optional(),
      paymentTerms: z.string().optional(),
      paymentDetails: z.string().optional(),
      deliveryTerms: z.string().optional(),
      preparedBy: z.string().optional(),
      contactInfo: z.string().optional(),
      status: z.enum(["draft", "sent", "accepted", "rejected"]).optional(),
      date: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, date, ...data } = input;
      const updateData: Record<string, unknown> = { ...data };
      if (date) updateData.date = new Date(date);
      await fsUpdateOne("special_quotations", id, updateData);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await fsDeleteOne("special_quotations", input.id);
      return { success: true };
    }),
  }),

  // ============ CASH REQUESTS (Sub-admin requests, admin approves) ============
  cashRequests: router({
    // Every admin and sub-admin sees all cash requests — the team shares one
    // cash book, and any sub-admin may receive cash they didn't request.
    list: protectedProcedure.query(async () => {
      const requests = await fsListAllRaw<CashRequest>("cash_requests", { where: [] });
      // Ascending by id groups naturally by month then monthSeq (cr-MMNNYYY, fixed-width).
      return requests
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(r => ({ ...r, items: crItems(r) }));
    }),

    // The cr-MMNNYYY number is reserved and the doc written in one atomic transaction,
    // only at actual submit time — never while the user is just browsing/previewing a
    // month in the dialog. That way no number is ever burned without a real request
    // behind it.
    create: protectedProcedure.input(z.object({
      isOldRecord: z.boolean(), month: z.number().min(1).max(12).optional(),
      // One request can cover several purposes, e.g. Fuel ₱2,000 + Salary ₱15,000.
      items: z.array(z.object({ purposeOptionId: z.number(), amount: z.number().positive() })).min(1),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'subadmin') throw new Error("Only sub-admin can request cash");

      const options = await Promise.all(input.items.map(it => fsGetById<ConfigOption>("config_options", it.purposeOptionId)));
      const items: CashRequestItem[] = input.items.map((it, i) => ({
        purposeOptionId: it.purposeOptionId,
        purposeLabel: options[i]?.value ?? "Unknown",
        amount: money(it.amount),
      }));
      const total = input.items.reduce((sum, it) => sum + it.amount, 0);
      const summary = items.map(i => i.purposeLabel).join(", ");
      const now = new Date();
      const year = now.getFullYear();
      const month = input.isOldRecord ? (input.month ?? now.getMonth() + 1) : now.getMonth() + 1;
      if (input.isOldRecord && month > now.getMonth() + 1) throw new Error("Cannot select a future month");

      const monthRef = fdb().collection("counters").doc(`cash_requests_month_${year}-${String(month).padStart(2, "0")}`);
      const yearRef = fdb().collection("counters").doc(`cash_requests_year_${year}`);

      const id = await fdb().runTransaction(async tx => {
        const [monthSnap, yearSnap] = await Promise.all([tx.get(monthRef), tx.get(yearRef)]);
        const monthSeq = monthSnap.exists ? (monthSnap.data()?.next as number) ?? 1 : 1;
        const yearSeq = yearSnap.exists ? (yearSnap.data()?.next as number) ?? 1 : 1;
        tx.set(monthRef, { next: monthSeq + 1 }, { merge: true });
        tx.set(yearRef, { next: yearSeq + 1 }, { merge: true });

        const id = `cr-${String(month).padStart(2, "0")}${String(monthSeq).padStart(2, "0")}${String(yearSeq).padStart(3, "0")}`;
        // Old/backfilled records log a transaction that already happened — no admin
        // approval or receipt confirmation makes sense for something already done.
        tx.set(fdb().collection("cash_requests").doc(id), {
          id, month, year, monthSeq, yearSeq,
          items,
          // Legacy single-purpose fields kept in sync with the first entry so
          // older readers and notification text still work.
          purposeOptionId: items[0].purposeOptionId, purposeLabel: items[0].purposeLabel,
          amount: money(total), isOldRecord: input.isOldRecord,
          status: input.isOldRecord ? 'approved' : 'pending', received: input.isOldRecord,
          requestedBy: ctx.user.id, requestedByName: ctx.user.name || 'Unknown',
          decidedBy: null, decidedByName: input.isOldRecord ? 'Backfilled record' : null,
          decidedAt: input.isOldRecord ? now : null, receivedAt: input.isOldRecord ? now : null,
          receivedBy: input.isOldRecord ? ctx.user.id : null,
          receivedByName: input.isOldRecord ? (ctx.user.name || 'Unknown') : null,
          notes: input.notes ?? null,
          createdAt: now, updatedAt: now,
        });
        return id;
      });

      const action = input.isOldRecord ? "Logged" : "Requested";
      await fsAudit(ctx.user.id, ctx.user.name, "create", "cash_request", id, `${action} ${money(total)} across ${items.length} entr${items.length === 1 ? 'y' : 'ies'} (${summary}) (${id})`);

      const admins = (await listUsersRaw()).filter(u => u.role === 'admin');
      const message = input.isOldRecord
        ? `${ctx.user.name || 'A sub-admin'} logged a completed cash request of ${money(total)} for ${summary} (${id}) — already received.`
        : `${ctx.user.name || 'A sub-admin'} requested ${money(total)} for ${summary} (${id})`;
      await Promise.all(admins.map(a => fsInsertOne("notifications", {
        userId: a.id, type: "cash_request_created",
        message, link: "/cash-requests", entityId: id, read: false,
      })));

      return { success: true, id };
    }),

    // Any sub-admin may edit a request while it is still pending. Once an admin
    // has decided on it, it locks — only an admin can correct it after that, so
    // approved amounts can't be quietly changed behind the approval.
    update: protectedProcedure.input(z.object({
      id: z.string(),
      items: z.array(z.object({ purposeOptionId: z.number(), amount: z.number().positive() })).min(1),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const ref = fdb().collection("cash_requests").doc(input.id);
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Cash request not found");
      const data = fsDocToDataRaw<CashRequest>(snap);
      if (ctx.user.role !== 'admin' && data.status !== 'pending') {
        throw new Error("This request has already been decided — only an admin can edit it now");
      }

      const options = await Promise.all(input.items.map(it => fsGetById<ConfigOption>("config_options", it.purposeOptionId)));
      const items: CashRequestItem[] = input.items.map((it, i) => ({
        purposeOptionId: it.purposeOptionId,
        purposeLabel: options[i]?.value ?? "Unknown",
        amount: money(it.amount),
      }));
      const total = input.items.reduce((sum, it) => sum + it.amount, 0);
      const now = new Date();

      await ref.set({
        items,
        purposeOptionId: items[0].purposeOptionId, purposeLabel: items[0].purposeLabel,
        amount: money(total),
        notes: input.notes ?? data.notes ?? null,
        updatedAt: now,
      }, { merge: true });

      await fsAudit(ctx.user.id, ctx.user.name, "update", "cash_request", input.id, `Edited cash request ${input.id}: ${items.length} entr${items.length === 1 ? 'y' : 'ies'} (${items.map(i => i.purposeLabel).join(", ")}), total ${money(total)}`);
      return { success: true };
    }),

    // A still-pending request can be erased outright by any sub-admin (or admin).
    // Once a decision has been made it stays on the books — deleting an approved
    // or received record would put a hole in the money trail.
    remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const ref = fdb().collection("cash_requests").doc(input.id);
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Cash request not found");
      const data = fsDocToDataRaw<CashRequest>(snap);
      if (data.status !== 'pending') {
        throw new Error("Only pending cash requests can be deleted");
      }

      await ref.delete();
      await fsAudit(ctx.user.id, ctx.user.name, "delete", "cash_request", input.id, `Deleted pending cash request ${input.id} (total ₱${data.amount}, requested by ${data.requestedByName})`);
      return { success: true };
    }),

    approve: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const now = new Date();
      const reqData = await fdb().runTransaction(async tx => {
        const ref = fdb().collection("cash_requests").doc(input.id);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("Cash request not found or already processed");
        const data = fsDocToDataRaw<CashRequest>(snap);
        if (data.status !== 'pending') throw new Error("Cash request not found or already processed");
        tx.set(ref, { status: 'approved', decidedBy: ctx.user.id, decidedByName: ctx.user.name || 'Admin', decidedAt: now, updatedAt: now }, { merge: true });
        return data;
      });

      await fsAudit(ctx.user.id, ctx.user.name, "approve", "cash_request", input.id, `Approved cash request ${input.id}`);
      await fsInsertOne("notifications", {
        userId: reqData.requestedBy, type: "cash_request_approved",
        message: `Your cash request ${input.id} (${reqData.purposeLabel}) was approved.`,
        link: "/cash-requests", entityId: input.id, read: false,
      });
      return { success: true };
    }),

    reject: adminProcedure.input(z.object({ id: z.string(), notes: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const ref = fdb().collection("cash_requests").doc(input.id);
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Cash request not found or already processed");
      const data = fsDocToDataRaw<CashRequest>(snap);
      if (data.status !== 'pending') throw new Error("Cash request not found or already processed");

      const now = new Date();
      await ref.set({
        status: 'rejected', decidedBy: ctx.user.id, decidedByName: ctx.user.name || 'Admin',
        decidedAt: now, rejectionReason: input.notes ?? null, updatedAt: now,
      }, { merge: true });

      await fsAudit(ctx.user.id, ctx.user.name, "reject", "cash_request", input.id, `Rejected cash request ${input.id}`);
      await fsInsertOne("notifications", {
        userId: data.requestedBy, type: "cash_request_rejected",
        message: `Your cash request ${input.id} (${data.purposeLabel}) was rejected.`,
        link: "/cash-requests", entityId: input.id, read: false,
      });
      return { success: true };
    }),

    markReceived: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const ref = fdb().collection("cash_requests").doc(input.id);
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Cash request not found");
      const data = fsDocToDataRaw<CashRequest>(snap);
      // The receiver need not be the requester — any sub-admin (or admin) may
      // collect the cash, and we record exactly who did.
      if (data.status !== 'approved' || data.received) throw new Error("Cash request is not awaiting receipt");

      const now = new Date();
      await ref.set({
        received: true, receivedAt: now,
        receivedBy: ctx.user.id, receivedByName: ctx.user.name || 'Unknown',
        updatedAt: now,
      }, { merge: true });

      await fsAudit(ctx.user.id, ctx.user.name, "receive", "cash_request", input.id, `Marked cash request ${input.id} as received`);
      const notifyIds = new Set<number>();
      if (data.decidedBy) notifyIds.add(data.decidedBy);
      // Tell the requester too when someone else collected on their behalf.
      if (data.requestedBy !== ctx.user.id) notifyIds.add(data.requestedBy);
      await Promise.all(Array.from(notifyIds).map(userId => fsInsertOne("notifications", {
        userId, type: "cash_request_received",
        message: `${ctx.user.name || 'Sub-admin'} received cash request ${input.id} (${data.purposeLabel}).`,
        link: "/cash-requests", entityId: input.id, read: false,
      })));
      return { success: true };
    }),

    // Spend-by-purpose over time, for the Analytics page line chart.
    analytics: protectedProcedure.query(async () => {
      // Scoped the same as list(): everyone sees the whole cash book.
      const filters: [string, WhereFilterOp, any][] = [["status", "==", "approved"]];
      const [requests, purposeOptions] = await Promise.all([
        fsListAllRaw<CashRequest>("cash_requests", { where: filters }),
        fsListAll<ConfigOption>("config_options", { where: [["category", "==", "cash_request_purpose"], ["isActive", "==", 1]] }),
      ]);

      const purposes = purposeOptions
        .slice()
        .sort((a, b) => (a.sortOrder ?? -Infinity) - (b.sortOrder ?? -Infinity))
        .map(o => o.value);

      const byMonth = new Map<string, Record<string, number>>();
      for (const r of requests) {
        const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
        const row = byMonth.get(key) ?? {};
        // Each entry counts under its own purpose, so a multi-entry request
        // splits across the categories it actually covers.
        for (const it of crItems(r)) {
          row[it.purposeLabel] = (row[it.purposeLabel] ?? 0) + Number(it.amount);
        }
        byMonth.set(key, row);
      }

      const rows = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, values]) => {
          const row: Record<string, number | string> = { month };
          for (const label of purposes) row[label] = values[label] ?? 0;
          return row;
        });

      return { rows, purposes };
    }),
  }),

  // ============ NOTIFICATIONS ============
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const all = await fsListAll<Notification>("notifications", { where: [["userId", "==", ctx.user.id]] });
      return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);
    }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      const unread = await fsListAll<Notification>("notifications", {
        where: [["userId", "==", ctx.user.id], ["read", "==", false]],
      });
      return unread.length;
    }),
    markRead: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const n = await fsGetById<Notification>("notifications", input.id);
      if (!n || n.userId !== ctx.user.id) throw new Error("Notification not found");
      await fsUpdateOne("notifications", input.id, { read: true });
      return { success: true };
    }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const unread = await fsListAll<Notification>("notifications", {
        where: [["userId", "==", ctx.user.id], ["read", "==", false]],
      });
      await Promise.all(unread.map(n => fsUpdateOne("notifications", n.id, { read: true })));
      return { success: true };
    }),
  }),
});
export type AppRouter = typeof appRouter;
