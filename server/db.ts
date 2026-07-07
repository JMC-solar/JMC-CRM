import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { ENV } from "./_core/env";
import { getUserByOpenId as fsGetUserByOpenId, createUser, updateUser } from "./firestore-users";
import type { User } from "./models";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;
let _lastActivity = 0;
const IDLE_THRESHOLD = 30_000; // 30 seconds

function createPool() {
  return mysql.createPool({
    uri: process.env.DATABASE_URL!,
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 0,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

// Lazily create the drizzle instance with proper pool settings for serverless.
// NOTE: still used by unmigrated routers (non-user domains). Do not remove
// until every router has moved to Firestore.
export async function getDb() {
  const now = Date.now();
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createPool();
      _db = drizzle({ client: _pool });
      _lastActivity = now;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  // Only validate if pool has been idle for more than threshold (serverless wake-up scenario)
  if (_pool && (now - _lastActivity) > IDLE_THRESHOLD) {
    try {
      await _pool.promise().query('SELECT 1');
    } catch (error) {
      console.warn("[Database] Stale connection detected, reconnecting...");
      try {
        _pool.end();
      } catch (_) {}
      _pool = createPool();
      _db = drizzle({ client: _pool });
    }
  }
  _lastActivity = now;
  return _db;
}

// ============================================================
// User helpers — migrated to Firestore (server/firestore-users.ts).
// Re-exported here so existing callers (server/_core/sdk.ts, etc.) don't
// need to change their import path.
// ============================================================

export async function upsertUser(user: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date;
  role?: User["role"];
}): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  try {
    const existing = await fsGetUserByOpenId(user.openId);

    const patch: Record<string, unknown> = {};
    (["name", "email", "loginMethod"] as const).forEach(field => {
      const value = user[field];
      if (value !== undefined) {
        patch[field] = value ?? null;
      }
    });

    if (user.lastSignedIn !== undefined) {
      patch.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      patch.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      patch.role = "admin";
    }

    if (existing) {
      if (Object.keys(patch).length === 0) {
        patch.lastSignedIn = new Date();
      }
      await updateUser(existing.id, patch);
    } else {
      if (!patch.lastSignedIn) {
        patch.lastSignedIn = new Date();
      }
      await createUser({ openId: user.openId, ...patch });
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  return fsGetUserByOpenId(openId);
}

// TODO: add feature queries here as your schema grows.
