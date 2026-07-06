import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { z } from "zod";
import { eq, like, and, or, sql, desc, count, sum, inArray } from "drizzle-orm";
import {
  users, leads, contacts, accounts, opportunities, activities,
  inventoryItems, stockTransactions, purchaseOrders, purchaseOrderItems, poPayments, bomPackages, bomPackageItems,
  quotations, quotationItems, auditLogs, suppliers, configOptions,
  projects, projectStatusHistory, netMetering, stockAdjustments, inventoryAuditLog, supplierItemPrices, projectPayments,
  netMeteringPayments, deliveryReceipts, acknowledgementReceipts,
  specialQuotationTemplates, specialQuotations, itemPriceHistory
} from "../drizzle/schema";
import { gte, lte } from "drizzle-orm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      const u = opts.ctx.user;
      if (!u) return null;
      // Never leak credentials/secrets to the client. Admin password viewing
      // is handled separately in the users router (admin-only).
      const { passwordHash, passwordPlain, totpSecret, resetToken, resetTokenExpiry, ...safe } = u;
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
      const db = await getDb();
      if (!db) return { totalLeads: 0, totalOpportunities: 0, totalInventoryItems: 0, totalQuotations: 0, pipelineValue: 0, wonDeals: 0, totalContacts: 0, lowStockItems: 0, conversionRate: 0, totalRevenue: 0, inventoryValue: 0 };

      const [leadsCount] = await db.select({ c: count() }).from(leads);
      const [oppsCount] = await db.select({ c: count() }).from(opportunities);
      const [itemsCount] = await db.select({ c: count() }).from(inventoryItems);
      const [quotesCount] = await db.select({ c: count() }).from(quotations);
      const [contactsCount] = await db.select({ c: count() }).from(contacts);
      const [pipelineVal] = await db.select({ total: sql<string>`COALESCE(SUM(value), 0)` }).from(opportunities).where(and(sql`status NOT IN ('won', 'lost')`));
      const [wonResult] = await db.select({ c: count(), total: sql<string>`COALESCE(SUM(value), 0)` }).from(opportunities).where(eq(opportunities.status, "won"));
      const lowStockResult = await db.select({ c: count() }).from(inventoryItems).where(sql`stockOnHand <= reorderLevel`);
      const [invValue] = await db.select({ total: sql<string>`COALESCE(SUM(stockOnHand * sellingPrice), 0)` }).from(inventoryItems);
      
      // Only fetch revenue for admin users
      let totalRevenue = "0";
      if (ctx.user?.role === "admin") {
        const [revenueResult] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` }).from(projectPayments);
        totalRevenue = revenueResult.total || "0";
      }
      
      const totalOpps = oppsCount.c || 0;
      const wonDeals = wonResult.c || 0;
      const conversionRate = totalOpps > 0 ? Math.round((wonDeals / totalOpps) * 100) : 0;

      return {
        totalLeads: leadsCount.c || 0,
        totalOpportunities: totalOpps,
        totalInventoryItems: itemsCount.c || 0,
        totalQuotations: quotesCount.c || 0,
        pipelineValue: pipelineVal.total || "0",
        wonDeals,
        totalContacts: contactsCount.c || 0,
        lowStockItems: lowStockResult[0]?.c || 0,
        conversionRate,
        totalRevenue,
        inventoryValue: invValue.total || "0",
      };
    }),
    pipelineBreakdown: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.select({ status: opportunities.status, count: count() }).from(opportunities).groupBy(opportunities.status);
      return result.map(r => ({ status: r.status, count: r.count }));
    }),
    inventoryByCategory: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.select({ category: inventoryItems.category, count: count(), totalStock: sql<string>`SUM(stockOnHand)` }).from(inventoryItems).groupBy(inventoryItems.category);
      return result.map(r => ({ category: r.category, count: r.count, totalStock: Number(r.totalStock) || 0 }));
    }),
    revenueByMonth: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (ctx.user?.role !== "admin") return [];
      const result = await db.select({
        month: sql<string>`DATE_FORMAT(paymentDate, '%Y-%m')`,
        revenue: sql<string>`COALESCE(SUM(amount), 0)`,
        count: count(),
      }).from(projectPayments).groupBy(sql`DATE_FORMAT(paymentDate, '%Y-%m')`).orderBy(sql`DATE_FORMAT(paymentDate, '%Y-%m')`).limit(12);
      return result.map(r => ({ month: r.month, revenue: Number(r.revenue) || 0, count: r.count }));
    }),
    leadConversion: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const statuses = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
      const result = await db.select({ status: leads.status, count: count() }).from(leads).groupBy(leads.status);
      return statuses.map(s => ({ status: s, count: result.find(r => r.status === s)?.count || 0 }));
    }),
  }),

  // ============ LEADS ============
  leads: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), status: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0, page: input.page, limit: input.limit, totalPages: 0 };
      const conditions = [];
      if (input.search) conditions.push(or(like(leads.firstName, `%${input.search}%`), like(leads.lastName, `%${input.search}%`), like(leads.company, `%${input.search}%`), like(leads.email, `%${input.search}%`), like(leads.phone, `%${input.search}%`), like(leads.source, `%${input.search}%`), like(leads.systemSize, `%${input.search}%`), like(leads.notes, `%${input.search}%`)));
      if (input.status) conditions.push(eq(leads.status, input.status as any));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [totalResult] = await db.select({ c: count() }).from(leads).where(where);
      const total = totalResult.c || 0;
      const offset = (input.page - 1) * input.limit;
      const items = await db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(input.limit).offset(offset);
      return { items, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) };
    }),
    create: protectedProcedure.input(z.object({
      firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), source: z.string().optional(),
      status: z.string().optional(), systemSize: z.string().optional(), estimatedValue: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(leads).values({ ...input, status: (input.status as any) || "new", createdBy: ctx.user.id });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "lead", details: `Created lead: ${input.firstName}` });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), source: z.string().optional(),
      status: z.string().optional(), systemSize: z.string().optional(), estimatedValue: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db.update(leads).set({ ...data, status: (data.status as any) || "new" }).where(eq(leads.id, id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "lead", entityId: id, details: `Updated lead: ${input.firstName}` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(leads).where(eq(leads.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "lead", entityId: input.id, details: `Deleted lead #${input.id}` });
      return { success: true };
    }),
  }),

  // ============ CONTACTS ============
  contacts: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0, page: input.page, limit: input.limit, totalPages: 0 };
      const conditions = [];
      if (input.search) conditions.push(or(like(contacts.firstName, `%${input.search}%`), like(contacts.lastName, `%${input.search}%`), like(contacts.email, `%${input.search}%`), like(contacts.company, `%${input.search}%`), like(contacts.phone, `%${input.search}%`), like(contacts.position, `%${input.search}%`), like(contacts.city, `%${input.search}%`), like(contacts.address, `%${input.search}%`)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [totalResult] = await db.select({ c: count() }).from(contacts).where(where);
      const total = totalResult.c || 0;
      const offset = (input.page - 1) * input.limit;
      const items = await db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(input.limit).offset(offset);
      return { items, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) };
    }),
    create: protectedProcedure.input(z.object({
      firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), position: z.string().optional(),
      city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(contacts).values({ ...input, createdBy: ctx.user.id });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "contact", details: `Created contact: ${input.firstName}` });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(),
      phone: z.string().optional(), company: z.string().optional(), position: z.string().optional(),
      city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db.update(contacts).set(data).where(eq(contacts.id, id));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(contacts).where(eq(contacts.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "contact", entityId: input.id, details: `Deleted contact #${input.id}` });
      return { success: true };
    }),
  }),

  // ============ ACCOUNTS ============
  accounts: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.search) conditions.push(or(like(accounts.name, `%${input.search}%`), like(accounts.email, `%${input.search}%`), like(accounts.industry, `%${input.search}%`), like(accounts.phone, `%${input.search}%`), like(accounts.city, `%${input.search}%`), like(accounts.website, `%${input.search}%`)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(accounts).where(where).orderBy(desc(accounts.createdAt)).limit(200);
    }),
    listAll: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: accounts.id, name: accounts.name }).from(accounts).orderBy(accounts.name);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1), industry: z.string().optional(), phone: z.string().optional(),
      email: z.string().optional(), website: z.string().optional(), city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(accounts).values({ ...input, createdBy: ctx.user.id });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "account", details: `Created account: ${input.name}` });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), name: z.string().min(1), industry: z.string().optional(), phone: z.string().optional(),
      email: z.string().optional(), website: z.string().optional(), city: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db.update(accounts).set(data).where(eq(accounts.id, id));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(accounts).where(eq(accounts.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "account", entityId: input.id, details: `Deleted account #${input.id}` });
      return { success: true };
    }),
  }),

  // ============ OPPORTUNITIES ============
  opportunities: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), status: z.string().optional() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.search) conditions.push(or(like(opportunities.title, `%${input.search}%`), like(opportunities.systemSize, `%${input.search}%`), like(opportunities.systemType, `%${input.search}%`), like(opportunities.notes, `%${input.search}%`)));
      if (input.status) conditions.push(eq(opportunities.status, input.status as any));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(opportunities).where(where).orderBy(desc(opportunities.createdAt)).limit(200);
    }),
    listAll: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: opportunities.id, title: opportunities.title, status: opportunities.status }).from(opportunities).orderBy(desc(opportunities.createdAt)).limit(100);
    }),
    create: protectedProcedure.input(z.object({
      title: z.string().min(1), status: z.string().optional(), value: z.string().optional(),
      systemSize: z.string().optional(), systemType: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(opportunities).values({ ...input, status: (input.status as any) || "new", createdBy: ctx.user.id });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "opportunity", details: `Created opportunity: ${input.title}` });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), title: z.string().min(1), status: z.string().optional(), value: z.string().optional(),
      systemSize: z.string().optional(), systemType: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db.update(opportunities).set({ ...data, status: (data.status as any) || "new" }).where(eq(opportunities.id, id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "opportunity", entityId: id, details: `Updated opportunity: ${input.title}` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(opportunities).where(eq(opportunities.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "opportunity", entityId: input.id, details: `Deleted opportunity #${input.id}` });
      return { success: true };
    }),
  }),

  // ============ ACTIVITIES ============
  activities: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.search) conditions.push(or(like(activities.subject, `%${input.search}%`), like(activities.description, `%${input.search}%`), sql`DATE_FORMAT(${activities.scheduledAt}, '%Y-%m-%d') LIKE ${`%${input.search}%`}`));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(activities).where(where).orderBy(desc(activities.createdAt)).limit(200);
    }),
    create: protectedProcedure.input(z.object({
      type: z.string(), subject: z.string().min(1), description: z.string().optional(),
      contactId: z.number().optional(), opportunityId: z.number().optional(), leadId: z.number().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(activities).values({ ...input, type: input.type as any, createdBy: ctx.user.id });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "activity", details: `Logged ${input.type}: ${input.subject}` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(activities).where(eq(activities.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "activity", entityId: input.id, details: `Deleted activity #${input.id}` });
      return { success: true };
    }),
  }),

  // ============ CONFIG OPTIONS ============
  config: router({
    getOptions: protectedProcedure.input(z.object({ category: z.string() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(configOptions).where(and(eq(configOptions.category, input.category), eq(configOptions.isActive, 1))).orderBy(configOptions.sortOrder);
    }),
    addOption: adminProcedure.input(z.object({ category: z.string(), value: z.string().min(1) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(configOptions).values({ category: input.category, value: input.value });
      return { success: true };
    }),
    removeOption: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(configOptions).set({ isActive: 0 }).where(eq(configOptions.id, input.id));
      return { success: true };
    }),
  }),

  // ============ SUPPLIERS ============
  suppliers: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.search) conditions.push(or(like(suppliers.name, `%${input.search}%`), like(suppliers.code, `%${input.search}%`), like(suppliers.contactPerson, `%${input.search}%`), like(suppliers.phone, `%${input.search}%`), like(suppliers.email, `%${input.search}%`), like(suppliers.address, `%${input.search}%`), like(suppliers.city, `%${input.search}%`), like(suppliers.notes, `%${input.search}%`)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(suppliers).where(where).orderBy(desc(suppliers.createdAt)).limit(200);
    }),
    listAll: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: suppliers.id, name: suppliers.name, code: suppliers.code }).from(suppliers).orderBy(suppliers.name).limit(500);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1), code: z.string().optional(), contactPerson: z.string().optional(),
      phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(),
      city: z.string().optional(), paymentTerms: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(suppliers).values({ ...input, createdBy: ctx.user.id });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "supplier", details: `Created supplier: ${input.name}` });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), name: z.string().min(1), code: z.string().optional(), contactPerson: z.string().optional(),
      phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(),
      city: z.string().optional(), paymentTerms: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db.update(suppliers).set(data).where(eq(suppliers.id, id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "supplier", entityId: id, details: `Updated supplier: ${input.name}` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(suppliers).where(eq(suppliers.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "supplier", entityId: input.id, details: `Deleted supplier #${input.id}` });
      return { success: true };
    }),
    // Get all item prices for a specific supplier
    getItemPrices: protectedProcedure.input(z.object({ supplierId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const prices = await db.select().from(supplierItemPrices).where(eq(supplierItemPrices.supplierId, input.supplierId)).orderBy(desc(supplierItemPrices.updatedAt));
      // Enrich with item names
      if (prices.length === 0) return [];
      const itemIds = prices.map(p => p.inventoryItemId);
      const items = await db.select({ id: inventoryItems.id, name: inventoryItems.name, sku: inventoryItems.sku, purchasePrice: inventoryItems.purchasePrice, unit: inventoryItems.unit }).from(inventoryItems).where(or(...itemIds.map(id => eq(inventoryItems.id, id))));
      const itemMap = new Map(items.map(i => [i.id, i]));
      return prices.map(p => ({ ...p, item: itemMap.get(p.inventoryItemId) || null }));
    }),
  }),

  // ============ INVENTORY ============
  inventory: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), category: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0, page: input.page, limit: input.limit, totalPages: 0 };
      const conditions = [];
      if (input.search) conditions.push(or(like(inventoryItems.name, `%${input.search}%`), like(inventoryItems.sku, `%${input.search}%`), like(inventoryItems.brand, `%${input.search}%`), like(inventoryItems.model, `%${input.search}%`), like(inventoryItems.description, `%${input.search}%`), like(inventoryItems.warehouseLocation, `%${input.search}%`)));
      if (input.category) conditions.push(eq(inventoryItems.category, input.category as any));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [totalResult] = await db.select({ c: count() }).from(inventoryItems).where(where);
      const total = totalResult.c || 0;
      const offset = (input.page - 1) * input.limit;
      const items = await db.select().from(inventoryItems).where(where).orderBy(desc(inventoryItems.createdAt)).limit(input.limit).offset(offset);
      return { items, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) };
    }),
    listAll: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: inventoryItems.id, name: inventoryItems.name, sku: inventoryItems.sku, category: inventoryItems.category, brand: inventoryItems.brand, model: inventoryItems.model, unit: inventoryItems.unit, purchasePrice: inventoryItems.purchasePrice, sellingPrice: inventoryItems.sellingPrice, stockOnHand: inventoryItems.stockOnHand }).from(inventoryItems).orderBy(inventoryItems.name).limit(500);
    }),
    create: protectedProcedure.input(z.object({
      sku: z.string().min(1), name: z.string().min(1), category: z.string(),
      brand: z.string().optional(), model: z.string().optional(), description: z.string().optional(),
      purchasePrice: z.string().optional(), sellingPrice: z.string().optional(),
      stockOnHand: z.number().optional(), reorderLevel: z.number().optional(),
      unit: z.string().optional(), warehouseLocation: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Non-admin users cannot set initial stock directly - must use Stock In transaction
      const initialStock = ctx.user.role === 'admin' ? (input.stockOnHand ?? 0) : 0;
      await db.insert(inventoryItems).values({ ...input, category: input.category as any, stockOnHand: initialStock, reorderLevel: input.reorderLevel ?? 5, createdBy: ctx.user.id });
      // If admin set initial stock, log it in audit
      if (initialStock > 0) {
        await db.insert(inventoryAuditLog).values({
          itemId: 0, // will be updated below
          itemName: input.name, itemSku: input.sku,
          transactionType: 'initial', quantity: initialStock,
          previousStock: 0, newStock: initialStock,
          destinationLocation: input.warehouseLocation || null,
          reference: 'Initial stock set on creation',
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
        });
      }
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "inventory", details: `Added item: ${input.name}` });
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, stockOnHand, priceChangeNotes, ...data } = input;
      // Get current item for audit log and price history
      const [currentItem] = await db.select({ stockOnHand: inventoryItems.stockOnHand, name: inventoryItems.name, sku: inventoryItems.sku, purchasePrice: inventoryItems.purchasePrice, sellingPrice: inventoryItems.sellingPrice }).from(inventoryItems).where(eq(inventoryItems.id, id));
      // Track price changes
      if (currentItem) {
        const oldPurchase = currentItem.purchasePrice || "0";
        const newPurchase = data.purchasePrice || "0";
        if (oldPurchase !== newPurchase) {
          await db.insert(itemPriceHistory).values({ itemId: id, priceType: "purchase", oldPrice: oldPurchase, newPrice: newPurchase, changedBy: ctx.user.id, changedByName: ctx.user.name || "Unknown", notes: priceChangeNotes || null });
        }
        const oldSelling = currentItem.sellingPrice || "0";
        const newSelling = data.sellingPrice || "0";
        if (oldSelling !== newSelling) {
          await db.insert(itemPriceHistory).values({ itemId: id, priceType: "selling", oldPrice: oldSelling, newPrice: newSelling, changedBy: ctx.user.id, changedByName: ctx.user.name || "Unknown", notes: priceChangeNotes || null });
        }
      }
      const prevStock = currentItem?.stockOnHand ?? 0;
      // Non-admin cannot directly edit stockOnHand - enforced at backend
      if (ctx.user.role !== 'admin') {
        // Strip stockOnHand for non-admin - they must use transactions
        await db.update(inventoryItems).set({ ...data, category: data.category as any }).where(eq(inventoryItems.id, id));
      } else {
        // Admin can edit stock directly
        if (stockOnHand !== undefined && stockOnHand !== prevStock) {
          await db.update(inventoryItems).set({ ...data, category: data.category as any, stockOnHand }).where(eq(inventoryItems.id, id));
          // Log the stock adjustment in inventory audit
          await db.insert(inventoryAuditLog).values({
            itemId: id, itemName: currentItem?.name || input.name, itemSku: currentItem?.sku || input.sku,
            transactionType: 'adjustment', quantity: Math.abs(stockOnHand - prevStock),
            previousStock: prevStock, newStock: stockOnHand,
            reference: 'Direct edit by admin',
            performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
          });
        } else {
          await db.update(inventoryItems).set({ ...data, category: data.category as any, ...(stockOnHand !== undefined ? { stockOnHand } : {}) }).where(eq(inventoryItems.id, id));
        }
      }
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "inventory", entityId: id, details: `Updated item: ${input.name}` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error("Only Admin can delete inventory items");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(inventoryItems).where(eq(inventoryItems.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "inventory", entityId: input.id, details: `Deleted item #${input.id}` });
      return { success: true };
    }),
    priceHistory: protectedProcedure.input(z.object({ itemId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(itemPriceHistory).where(eq(itemPriceHistory.itemId, input.itemId)).orderBy(desc(itemPriceHistory.createdAt)).limit(100);
    }),
  }),

  // ============ STOCK TRANSACTIONS ============
  stockTransactions: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.select({
        id: stockTransactions.id,
        itemId: stockTransactions.itemId,
        type: stockTransactions.type,
        quantity: stockTransactions.quantity,
        reference: stockTransactions.reference,
        purpose: stockTransactions.purpose,
        purposeRefId: stockTransactions.purposeRefId,
        purposeRefName: stockTransactions.purposeRefName,
        accountId: stockTransactions.accountId,
        accountName: stockTransactions.accountName,
        notes: stockTransactions.notes,
        createdBy: stockTransactions.createdBy,
        createdByName: stockTransactions.createdByName,
        createdAt: stockTransactions.createdAt,
        itemName: inventoryItems.name,
      }).from(stockTransactions)
        .leftJoin(inventoryItems, eq(stockTransactions.itemId, inventoryItems.id))
        .orderBy(desc(stockTransactions.createdAt)).limit(200);
      return result;
    }),
    create: protectedProcedure.input(z.object({
      itemId: z.number(), type: z.string(), quantity: z.number().min(1),
      reference: z.string().optional(), notes: z.string().optional(),
      purpose: z.string().optional(), purposeRefId: z.number().optional(), purposeRefName: z.string().optional(),
      accountId: z.number().optional(), accountName: z.string().optional(),
      sourceLocation: z.string().optional(), destinationLocation: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Only admin can do adjustments directly
      if (input.type === 'adjustment' && ctx.user.role !== 'admin') {
        throw new Error("Only admin can perform stock adjustments");
      }
      // Get current stock for audit log
      const [item] = await db.select({ stockOnHand: inventoryItems.stockOnHand, name: inventoryItems.name, sku: inventoryItems.sku, warehouseLocation: inventoryItems.warehouseLocation }).from(inventoryItems).where(eq(inventoryItems.id, input.itemId));
      const prevStock = item?.stockOnHand ?? 0;
      let newStock = prevStock;

      await db.insert(stockTransactions).values({ ...input, type: input.type as any, createdBy: ctx.user.id, createdByName: ctx.user.name || 'Unknown' });
      if (input.type === "stock_in") {
        await db.update(inventoryItems).set({ stockOnHand: sql`stockOnHand + ${input.quantity}` }).where(eq(inventoryItems.id, input.itemId));
        newStock = prevStock + input.quantity;
      } else if (input.type === "stock_out") {
        await db.update(inventoryItems).set({ stockOnHand: sql`stockOnHand - ${input.quantity}` }).where(eq(inventoryItems.id, input.itemId));
        newStock = prevStock - input.quantity;
      }
      // Write to inventory audit log
      const auditPurpose = input.purpose ? (input.accountName ? `${input.purpose} [Account: ${input.accountName}]` : input.purpose) : (input.accountName ? `Account: ${input.accountName}` : null);
      await db.insert(inventoryAuditLog).values({
        itemId: input.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
        transactionType: input.type as any, quantity: input.quantity,
        previousStock: prevStock, newStock,
        sourceLocation: input.sourceLocation || item?.warehouseLocation || null,
        destinationLocation: input.destinationLocation || null,
        reference: input.reference || null, purpose: auditPurpose,
        notes: input.notes || null,
        performedBy: ctx.user.id, performedByName: ctx.user.name || 'Unknown',
      });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "stock_transaction", details: `${input.type} x${input.quantity} for item #${input.itemId}${input.purpose ? ` (${input.purpose})` : ''}` });
      return { success: true };
    }),
    // Warehouse Transfer: stock-out from source + stock-in to destination
    transfer: protectedProcedure.input(z.object({
      itemId: z.number(), quantity: z.number().min(1),
      sourceLocation: z.string().min(1), destinationLocation: z.string().min(1),
      reference: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [item] = await db.select({ stockOnHand: inventoryItems.stockOnHand, name: inventoryItems.name, sku: inventoryItems.sku }).from(inventoryItems).where(eq(inventoryItems.id, input.itemId));
      const prevStock = item?.stockOnHand ?? 0;
      if (input.quantity > prevStock) throw new Error("Insufficient stock for transfer");
      // Create transfer-out transaction
      await db.insert(stockTransactions).values({
        itemId: input.itemId, type: 'stock_out', quantity: input.quantity,
        reference: input.reference || `Transfer: ${input.sourceLocation} → ${input.destinationLocation}`,
        purpose: 'Warehouse Transfer', notes: input.notes || null, createdBy: ctx.user.id, createdByName: ctx.user.name || 'Unknown',
      });
      // Create transfer-in transaction
      await db.insert(stockTransactions).values({
        itemId: input.itemId, type: 'stock_in', quantity: input.quantity,
        reference: input.reference || `Transfer: ${input.sourceLocation} → ${input.destinationLocation}`,
        purpose: 'Warehouse Transfer', notes: input.notes || null, createdBy: ctx.user.id, createdByName: ctx.user.name || 'Unknown',
      });
      // Stock stays the same (out + in), but update location if needed
      // Log transfer_out and transfer_in in audit
      await db.insert(inventoryAuditLog).values({
        itemId: input.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
        transactionType: 'transfer_out', quantity: input.quantity,
        previousStock: prevStock, newStock: prevStock,
        sourceLocation: input.sourceLocation, destinationLocation: input.destinationLocation,
        reference: input.reference || null, purpose: 'Warehouse Transfer',
        notes: input.notes || null,
        performedBy: ctx.user.id, performedByName: ctx.user.name || 'Unknown',
      });
      await db.insert(inventoryAuditLog).values({
        itemId: input.itemId, itemName: item?.name || null, itemSku: item?.sku || null,
        transactionType: 'transfer_in', quantity: input.quantity,
        previousStock: prevStock, newStock: prevStock,
        sourceLocation: input.sourceLocation, destinationLocation: input.destinationLocation,
        reference: input.reference || null, purpose: 'Warehouse Transfer',
        notes: input.notes || null,
        performedBy: ctx.user.id, performedByName: ctx.user.name || 'Unknown',
      });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "stock_transfer", details: `Transfer x${input.quantity} of item #${input.itemId} from ${input.sourceLocation} to ${input.destinationLocation}` });
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
      const db = await getDb();
      if (!db) return { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      const { search, supplierId, deliveryStatus, paymentStatus, dateFrom, dateTo, page = 1, limit = 20 } = input || {};
      const conditions: any[] = [];
      if (search) {
        // Search across PO number, supplier name, notes, and dates (formatted as string)
        const searchConditions = or(
          like(purchaseOrders.poNumber, `%${search}%`),
          like(purchaseOrders.supplier, `%${search}%`),
          like(purchaseOrders.notes, `%${search}%`),
          sql`DATE_FORMAT(${purchaseOrders.createdAt}, '%Y-%m-%d') LIKE ${`%${search}%`}`,
          sql`DATE_FORMAT(${purchaseOrders.createdAt}, '%m/%Y') LIKE ${`%${search}%`}`,
          sql`DATE_FORMAT(${purchaseOrders.createdAt}, '%Y') LIKE ${`%${search}%`}`,
          sql`${purchaseOrders.id} IN (SELECT purchaseOrderId FROM purchase_order_items WHERE itemName LIKE ${`%${search}%`} OR description LIKE ${`%${search}%`} OR itemSku LIKE ${`%${search}%`})`
        );
        conditions.push(searchConditions);
      }
      if (supplierId) conditions.push(eq(purchaseOrders.supplierId, supplierId));
      if (deliveryStatus) conditions.push(eq(purchaseOrders.deliveryStatus, deliveryStatus as any));
      if (paymentStatus) conditions.push(eq(purchaseOrders.paymentStatus, paymentStatus as any));
      if (dateFrom) conditions.push(gte(purchaseOrders.createdAt, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(purchaseOrders.createdAt, new Date(dateTo)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [countResult] = await db.select({ count: count() }).from(purchaseOrders).where(where);
      const total = countResult?.count || 0;
      const totalPages = Math.ceil(total / limit);
      const items = await db.select().from(purchaseOrders).where(where).orderBy(desc(purchaseOrders.createdAt)).limit(limit).offset((page - 1) * limit);
      return { items, total, page, limit, totalPages };
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id));
      if (!po) throw new Error("Purchase order not found");
      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, input.id));
      const payments = await db.select().from(poPayments).where(eq(poPayments.purchaseOrderId, input.id)).orderBy(desc(poPayments.createdAt));
      return { ...po, items, payments };
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      // Calculate subtotal
      let subtotal = 0;
      const lineItems = input.items.map(item => {
        const lineTotal = item.quantity * parseFloat(item.unitPrice || "0");
        subtotal += lineTotal;
        return { ...item, lineTotal: lineTotal.toFixed(2), unitPrice: item.unitPrice || "0" };
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
      const [result] = await db.insert(purchaseOrders).values({
        poNumber,
        supplier: input.supplier,
        supplierId: input.supplierId,
        totalAmount: totalAmount.toFixed(2),
        vatEnabled: input.vatEnabled ? 1 : 0,
        vatRate: input.vatRate || "12",
        discountType: input.discountType || "none",
        discountValue: input.discountValue || "0",
        notes: input.notes,
        orderedAt: input.orderedAt ? new Date(input.orderedAt) : null,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || 'Unknown',
      });
      const poId = result.insertId;
      // Insert line items
      for (const item of lineItems) {
        await db.insert(purchaseOrderItems).values({
          purchaseOrderId: poId,
          itemId: item.itemId,
          itemName: item.itemName,
          itemSku: item.itemSku,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        });
      }
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "purchase_order", details: `Created PO: ${poNumber} for ${input.supplier} with ${input.items.length} items, total ₱${totalAmount.toLocaleString()}` });
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
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const updates: any = {};
      if (input.status) updates.status = input.status;
      if (input.deliveryStatus) updates.deliveryStatus = input.deliveryStatus;
      if (input.paymentStatus) updates.paymentStatus = input.paymentStatus;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.deliveryStatus === "fully_delivered") updates.deliveredAt = new Date();
      if (input.vatEnabled !== undefined) updates.vatEnabled = input.vatEnabled ? 1 : 0;
      if (input.vatRate !== undefined) updates.vatRate = input.vatRate;
      if (input.discountType !== undefined) updates.discountType = input.discountType;
      if (input.discountValue !== undefined) updates.discountValue = input.discountValue;
      // Recalculate total if VAT/discount changed
      if (input.recalculate) {
        const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, input.id));
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
        updates.totalAmount = (afterDiscount + vatAmount).toFixed(2);
      }
      await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "purchase_order", entityId: input.id, details: `Updated PO #${input.id}: ${JSON.stringify(updates)}` });
      return { success: true };
    }),

    addPayment: protectedProcedure.input(z.object({
      purchaseOrderId: z.number(),
      amount: z.string().min(1),
      paymentDate: z.string().min(1),
      reference: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(poPayments).values({
        purchaseOrderId: input.purchaseOrderId,
        amount: input.amount,
        paymentDate: new Date(input.paymentDate),
        reference: input.reference,
        notes: input.notes,
        createdBy: ctx.user.id,
      });
      // Recalculate paid amount
      const [paidResult] = await db.select({ total: sum(poPayments.amount) }).from(poPayments).where(eq(poPayments.purchaseOrderId, input.purchaseOrderId));
      const paidAmount = parseFloat(paidResult?.total || "0");
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.purchaseOrderId));
      const totalAmount = parseFloat(po?.totalAmount || "0");
      let paymentStatus: "unpaid" | "partially_paid" | "paid" = "unpaid";
      if (paidAmount >= totalAmount && totalAmount > 0) paymentStatus = "paid";
      else if (paidAmount > 0) paymentStatus = "partially_paid";
      await db.update(purchaseOrders).set({ paidAmount: paidAmount.toFixed(2), paymentStatus }).where(eq(purchaseOrders.id, input.purchaseOrderId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "payment", entity: "purchase_order", entityId: input.purchaseOrderId, details: `Payment of ₱${input.amount} recorded for PO #${input.purchaseOrderId}. Ref: ${input.reference || 'N/A'}` });
      return { success: true };
    }),

    // Get supplier-specific price for a given supplier+item pair
    getSupplierItemPrice: protectedProcedure.input(z.object({
      supplierId: z.number(),
      itemId: z.number(),
    })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [record] = await db.select().from(supplierItemPrices)
        .where(and(eq(supplierItemPrices.supplierId, input.supplierId), eq(supplierItemPrices.inventoryItemId, input.itemId)));
      return record || null;
    }),

    // Get all supplier prices for a given supplier (used in PO create)
    getSupplierPrices: protectedProcedure.input(z.object({
      supplierId: z.number(),
    })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(supplierItemPrices)
        .where(eq(supplierItemPrices.supplierId, input.supplierId));
    }),

    // Update supplier-item price record (upsert)
    updateSupplierItemPrice: protectedProcedure.input(z.object({
      supplierId: z.number(),
      inventoryItemId: z.number(),
      unitPrice: z.string(),
      purchaseOrderId: z.number().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Upsert: check if record exists
      const [existing] = await db.select().from(supplierItemPrices)
        .where(and(eq(supplierItemPrices.supplierId, input.supplierId), eq(supplierItemPrices.inventoryItemId, input.inventoryItemId)));
      if (existing) {
        await db.update(supplierItemPrices).set({
          unitPrice: input.unitPrice,
          lastPurchaseOrderId: input.purchaseOrderId,
          updatedBy: ctx.user.id,
        }).where(eq(supplierItemPrices.id, existing.id));
      } else {
        await db.insert(supplierItemPrices).values({
          supplierId: input.supplierId,
          inventoryItemId: input.inventoryItemId,
          unitPrice: input.unitPrice,
          lastPurchaseOrderId: input.purchaseOrderId,
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Get current price for history
      const [currentItem] = await db.select({ purchasePrice: inventoryItems.purchasePrice }).from(inventoryItems).where(eq(inventoryItems.id, input.itemId));
      const oldPrice = currentItem?.purchasePrice || "0";
      if (oldPrice !== input.purchasePrice) {
        await db.insert(itemPriceHistory).values({ itemId: input.itemId, priceType: "purchase", oldPrice, newPrice: input.purchasePrice, changedBy: ctx.user.id, changedByName: ctx.user.name || "Unknown", notes: input.notes || null });
      }
      await db.update(inventoryItems).set({ purchasePrice: input.purchasePrice }).where(eq(inventoryItems.id, input.itemId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update_price", entity: "inventory_item", entityId: input.itemId, details: `Updated purchase price to ₱${input.purchasePrice}` });
      return { success: true };
    }),

    // Analytics: purchases by supplier
    analyticsBySupplier: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.select({
        supplierId: purchaseOrders.supplierId,
        supplier: purchaseOrders.supplier,
        totalPOs: count(),
        totalValue: sum(purchaseOrders.totalAmount),
        totalPaid: sum(purchaseOrders.paidAmount),
      }).from(purchaseOrders).groupBy(purchaseOrders.supplierId, purchaseOrders.supplier).orderBy(desc(sum(purchaseOrders.totalAmount)));
      return result;
    }),

    // Analytics: outstanding POs
    analyticsOutstanding: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { unpaid: 0, partiallyPaid: 0, notDelivered: 0, partiallyDelivered: 0 };
      const [unpaidCount] = await db.select({ count: count() }).from(purchaseOrders).where(eq(purchaseOrders.paymentStatus, "unpaid"));
      const [partiallyPaidCount] = await db.select({ count: count() }).from(purchaseOrders).where(eq(purchaseOrders.paymentStatus, "partially_paid"));
      const [notDeliveredCount] = await db.select({ count: count() }).from(purchaseOrders).where(eq(purchaseOrders.deliveryStatus, "not_delivered"));
      const [partiallyDeliveredCount] = await db.select({ count: count() }).from(purchaseOrders).where(eq(purchaseOrders.deliveryStatus, "partially_delivered"));
      return {
        unpaid: unpaidCount?.count || 0,
        partiallyPaid: partiallyPaidCount?.count || 0,
        notDelivered: notDeliveredCount?.count || 0,
        partiallyDelivered: partiallyDeliveredCount?.count || 0,
      };
    }),
  }),

  // ============ BOM PACKAGES ============
  bom: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(bomPackages).orderBy(desc(bomPackages.createdAt)).limit(200);
    }),
    getItems: protectedProcedure.input(z.object({ packageId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.select({
        id: bomPackageItems.id,
        packageId: bomPackageItems.packageId,
        itemId: bomPackageItems.itemId,
        quantity: bomPackageItems.quantity,
        itemName: inventoryItems.name,
        itemSku: inventoryItems.sku,
        sellingPrice: inventoryItems.sellingPrice,
      }).from(bomPackageItems)
        .leftJoin(inventoryItems, eq(bomPackageItems.itemId, inventoryItems.id))
        .where(eq(bomPackageItems.packageId, input.packageId));
      return result;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1), description: z.string().optional(),
      systemSize: z.string().optional(), systemType: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(bomPackages).values({ ...input, createdBy: ctx.user.id });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "bom_package", details: `Created BOM: ${input.name}` });
      return { success: true };
    }),
    addItem: protectedProcedure.input(z.object({
      packageId: z.number(), itemId: z.number(), quantity: z.number().min(1),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(bomPackageItems).values(input);
      // Recalculate total cost
      const items = await db.select({
        quantity: bomPackageItems.quantity,
        price: inventoryItems.sellingPrice,
      }).from(bomPackageItems)
        .leftJoin(inventoryItems, eq(bomPackageItems.itemId, inventoryItems.id))
        .where(eq(bomPackageItems.packageId, input.packageId));
      const totalCost = items.reduce((sum, i) => sum + (i.quantity * Number(i.price || 0)), 0);
      await db.update(bomPackages).set({ totalCost: totalCost.toFixed(2) }).where(eq(bomPackages.id, input.packageId));
      return { success: true };
    }),
    removeItem: protectedProcedure.input(z.object({ id: z.number(), packageId: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(bomPackageItems).where(eq(bomPackageItems.id, input.id));
      // Recalculate total cost
      const items = await db.select({
        quantity: bomPackageItems.quantity,
        price: inventoryItems.sellingPrice,
      }).from(bomPackageItems)
        .leftJoin(inventoryItems, eq(bomPackageItems.itemId, inventoryItems.id))
        .where(eq(bomPackageItems.packageId, input.packageId));
      const totalCost = items.reduce((sum, i) => sum + (i.quantity * Number(i.price || 0)), 0);
      await db.update(bomPackages).set({ totalCost: totalCost.toFixed(2) }).where(eq(bomPackages.id, input.packageId));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(bomPackageItems).where(eq(bomPackageItems.packageId, input.id));
      await db.delete(bomPackages).where(eq(bomPackages.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "bom_package", entityId: input.id, details: `Deleted BOM #${input.id}` });
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
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const filters: any[] = [];
      const p = input || { page: 1, limit: 20 };
      if (p.search) {
        filters.push(or(
          like(quotations.customerName, `%${p.search}%`),
          like(quotations.title, `%${p.search}%`),
          like(quotations.quoteNumber, `%${p.search}%`),
          like(quotations.customerAddress, `%${p.search}%`),
          like(quotations.customerEmail, `%${p.search}%`),
          like(quotations.notes, `%${p.search}%`),
          sql`EXISTS (SELECT 1 FROM accounts WHERE accounts.id = ${quotations.accountId} AND accounts.name LIKE ${`%${p.search}%`})`,
          sql`DATE_FORMAT(${quotations.createdAt}, '%Y-%m-%d') LIKE ${`%${p.search}%`}`,
          sql`DATE_FORMAT(${quotations.createdAt}, '%m/%Y') LIKE ${`%${p.search}%`}`,
          sql`DATE_FORMAT(${quotations.createdAt}, '%Y') LIKE ${`%${p.search}%`}`
        ));
      }
      if (p.address) filters.push(like(quotations.customerAddress, `%${p.address}%`));
      if (p.kwRating) filters.push(like(quotations.title, `%${p.kwRating}%`));
      if (p.setupType) filters.push(like(quotations.title, `%${p.setupType}%`));
      if (p.year) {
        const startOfYear = new Date(p.year, (p.month || 1) - 1, 1);
        const endDate = p.month ? new Date(p.year, p.month, 0, 23, 59, 59) : new Date(p.year, 11, 31, 23, 59, 59);
        filters.push(gte(quotations.createdAt, startOfYear));
        filters.push(lte(quotations.createdAt, endDate));
      }
      if (p.dateFrom) filters.push(gte(quotations.createdAt, new Date(p.dateFrom)));
      if (p.dateTo) filters.push(lte(quotations.createdAt, new Date(p.dateTo + "T23:59:59")));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [totalResult] = await db.select({ count: count() }).from(quotations).where(where);
      const items = await db.select().from(quotations).where(where).orderBy(desc(quotations.createdAt)).limit(p.limit).offset((p.page - 1) * p.limit);
      return { items, total: totalResult?.count || 0 };
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [q] = await db.select().from(quotations).where(eq(quotations.id, input.id)).limit(1);
      return q || null;
    }),
    getItems: protectedProcedure.input(z.object({ quotationId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(quotationItems).where(eq(quotationItems.quotationId, input.quotationId));
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const quoteNumber = `QT-${Date.now().toString(36).toUpperCase()}`;
      const { vatEnabled, ...rest } = input;
      // Auto-create contact if customerName is provided but no contactId is linked
      let contactId = input.contactId;
      if (!contactId && input.customerName && input.customerName.trim()) {
        // Check if contact already exists with this name
        const nameParts = input.customerName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || null;
        const existingContacts = await db.select({ id: contacts.id }).from(contacts)
          .where(and(
            eq(contacts.firstName, firstName),
            lastName ? eq(contacts.lastName, lastName) : sql`${contacts.lastName} IS NULL OR ${contacts.lastName} = ''`
          )).limit(1);
        if (existingContacts.length > 0) {
          contactId = existingContacts[0].id;
        } else {
          // Create new contact
          const [newContact] = await db.insert(contacts).values({
            firstName,
            lastName,
            email: input.customerEmail || null,
            phone: input.customerPhone || null,
            address: input.customerAddress || null,
            createdBy: ctx.user.id,
          });
          contactId = newContact.insertId;
          await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "contact", details: `Auto-created contact: ${input.customerName} (from quotation)` });
        }
      }
      const { contactId: _cid, ...restWithoutContact } = rest;
      await db.insert(quotations).values({ ...restWithoutContact, contactId, vatEnabled: vatEnabled ? 1 : 0, quoteNumber, createdBy: ctx.user.id, createdByName: ctx.user.name || 'Unknown' });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "quotation", details: `Created quotation: ${quoteNumber}` });
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, vatEnabled, ...fields } = input;
      const updateData: any = { ...fields, lastEditedBy: ctx.user.id };
      if (vatEnabled !== undefined) updateData.vatEnabled = vatEnabled ? 1 : 0;
      await db.update(quotations).set(updateData).where(eq(quotations.id, id));
      // Recalculate totals after update
      const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id));
      const subtotal = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
      const [quote] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
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
      await db.update(quotations).set({
        subtotal: subtotal.toFixed(2),
        discountAmount: totalDiscountAmt.toFixed(2),
        taxAmount: taxAmt.toFixed(2),
        totalAmount: total.toFixed(2),
      }).where(eq(quotations.id, id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "quotation", entityId: id, details: `Updated quotation #${id}` });
      return { success: true };
    }),
    addItem: protectedProcedure.input(z.object({
      quotationId: z.number(), itemId: z.number().optional(), itemType: z.enum(["inventory", "labor", "custom"]).default("inventory"),
      description: z.string().min(1), quantity: z.number().min(1), unitPrice: z.string(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const totalPrice = (input.quantity * Number(input.unitPrice)).toFixed(2);
      await db.insert(quotationItems).values({ ...input, unitPrice: input.unitPrice, totalPrice });
      // Recalculate quotation totals
      const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, input.quotationId));
      const subtotal = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
      const [quote] = await db.select().from(quotations).where(eq(quotations.id, input.quotationId)).limit(1);
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
      await db.update(quotations).set({
        subtotal: subtotal.toFixed(2),
        discountAmount: totalDiscountAmt.toFixed(2),
        taxAmount: taxAmt.toFixed(2),
        totalAmount: total.toFixed(2),
      }).where(eq(quotations.id, input.quotationId));
      return { success: true };
    }),
    removeItem: protectedProcedure.input(z.object({ id: z.number(), quotationId: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(quotationItems).where(eq(quotationItems.id, input.id));
      // Recalculate totals
      const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, input.quotationId));
      const subtotal = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
      const [quote] = await db.select().from(quotations).where(eq(quotations.id, input.quotationId)).limit(1);
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
      await db.update(quotations).set({
        subtotal: subtotal.toFixed(2),
        discountAmount: totalDiscountAmt.toFixed(2),
        taxAmount: taxAmt.toFixed(2),
        totalAmount: total.toFixed(2),
      }).where(eq(quotations.id, input.quotationId));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(quotationItems).where(eq(quotationItems.quotationId, input.id));
      await db.delete(quotations).where(eq(quotations.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "quotation", entityId: input.id, details: `Deleted quotation #${input.id}` });
      return { success: true };
    }),
    createDeliveryReceipt: protectedProcedure.input(z.object({
      quotationId: z.number(), deliveryDate: z.string(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [quote] = await db.select().from(quotations).where(eq(quotations.id, input.quotationId)).limit(1);
      if (!quote) throw new Error("Quotation not found");
      const receiptNumber = `DR-${Date.now().toString(36).toUpperCase()}`;
      const [inserted] = await db.insert(deliveryReceipts).values({
        quotationId: input.quotationId, receiptNumber, deliveryDate: new Date(input.deliveryDate),
        customerName: quote.customerName, customerAddress: quote.customerAddress,
        projectReference: quote.title, notes: input.notes,
        createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      }).$returningId();
      return { success: true, receiptNumber, id: inserted.id };
    }),
    getDeliveryReceipts: protectedProcedure.input(z.object({ quotationId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(deliveryReceipts).where(eq(deliveryReceipts.quotationId, input.quotationId)).orderBy(desc(deliveryReceipts.createdAt));
    }),
    createAcknowledgement: protectedProcedure.input(z.object({
      quotationId: z.number(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [quote] = await db.select().from(quotations).where(eq(quotations.id, input.quotationId)).limit(1);
      if (!quote) throw new Error("Quotation not found");
      const receiptNumber = `ACK-${Date.now().toString(36).toUpperCase()}`;
      const [insertedAck] = await db.insert(acknowledgementReceipts).values({
        type: "quotation", referenceId: input.quotationId, receiptNumber,
        customerName: quote.customerName, projectReference: quote.title,
        amount: quote.totalAmount, notes: input.notes,
        createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      }).$returningId();
      return { success: true, receiptNumber, id: insertedAck.id };
    }),
    getAcknowledgements: protectedProcedure.input(z.object({ quotationId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(acknowledgementReceipts).where(and(eq(acknowledgementReceipts.type, "quotation"), eq(acknowledgementReceipts.referenceId, input.quotationId))).orderBy(desc(acknowledgementReceipts.createdAt));
    }),
  }),

  // ============ NET METERING PAYMENTS ============
  netMeteringPayments: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().optional(), netMeteringId: z.number().optional() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const filters: any[] = [];
      if (input.projectId) filters.push(eq(netMeteringPayments.projectId, input.projectId));
      if (input.netMeteringId) filters.push(eq(netMeteringPayments.netMeteringId, input.netMeteringId));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const payments = await db.select().from(netMeteringPayments).where(where).orderBy(desc(netMeteringPayments.paymentDate));
      // Attach lastAckId for re-print capability
      const paymentIds = payments.map(p => p.id);
      if (paymentIds.length === 0) return payments;
      const acks = await db.select().from(acknowledgementReceipts).where(and(eq(acknowledgementReceipts.type, "net_metering_payment"), inArray(acknowledgementReceipts.referenceId, paymentIds)));
      const ackMap = new Map<number, number>();
      acks.forEach(a => { if (!ackMap.has(a.referenceId) || a.id > ackMap.get(a.referenceId)!) ackMap.set(a.referenceId, a.id); });
      return payments.map(p => ({ ...p, lastAckId: ackMap.get(p.id) || null }));
    }),
    add: protectedProcedure.input(z.object({
      projectId: z.number(), netMeteringId: z.number(),
      paymentDate: z.string(), amount: z.string(), paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(netMeteringPayments).values({
        projectId: input.projectId, netMeteringId: input.netMeteringId,
        paymentDate: new Date(input.paymentDate), amount: input.amount,
        paymentMethod: input.paymentMethod, paymentReference: input.paymentReference,
        notes: input.notes, createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(netMeteringPayments).where(eq(netMeteringPayments.id, input.id));
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
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const p = input || { page: 1, limit: 20 };
      // Get all net metering records with their payments
      const nmRecords = await db.select().from(netMetering).orderBy(desc(netMetering.createdAt));
      const allPayments = await db.select().from(netMeteringPayments);
      const projectsList = await db.select({ id: projects.id, name: projects.name, customerName: projects.customerName }).from(projects);
      const projectMap = Object.fromEntries(projectsList.map(p => [p.id, p]));
      let results = nmRecords.map(nm => {
        const payments = allPayments.filter(p => p.netMeteringId === nm.id);
        const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
        const lastPayment = payments.length > 0 ? payments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0] : null;
        const project = nm.projectId ? projectMap[nm.projectId] : null;
        return {
          id: nm.id, projectId: nm.projectId, projectName: project?.name || nm.projectName || "-",
          customerName: project?.customerName || nm.clientName || "-",
          electricCompany: nm.electricCompany || "-",
          totalPaid, paymentCount: payments.length,
          lastPaymentDate: lastPayment?.paymentDate || null,
          status: nm.status,
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
        const from = new Date(p.dateFrom);
        results = results.filter(r => r.lastPaymentDate && new Date(r.lastPaymentDate) >= from);
      }
      if (p.dateTo) {
        const to = new Date(p.dateTo + "T23:59:59");
        results = results.filter(r => r.lastPaymentDate && new Date(r.lastPaymentDate) <= to);
      }
      const total = results.length;
      const items = results.slice(((p.page || 1) - 1) * (p.limit || 20), (p.page || 1) * (p.limit || 20));
      return { items, total };
    }),
  }),

  // ============ ACKNOWLEDGEMENT RECEIPTS ============
  acknowledgements: router({
    createForProjectPayment: protectedProcedure.input(z.object({
      paymentId: z.number(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [payment] = await db.select().from(projectPayments).where(eq(projectPayments.id, input.paymentId)).limit(1);
      if (!payment) throw new Error("Payment not found");
      const [project] = await db.select().from(projects).where(eq(projects.id, payment.projectId)).limit(1);
      const receiptNumber = `ACK-${Date.now().toString(36).toUpperCase()}`;
      const [insertedPP] = await db.insert(acknowledgementReceipts).values({
        type: "project_payment", referenceId: input.paymentId, receiptNumber,
        customerName: project?.customerName, projectReference: project?.name,
        amount: payment.amount, paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod, paymentReference: payment.paymentReference,
        notes: input.notes, createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      }).$returningId();
      return { success: true, receiptNumber, id: insertedPP.id };
    }),
    createForNetMeteringPayment: protectedProcedure.input(z.object({
      paymentId: z.number(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [payment] = await db.select().from(netMeteringPayments).where(eq(netMeteringPayments.id, input.paymentId)).limit(1);
      if (!payment) throw new Error("Payment not found");
      const [project] = await db.select().from(projects).where(eq(projects.id, payment.projectId)).limit(1);
      const receiptNumber = `ACK-${Date.now().toString(36).toUpperCase()}`;
      const [insertedNM] = await db.insert(acknowledgementReceipts).values({
        type: "net_metering_payment", referenceId: input.paymentId, receiptNumber,
        customerName: project?.customerName, projectReference: `${project?.name || ""} - Net Metering`,
        amount: payment.amount, paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod, paymentReference: payment.paymentReference,
        notes: input.notes, createdBy: ctx.user.id, createdByName: ctx.user.name || "Admin",
      }).$returningId();
      return { success: true, receiptNumber, id: insertedNM.id };
    }),
    getForPayment: protectedProcedure.input(z.object({ paymentId: z.number(), type: z.enum(["project_payment", "net_metering_payment"]) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(acknowledgementReceipts).where(and(eq(acknowledgementReceipts.type, input.type), eq(acknowledgementReceipts.referenceId, input.paymentId))).orderBy(desc(acknowledgementReceipts.createdAt));
    }),
    getForProject: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get all project payment IDs and NM payment IDs for this project
      const projPayments = await db.select({ id: projectPayments.id }).from(projectPayments).where(eq(projectPayments.projectId, input.projectId));
      const nmPayments = await db.select({ id: netMeteringPayments.id }).from(netMeteringPayments).where(eq(netMeteringPayments.projectId, input.projectId));
      const projIds = projPayments.map(p => p.id);
      const nmIds = nmPayments.map(p => p.id);
      const allIds = [...projIds, ...nmIds];
      if (allIds.length === 0) return [];
      // Get all ack receipts for these payment IDs
      const results = await db.select().from(acknowledgementReceipts).where(
        or(
          projIds.length > 0 ? and(eq(acknowledgementReceipts.type, "project_payment"), inArray(acknowledgementReceipts.referenceId, projIds)) : undefined,
          nmIds.length > 0 ? and(eq(acknowledgementReceipts.type, "net_metering_payment"), inArray(acknowledgementReceipts.referenceId, nmIds)) : undefined,
        )
      ).orderBy(desc(acknowledgementReceipts.createdAt));
      return results;
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [r] = await db.select().from(acknowledgementReceipts).where(eq(acknowledgementReceipts.id, input.id)).limit(1);
      return r || null;
    }),
  }),

  // ============ USERS (Admin only) ============
  users: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const role = ctx.user.role;
      const search = input?.search;
      const searchCondition = search ? or(
        like(users.username, `%${search}%`),
        like(users.name, `%${search}%`),
        like(users.email, `%${search}%`),
        like(users.mobile, `%${search}%`),
        like(users.role, `%${search}%`)
      ) : undefined;
      // Admin sees all users; SubAdmin sees users they created + themselves
      if (role === "admin") {
        const conditions = searchCondition ? [searchCondition] : [];
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select({
          id: users.id, name: users.name, username: users.username, email: users.email,
          mobile: users.mobile, role: users.role, status: users.status,
          createdAt: users.createdAt, lastSignedIn: users.lastSignedIn, createdBy: users.createdBy,
          loginMethod: users.loginMethod, passwordPlain: users.passwordPlain,
          totpEnabled: users.totpEnabled,
        }).from(users).where(where).orderBy(desc(users.createdAt)).limit(200);
      } else if (role === "subadmin") {
        const roleCondition = or(eq(users.createdBy, ctx.user.id), eq(users.id, ctx.user.id));
        const where = searchCondition ? and(roleCondition, searchCondition) : roleCondition;
        return db.select({
          id: users.id, name: users.name, username: users.username, email: users.email,
          mobile: users.mobile, role: users.role, status: users.status,
          createdAt: users.createdAt, lastSignedIn: users.lastSignedIn, createdBy: users.createdBy,
          loginMethod: users.loginMethod, totpEnabled: users.totpEnabled,
        }).from(users).where(where).orderBy(desc(users.createdAt)).limit(200);
      }
      return [];
    }),
    create: protectedProcedure.input(z.object({
      username: z.string().min(3),
      password: z.string().min(6),
      name: z.string().min(1),
      email: z.string().email().optional(),
      mobile: z.string().optional(),
      role: z.enum(["admin", "subadmin", "purchaser", "staff", "sales_rep"]),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
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
      const existing = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
      if (existing.length > 0) throw new Error("Username already exists");
      const passwordHash = await hashPassword(input.password);
      const openId = generateLocalOpenId();
      await db.insert(users).values({
        openId,
        username: input.username,
        passwordHash,
        passwordPlain: input.password,
        name: input.name,
        email: input.email || null,
        mobile: input.mobile || null,
        role: input.role,
        status: "active",
        loginMethod: "local",
        createdBy: ctx.user.id,
      });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create_user", entity: "user", entityId: 0, details: `Created ${input.role} user: ${input.username}` });
      return { success: true };
    }),
    updateRole: adminProcedure.input(z.object({ userId: z.number(), role: z.enum(["admin", "subadmin", "purchaser", "staff", "sales_rep"]) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update_role", entity: "user", entityId: input.userId, details: `Changed role to ${input.role}` });
      return { success: true };
    }),
    deactivate: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(users).set({ status: "inactive" }).where(eq(users.id, input.userId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "deactivate_user", entity: "user", entityId: input.userId, details: "Deactivated user" });
      return { success: true };
    }),
    activate: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(users).set({ status: "active" }).where(eq(users.id, input.userId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "activate_user", entity: "user", entityId: input.userId, details: "Activated user" });
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (input.userId === ctx.user.id) throw new Error("Cannot delete your own account");
      await db.delete(users).where(eq(users.id, input.userId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete_user", entity: "user", entityId: input.userId, details: "Deleted user" });
      return { success: true };
    }),
    resetPassword: adminProcedure.input(z.object({ userId: z.number(), newPassword: z.string().min(6) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { hashPassword } = await import("./localAuth");
      const passwordHash = await hashPassword(input.newPassword);
      await db.update(users).set({ passwordHash, passwordPlain: input.newPassword }).where(eq(users.id, input.userId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "reset_password", entity: "user", entityId: input.userId, details: "Reset user password" });
      return { success: true };
    }),
    // Admin: send password reset email to user
    sendResetEmail: adminProcedure.input(z.object({ userId: z.number(), origin: z.string() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [targetUser] = await db.select().from(users).where(eq(users.id, input.userId));
      if (!targetUser) throw new Error("User not found");
      if (!targetUser.email) throw new Error("User does not have an email address");
      const { nanoid } = await import("nanoid");
      const resetToken = nanoid(40);
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await db.update(users).set({ resetToken, resetTokenExpiry }).where(eq(users.id, input.userId));
      const resetLink = `${input.origin}/reset-password?token=${resetToken}`;
      const { sendPasswordResetEmail } = await import("./email");
      const sent = await sendPasswordResetEmail(targetUser.email, resetLink, targetUser.name || targetUser.username || "User");
      if (!sent) throw new Error("Failed to send email. Check SMTP configuration.");
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "send_reset_email", entity: "user", entityId: input.userId, details: `Sent password reset email to ${targetUser.email}` });
      return { success: true };
    }),
    // Admin: reset 2FA for a user (clears TOTP secret, user must set up again)
    reset2FA: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [targetUser] = await db.select().from(users).where(eq(users.id, input.userId));
      if (!targetUser) throw new Error("User not found");
      await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, input.userId));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "reset_2fa", entity: "user", entityId: input.userId, details: `Reset 2FA for user ${targetUser.username || targetUser.name}` });
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const updateData: Record<string, any> = {};
      if (input.username) {
        const existing = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
        if (existing.length > 0 && existing[0].id !== input.userId) throw new Error("Username already taken");
        updateData.username = input.username;
      }
      if (input.email !== undefined) updateData.email = input.email;
      if (input.mobile !== undefined) updateData.mobile = input.mobile;
      if (input.name !== undefined) updateData.name = input.name;
      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, input.userId));
        await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update_user_details", entity: "user", entityId: input.userId, details: `Updated: ${Object.keys(updateData).join(", ")}` });
      }
      return { success: true };
    }),
    // Self-service: change own username
    changeUsername: protectedProcedure.input(z.object({ newUsername: z.string().min(3) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const existing = await db.select().from(users).where(eq(users.username, input.newUsername)).limit(1);
      if (existing.length > 0 && existing[0].id !== ctx.user.id) throw new Error("Username already taken");
      await db.update(users).set({ username: input.newUsername }).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
    // Self-service: change own password
    changePassword: protectedProcedure.input(z.object({ currentPassword: z.string(), newPassword: z.string().min(6) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const bcrypt = await import("bcryptjs");
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user || !user.passwordHash) throw new Error("Cannot change password for OAuth accounts");
      const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!isValid) throw new Error("Current password is incorrect");
      const { hashPassword } = await import("./localAuth");
      const passwordHash = await hashPassword(input.newPassword);
      await db.update(users).set({ passwordHash, passwordPlain: input.newPassword }).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
    // Self-service: update own profile
    updateProfile: protectedProcedure.input(z.object({ name: z.string().optional(), email: z.string().email().optional(), mobile: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const updateData: Record<string, any> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.mobile !== undefined) updateData.mobile = input.mobile;
      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, ctx.user.id));
      }
      return { success: true };
    }),
    auditLogs: protectedProcedure.input(z.object({ limit: z.number().optional() })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        userName: users.name,
      }).from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit || 50);
      return result;
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
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.search) conditions.push(or(
        like(projects.name, `%${input.search}%`),
        like(projects.customerName, `%${input.search}%`),
        like(projects.address, `%${input.search}%`),
        like(projects.sizeOfSetup, `%${input.search}%`),
        like(projects.typeOfSetup, `%${input.search}%`),
        like(projects.description, `%${input.search}%`),
        like(projects.notes, `%${input.search}%`),
        sql`DATE_FORMAT(${projects.createdAt}, '%Y-%m-%d') LIKE ${`%${input.search}%`}`,
        sql`DATE_FORMAT(${projects.createdAt}, '%m/%Y') LIKE ${`%${input.search}%`}`,
        sql`DATE_FORMAT(${projects.createdAt}, '%Y') LIKE ${`%${input.search}%`}`
      ));
      if (input.stage) conditions.push(eq(projects.stage, input.stage as any));
      if (input.typeOfSetup) conditions.push(eq(projects.typeOfSetup, input.typeOfSetup));
      if (input.sizeOfSetup) conditions.push(like(projects.sizeOfSetup, `%${input.sizeOfSetup}%`));
      if (input.startDateFrom) conditions.push(gte(projects.startDate, new Date(input.startDateFrom)));
      if (input.startDateTo) conditions.push(lte(projects.startDate, new Date(input.startDateTo)));
      if (input.createdDateFrom) conditions.push(gte(projects.createdAt, new Date(input.createdDateFrom)));
      if (input.createdDateTo) conditions.push(lte(projects.createdAt, new Date(input.createdDateTo)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db.select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(200);
      // Compute payment status for each project
      const projectIds = rows.map(r => r.id);
      let paymentsMap: Record<number, number> = {};
      if (projectIds.length > 0) {
        const payments = await db.select({ projectId: projectPayments.projectId, total: sql<string>`COALESCE(SUM(${projectPayments.amount}), 0)` }).from(projectPayments).where(inArray(projectPayments.projectId, projectIds)).groupBy(projectPayments.projectId);
        for (const p of payments) paymentsMap[p.projectId] = parseFloat(p.total || "0");
      }
      return rows.map(r => {
        const totalAmount = parseFloat(r.totalProjectAmount || "0");
        const totalPaid = paymentsMap[r.id] || 0;
        let paymentStatus = "unpaid";
        if (totalAmount > 0 && totalPaid >= totalAmount) paymentStatus = "fully_paid";
        else if (totalPaid > 0) paymentStatus = "partially_paid";
        return { ...r, paymentStatus };
      });
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(projects).where(eq(projects.id, input.id)).limit(1);
      return result[0] || null;
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const insertData: any = {
        ...input,
        stage: (input.stage || "procurement") as any,
        startDate: input.startDate ? new Date(input.startDate) : null,
        targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : null,
        createdBy: ctx.user.id,
      };
      const [result] = await db.insert(projects).values(insertData).$returningId();
      // Record initial status
      await db.insert(projectStatusHistory).values({
        projectId: result.id,
        toStage: input.stage || "procurement",
        notes: "Project created",
        changedBy: ctx.user.id,
        changedByName: ctx.user.name || "Unknown",
      });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "project", entityId: result.id, details: `Created project: ${input.name}` });
      return { success: true, id: result.id };
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      const updateData: any = {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetCompletionDate: data.targetCompletionDate ? new Date(data.targetCompletionDate) : null,
      };
      await db.update(projects).set(updateData).where(eq(projects.id, id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "project", entityId: id, details: `Updated project: ${input.name}` });
      return { success: true };
    }),
    updateStage: protectedProcedure.input(z.object({
      id: z.number(),
      stage: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Get current stage
      const [current] = await db.select({ stage: projects.stage }).from(projects).where(eq(projects.id, input.id));
      const fromStage = current?.stage || null;
      // Update project stage
      const updateData: any = { stage: input.stage as any };
      if (input.stage === "completed") updateData.completedDate = new Date();
      await db.update(projects).set(updateData).where(eq(projects.id, input.id));
      // Record status change
      await db.insert(projectStatusHistory).values({
        projectId: input.id,
        fromStage,
        toStage: input.stage,
        notes: input.notes || null,
        changedBy: ctx.user.id,
        changedByName: ctx.user.name || "Unknown",
      });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update_stage", entity: "project", entityId: input.id, details: `Stage: ${fromStage} → ${input.stage}` });
      return { success: true };
    }),
    getHistory: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(projectStatusHistory).where(eq(projectStatusHistory.projectId, input.projectId)).orderBy(desc(projectStatusHistory.createdAt));
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(projectStatusHistory).where(eq(projectStatusHistory.projectId, input.id));
      await db.delete(projects).where(eq(projects.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "project", entityId: input.id, details: `Deleted project #${input.id}` });
      return { success: true };
    }),
    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, procurement: 0, implementation: 0, ongoing: 0, completed: 0 };
      const [total] = await db.select({ c: count() }).from(projects);
      const [procurement] = await db.select({ c: count() }).from(projects).where(eq(projects.stage, "procurement"));
      const [implementation] = await db.select({ c: count() }).from(projects).where(eq(projects.stage, "implementation"));
      const [ongoing] = await db.select({ c: count() }).from(projects).where(eq(projects.stage, "ongoing"));
      const [completed] = await db.select({ c: count() }).from(projects).where(eq(projects.stage, "completed"));
      return { total: total.c, procurement: procurement.c, implementation: implementation.c, ongoing: ongoing.c, completed: completed.c };
    }),
    // --- Project Payments ---
    getPayments: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const payments = await db.select().from(projectPayments).where(eq(projectPayments.projectId, input.projectId)).orderBy(desc(projectPayments.paymentDate));
      // Attach lastAckId for re-print capability
      const paymentIds = payments.map(p => p.id);
      if (paymentIds.length === 0) return payments;
      const acks = await db.select().from(acknowledgementReceipts).where(and(eq(acknowledgementReceipts.type, "project_payment"), inArray(acknowledgementReceipts.referenceId, paymentIds)));
      const ackMap = new Map<number, number>();
      acks.forEach(a => { if (!ackMap.has(a.referenceId) || a.id > ackMap.get(a.referenceId)!) ackMap.set(a.referenceId, a.id); });
      return payments.map(p => ({ ...p, lastAckId: ackMap.get(p.id) || null }));
    }),
    addPayment: protectedProcedure.input(z.object({
      projectId: z.number(),
      paymentDate: z.string(),
      amount: z.string(),
      paymentMethod: z.string().optional(),
      paymentReference: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(projectPayments).values({
        projectId: input.projectId,
        paymentDate: new Date(input.paymentDate),
        amount: input.amount,
        paymentMethod: input.paymentMethod || null,
        paymentReference: input.paymentReference || null,
        notes: input.notes || null,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || "Unknown",
      });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "project_payment", entityId: input.projectId, details: `Payment of ${input.amount} for project #${input.projectId}` });
      return { success: true };
    }),
    deletePayment: protectedProcedure.input(z.object({ id: z.number(), projectId: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(projectPayments).where(eq(projectPayments.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "project_payment", entityId: input.id, details: `Deleted payment for project #${input.projectId}` });
      return { success: true };
    }),
    paymentSummary: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalPaid: 0, totalProjectAmount: 0, balance: 0, status: "unpaid" as const };
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      const totalProjectAmount = Number(project?.totalProjectAmount || 0);
      const [paidResult] = await db.select({ total: sum(projectPayments.amount) }).from(projectPayments).where(eq(projectPayments.projectId, input.projectId));
      const totalPaid = Number(paidResult?.total || 0);
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
      const db = await getDb();
      if (!db) return [];
      // Get all projects with their payment totals
      const allProjects = await db.select().from(projects).orderBy(desc(projects.createdAt));
      const results = [];
      for (const project of allProjects) {
        // Search filter
        if (input.search) {
          const s = input.search.toLowerCase();
          if (!project.name.toLowerCase().includes(s) && !(project.customerName || "").toLowerCase().includes(s) && !(project.address || "").toLowerCase().includes(s) && !(project.typeOfSetup || "").toLowerCase().includes(s) && !(project.sizeOfSetup || "").toLowerCase().includes(s)) continue;
        }
        const [paidResult] = await db.select({ total: sum(projectPayments.amount) }).from(projectPayments).where(eq(projectPayments.projectId, project.id));
        const totalPaid = Number(paidResult?.total || 0);
        const totalProjectAmount = Number(project.totalProjectAmount || 0);
        const balance = totalProjectAmount - totalPaid;
        let status: "unpaid" | "partially_paid" | "fully_paid" = "unpaid";
        if (totalPaid >= totalProjectAmount && totalProjectAmount > 0) status = "fully_paid";
        else if (totalPaid > 0) status = "partially_paid";
        // Status filter
        if (input.paymentStatus !== "all" && status !== input.paymentStatus) continue;
        // Get last payment date
        const [lastPayment] = await db.select({ date: projectPayments.paymentDate }).from(projectPayments).where(eq(projectPayments.projectId, project.id)).orderBy(desc(projectPayments.paymentDate)).limit(1);
        // Date filter on last payment
        if (input.dateFrom && lastPayment?.date && new Date(lastPayment.date) < new Date(input.dateFrom)) continue;
        if (input.dateTo && lastPayment?.date && new Date(lastPayment.date) > new Date(input.dateTo)) continue;
        results.push({
          projectId: project.id,
          projectName: project.name,
          customerName: project.customerName || "-",
          totalProjectAmount,
          totalPaid,
          balance,
          status,
          lastPaymentDate: lastPayment?.date || null,
          stage: project.stage,
        });
      }
      return results;
    }),
    paymentAnalytics: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totalReceivables: 0, unpaidCount: 0, partiallyPaidCount: 0, fullyPaidCount: 0, monthlyPayments: [] as { month: string; amount: number }[] };
      const allProjects = await db.select().from(projects);
      let totalReceivables = 0;
      let unpaidCount = 0;
      let partiallyPaidCount = 0;
      let fullyPaidCount = 0;
      for (const project of allProjects) {
        const [paidResult] = await db.select({ total: sum(projectPayments.amount) }).from(projectPayments).where(eq(projectPayments.projectId, project.id));
        const totalPaid = Number(paidResult?.total || 0);
        const totalProjectAmount = Number(project.totalProjectAmount || 0);
        const balance = totalProjectAmount - totalPaid;
        if (totalPaid >= totalProjectAmount && totalProjectAmount > 0) fullyPaidCount++;
        else if (totalPaid > 0) { partiallyPaidCount++; totalReceivables += balance; }
        else { unpaidCount++; totalReceivables += totalProjectAmount; }
      }
      // Monthly payments (last 12 months)
      const allPayments = await db.select().from(projectPayments).orderBy(desc(projectPayments.paymentDate));
      const monthlyMap: Record<string, number> = {};
      for (const p of allPayments) {
        const d = new Date(p.paymentDate);
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
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.search) conditions.push(or(
        like(netMetering.clientName, `%${input.search}%`),
        like(netMetering.address, `%${input.search}%`),
        like(netMetering.projectName, `%${input.search}%`),
        like(netMetering.electricCompany, `%${input.search}%`),
        like(netMetering.applicationNumber, `%${input.search}%`),
        like(netMetering.sizeOfSetup, `%${input.search}%`),
        like(netMetering.typeOfSetup, `%${input.search}%`),
        like(netMetering.notes, `%${input.search}%`),
        sql`DATE_FORMAT(${netMetering.createdAt}, '%Y-%m-%d') LIKE ${`%${input.search}%`}`,
        sql`DATE_FORMAT(${netMetering.createdAt}, '%m/%Y') LIKE ${`%${input.search}%`}`,
        sql`DATE_FORMAT(${netMetering.createdAt}, '%Y') LIKE ${`%${input.search}%`}`
      ));
      if (input.status) conditions.push(eq(netMetering.status, input.status as any));
      if (input.typeOfSetup) conditions.push(eq(netMetering.typeOfSetup, input.typeOfSetup));
      if (input.sizeOfSetup) conditions.push(like(netMetering.sizeOfSetup, `%${input.sizeOfSetup}%`));
      if (input.electricCompany) conditions.push(like(netMetering.electricCompany, `%${input.electricCompany}%`));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(netMetering).where(where).orderBy(desc(netMetering.createdAt)).limit(200);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(netMetering).where(eq(netMetering.id, input.id)).limit(1);
      return result[0] || null;
    }),
    getByProjectId: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(netMetering).where(eq(netMetering.projectId, input.projectId)).limit(1);
      return result[0] || null;
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const insertData: any = {
        ...input,
        status: (input.status || "plan_drawings") as any,
        submittedDate: input.submittedDate ? new Date(input.submittedDate) : null,
        createdBy: ctx.user.id,
      };
      const [result] = await db.insert(netMetering).values(insertData).$returningId();
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "net_metering", entityId: result.id, details: `Created net metering for: ${input.clientName}` });
      return { id: result.id };
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      const updateData: any = {
        ...data,
        status: data.status as any,
        submittedDate: data.submittedDate ? new Date(data.submittedDate) : null,
        approvedDate: data.approvedDate ? new Date(data.approvedDate) : null,
        completedDate: data.completedDate ? new Date(data.completedDate) : null,
      };
      await db.update(netMetering).set(updateData).where(eq(netMetering.id, id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "net_metering", entityId: id, details: `Updated net metering for: ${input.clientName}` });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(netMetering).where(eq(netMetering.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "net_metering", entityId: input.id, details: "Deleted net metering record" });
      return { success: true };
    }),
    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, planDrawings: 0, submitted: 0, approved: 0, completed: 0 };
      const [total] = await db.select({ c: count() }).from(netMetering);
      const [planDrawings] = await db.select({ c: count() }).from(netMetering).where(eq(netMetering.status, "plan_drawings"));
      const [submitted] = await db.select({ c: count() }).from(netMetering).where(or(
        eq(netMetering.status, "submitted_lgu"),
        eq(netMetering.status, "submitted_fire"),
        eq(netMetering.status, "submitted_electric")
      ));
      const [approved] = await db.select({ c: count() }).from(netMetering).where(eq(netMetering.status, "approved"));
      const [completed] = await db.select({ c: count() }).from(netMetering).where(eq(netMetering.status, "completed_energized"));
      return { total: total.c, planDrawings: planDrawings.c, submitted: submitted.c, approved: approved.c, completed: completed.c };
    }),
  }),

  // ============ STOCK ADJUSTMENTS (Admin-only approval) ============
  stockAdjustments: router({
    list: protectedProcedure.input(z.object({ status: z.string().optional() })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(stockAdjustments.status, input.status as any));
      // Sub-admins only see their own requests
      if (ctx.user.role !== 'admin') conditions.push(eq(stockAdjustments.requestedBy, ctx.user.id));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const result = await db.select({
        id: stockAdjustments.id, itemId: stockAdjustments.itemId,
        previousQuantity: stockAdjustments.previousQuantity, newQuantity: stockAdjustments.newQuantity,
        adjustmentQuantity: stockAdjustments.adjustmentQuantity, reason: stockAdjustments.reason,
        status: stockAdjustments.status, requestedBy: stockAdjustments.requestedBy,
        requestedByName: stockAdjustments.requestedByName,
        approvedBy: stockAdjustments.approvedBy, approvedByName: stockAdjustments.approvedByName,
        approvedAt: stockAdjustments.approvedAt, notes: stockAdjustments.notes,
        createdAt: stockAdjustments.createdAt, itemName: inventoryItems.name, itemSku: inventoryItems.sku,
      }).from(stockAdjustments)
        .leftJoin(inventoryItems, eq(stockAdjustments.itemId, inventoryItems.id))
        .where(where).orderBy(desc(stockAdjustments.createdAt)).limit(200);
      return result;
    }),
    // Sub-admin can request an adjustment
    request: protectedProcedure.input(z.object({
      itemId: z.number(), newQuantity: z.number().min(0), reason: z.string().min(1), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [item] = await db.select({ stockOnHand: inventoryItems.stockOnHand }).from(inventoryItems).where(eq(inventoryItems.id, input.itemId));
      const prevQty = item?.stockOnHand ?? 0;
      await db.insert(stockAdjustments).values({
        itemId: input.itemId, previousQuantity: prevQty, newQuantity: input.newQuantity,
        adjustmentQuantity: input.newQuantity - prevQty, reason: input.reason,
        status: ctx.user.role === 'admin' ? 'approved' : 'pending',
        requestedBy: ctx.user.id, requestedByName: ctx.user.name || 'Unknown',
        ...(ctx.user.role === 'admin' ? { approvedBy: ctx.user.id, approvedByName: ctx.user.name || 'Admin', approvedAt: new Date() } : {}),
        notes: input.notes || null,
      });
      // If admin, apply immediately
      if (ctx.user.role === 'admin') {
        await db.update(inventoryItems).set({ stockOnHand: input.newQuantity }).where(eq(inventoryItems.id, input.itemId));
        const [itemInfo] = await db.select({ name: inventoryItems.name, sku: inventoryItems.sku }).from(inventoryItems).where(eq(inventoryItems.id, input.itemId));
        await db.insert(inventoryAuditLog).values({
          itemId: input.itemId, itemName: itemInfo?.name || null, itemSku: itemInfo?.sku || null,
          transactionType: 'adjustment', quantity: input.newQuantity - prevQty,
          previousStock: prevQty, newStock: input.newQuantity,
          reference: `Stock Adjustment`, purpose: input.reason, notes: input.notes || null,
          performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
        });
      }
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "stock_adjustment", details: `${ctx.user.role === 'admin' ? 'Applied' : 'Requested'} adjustment for item #${input.itemId}: ${prevQty} → ${input.newQuantity} (${input.reason})` });
      return { success: true };
    }),
    // Admin approve
    approve: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [adj] = await db.select().from(stockAdjustments).where(eq(stockAdjustments.id, input.id));
      if (!adj || adj.status !== 'pending') throw new Error("Adjustment not found or already processed");
      await db.update(stockAdjustments).set({ status: 'approved', approvedBy: ctx.user.id, approvedByName: ctx.user.name || 'Admin', approvedAt: new Date() }).where(eq(stockAdjustments.id, input.id));
      // Apply the adjustment
      await db.update(inventoryItems).set({ stockOnHand: adj.newQuantity }).where(eq(inventoryItems.id, adj.itemId));
      const [itemInfo] = await db.select({ name: inventoryItems.name, sku: inventoryItems.sku }).from(inventoryItems).where(eq(inventoryItems.id, adj.itemId));
      await db.insert(inventoryAuditLog).values({
        itemId: adj.itemId, itemName: itemInfo?.name || null, itemSku: itemInfo?.sku || null,
        transactionType: 'adjustment', quantity: adj.adjustmentQuantity,
        previousStock: adj.previousQuantity, newStock: adj.newQuantity,
        reference: `Stock Adjustment #${adj.id} (approved)`, purpose: adj.reason || 'Adjustment', notes: adj.notes || null,
        performedBy: ctx.user.id, performedByName: ctx.user.name || 'Admin',
      });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "approve", entity: "stock_adjustment", entityId: input.id, details: `Approved adjustment #${input.id}: ${adj.previousQuantity} → ${adj.newQuantity}` });
      return { success: true };
    }),
    // Admin reject
    reject: adminProcedure.input(z.object({ id: z.number(), notes: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [adj] = await db.select().from(stockAdjustments).where(eq(stockAdjustments.id, input.id));
      if (!adj || adj.status !== 'pending') throw new Error("Adjustment not found or already processed");
      await db.update(stockAdjustments).set({ status: 'rejected', approvedBy: ctx.user.id, approvedByName: ctx.user.name || 'Admin', approvedAt: new Date(), notes: input.notes || adj.notes }).where(eq(stockAdjustments.id, input.id));
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "reject", entity: "stock_adjustment", entityId: input.id, details: `Rejected adjustment #${input.id}` });
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
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.search) conditions.push(or(like(inventoryAuditLog.itemName, `%${input.search}%`), like(inventoryAuditLog.itemSku, `%${input.search}%`), like(inventoryAuditLog.performedByName, `%${input.search}%`), like(inventoryAuditLog.reference, `%${input.search}%`), like(inventoryAuditLog.purpose, `%${input.search}%`)));
      if (input.transactionType) conditions.push(eq(inventoryAuditLog.transactionType, input.transactionType as any));
      if (input.itemId) conditions.push(eq(inventoryAuditLog.itemId, input.itemId));
      if (input.fromDate) conditions.push(gte(inventoryAuditLog.createdAt, new Date(input.fromDate)));
      if (input.toDate) conditions.push(lte(inventoryAuditLog.createdAt, new Date(input.toDate)));
      // Admin and Sub-Admin can see all audit logs; lower roles see only their own
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'subadmin') {
        conditions.push(eq(inventoryAuditLog.performedBy, ctx.user.id));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select().from(inventoryAuditLog).where(where).orderBy(desc(inventoryAuditLog.createdAt)).limit(input.limit || 500);
    }),
  }),

  // ============ SPECIAL QUOTATION TEMPLATES ============
  specialQuotationTemplates: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(specialQuotationTemplates).where(eq(specialQuotationTemplates.isActive, 1)).orderBy(desc(specialQuotationTemplates.updatedAt));
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [t] = await db.select().from(specialQuotationTemplates).where(eq(specialQuotationTemplates.id, input.id)).limit(1);
      return t || null;
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [inserted] = await db.insert(specialQuotationTemplates).values({
        ...input,
        subtotal: input.subtotal || null,
        vatRate: input.vatRate || null,
        discount: input.discount || null,
        createdBy: ctx.user.id,
      }).$returningId();
      return { success: true, id: inserted.id };
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db.update(specialQuotationTemplates).set(data).where(eq(specialQuotationTemplates.id, id));
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(specialQuotationTemplates).set({ isActive: 0 }).where(eq(specialQuotationTemplates.id, input.id));
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
      const db = await getDb();
      if (!db) return { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      const page = input.page || 1;
      const limit = input.limit || 20;
      const offset = (page - 1) * limit;
      const conditions: any[] = [];
      if (input.search) {
        conditions.push(or(
          like(specialQuotations.customerName, `%${input.search}%`),
          like(specialQuotations.quotationNumber, `%${input.search}%`),
          like(specialQuotations.systemTitle, `%${input.search}%`),
          like(specialQuotations.customerAddress, `%${input.search}%`),
          like(specialQuotations.kwRating, `%${input.search}%`),
          like(specialQuotations.setupType, `%${input.search}%`),
          like(specialQuotations.preparedBy, `%${input.search}%`),
          sql`DATE_FORMAT(${specialQuotations.createdAt}, '%Y-%m-%d') LIKE ${`%${input.search}%`}`,
          sql`DATE_FORMAT(${specialQuotations.createdAt}, '%m/%Y') LIKE ${`%${input.search}%`}`,
          sql`DATE_FORMAT(${specialQuotations.createdAt}, '%Y') LIKE ${`%${input.search}%`}`
        ));
      }
      if (input.status) conditions.push(eq(specialQuotations.status, input.status as any));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [totalResult] = await db.select({ c: count() }).from(specialQuotations).where(where);
      const items = await db.select().from(specialQuotations).where(where).orderBy(desc(specialQuotations.createdAt)).limit(limit).offset(offset);
      return { items, total: totalResult.c, page, limit, totalPages: Math.ceil(totalResult.c / limit) };
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [q] = await db.select().from(specialQuotations).where(eq(specialQuotations.id, input.id)).limit(1);
      return q || null;
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const quotationNumber = `SQ-${Date.now().toString(36).toUpperCase()}`;
      const [inserted] = await db.insert(specialQuotations).values({
        ...input,
        quotationNumber,
        date: input.date ? new Date(input.date) : new Date(),
        subtotal: input.subtotal || null,
        vatRate: input.vatRate || null,
        vatAmount: input.vatAmount || null,
        discount: input.discount || null,
        total: input.total || null,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || "Admin",
      }).$returningId();
      return { success: true, id: inserted.id, quotationNumber };
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
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, date, ...data } = input;
      const updateData: any = { ...data };
      if (date) updateData.date = new Date(date);
      await db.update(specialQuotations).set(updateData).where(eq(specialQuotations.id, id));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(specialQuotations).where(eq(specialQuotations.id, input.id));
      return { success: true };
    }),
  }),
});
export type AppRouter = typeof appRouter;
