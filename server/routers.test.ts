import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
});
