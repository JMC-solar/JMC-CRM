import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore,
  type WhereFilterOp,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// ============================================================
// Lazy singleton init — module load must never throw even if
// FIREBASE_SERVICE_ACCOUNT / FIREBASE_STORAGE_BUCKET are absent.
// The error only surfaces the first time a caller actually needs
// Firestore/Storage (fdb()/bucket()/audit()/etc).
// ============================================================

let _initialized = false;

function ensureInitialized() {
  if (_initialized) return;
  if (getApps().length > 0) {
    _initialized = true;
    return;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT environment variable is required (full service account JSON string)"
    );
  }

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }

  // Escaped \n sequences are common when the key is passed via a single-line
  // env var; normalize them back to real newlines for the PEM key.
  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  _initialized = true;
}

let _fdb: Firestore | null = null;

/** Firestore database handle. Lazily initializes the Firebase Admin app on first access. */
export function fdb(): Firestore {
  ensureInitialized();
  if (!_fdb) {
    _fdb = getFirestore();
  }
  return _fdb;
}

/** Default Storage bucket handle. Lazily initializes on first access. */
export function bucket() {
  ensureInitialized();
  if (!process.env.FIREBASE_STORAGE_BUCKET) {
    throw new Error("FIREBASE_STORAGE_BUCKET environment variable is required");
  }
  return getStorage().bucket();
}

export { FieldValue, Timestamp };

// ============================================================
// Conversion helpers
// ============================================================

/** Recursively converts Firestore Timestamps to JS Dates, and injects a numeric `id`. */
export function docToData<T>(
  snap: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot
): T {
  const data = snap.data() ?? {};
  const converted = convertTimestamps(data);
  return { ...converted, id: Number(snap.id) } as T;
}

function convertTimestamps(value: unknown): any {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (Array.isArray(value)) {
    return value.map(convertTimestamps);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = convertTimestamps(v);
    }
    return out;
  }
  return value;
}

// ============================================================
// Generic CRUD helpers
// ============================================================

export async function getById<T>(coll: string, id: number): Promise<T | undefined> {
  const snap = await fdb().collection(coll).doc(String(id)).get();
  if (!snap.exists) return undefined;
  return docToData<T>(snap);
}

/**
 * Like docToData, but for collections whose doc id is a custom string
 * (e.g. cash_requests' "cr-0701053") rather than the numeric id docToData
 * parses from snap.id. The id must already be present as a field in the
 * stored data (write it yourself when inserting).
 */
export function docToDataRaw<T>(
  snap: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot
): T {
  return convertTimestamps(snap.data() ?? {}) as T;
}

/** Like listAll, but for collections whose doc id is a custom string (see docToDataRaw). */
export async function listAllRaw<T>(
  coll: string,
  opts?: {
    where?: [string, WhereFilterOp, any][];
    select?: string[];
  }
): Promise<T[]> {
  let query: FirebaseFirestore.Query = fdb().collection(coll);
  for (const [field, op, value] of opts?.where ?? []) {
    query = query.where(field, op, value);
  }
  if (opts?.select && opts.select.length > 0) {
    query = query.select(...opts.select);
  }
  const snap = await query.get();
  return snap.docs.map(d => docToDataRaw<T>(d));
}

export async function listAll<T>(
  coll: string,
  opts?: {
    where?: [string, WhereFilterOp, any][];
    select?: string[];
  }
): Promise<T[]> {
  let query: FirebaseFirestore.Query = fdb().collection(coll);
  for (const [field, op, value] of opts?.where ?? []) {
    query = query.where(field, op, value);
  }
  if (opts?.select && opts.select.length > 0) {
    query = query.select(...opts.select);
  }
  const snap = await query.get();
  return snap.docs.map(d => docToData<T>(d));
}

/**
 * Allocates a contiguous block of `n` sequential numeric ids for `coll`,
 * transactionally, via a `counters/{coll}` doc `{ next }` (lazily initialized
 * at 1). Returns the first id of the allocated block.
 */
export async function allocateIds(coll: string, n = 1): Promise<number> {
  const counterRef = fdb().collection("counters").doc(coll);
  const firstId = await fdb().runTransaction(async tx => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data()?.next as number) ?? 1 : 1;
    tx.set(counterRef, { next: current + n }, { merge: true });
    return current;
  });
  return firstId;
}

function stripUndefined<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v === undefined ? null : v;
  }
  return out as T;
}

export async function insertOne<T extends Record<string, unknown>>(
  coll: string,
  data: T
): Promise<number> {
  const id = await allocateIds(coll, 1);
  const now = new Date();
  const payload = stripUndefined({
    ...data,
    id,
    createdAt: (data as any).createdAt ?? now,
    updatedAt: (data as any).updatedAt ?? now,
  });
  await fdb().collection(coll).doc(String(id)).set(payload);
  return id;
}

export async function updateOne(
  coll: string,
  id: number,
  patch: Record<string, unknown>
): Promise<void> {
  const payload = stripUndefined({
    ...patch,
    updatedAt: new Date(),
  });
  await fdb().collection(coll).doc(String(id)).set(payload, { merge: true });
}

export async function deleteOne(coll: string, id: number): Promise<void> {
  await fdb().collection(coll).doc(String(id)).delete();
}

export async function insertMany<T extends Record<string, unknown>>(
  coll: string,
  rows: T[]
): Promise<number[]> {
  if (rows.length === 0) return [];
  const firstId = await allocateIds(coll, rows.length);
  const now = new Date();
  const ids: number[] = [];
  const batch = fdb().batch();
  rows.forEach((row, i) => {
    const id = firstId + i;
    ids.push(id);
    const payload = stripUndefined({
      ...row,
      id,
      createdAt: (row as any).createdAt ?? now,
      updatedAt: (row as any).updatedAt ?? now,
    });
    batch.set(fdb().collection(coll).doc(String(id)), payload);
  });
  await batch.commit();
  return ids;
}

// ============================================================
// Paginated list (replaces SQL LIKE-based search + LIMIT/OFFSET)
// ============================================================

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export async function listPaginated<T extends Record<string, unknown>>(
  coll: string,
  opts?: {
    search?: string;
    searchFields?: string[];
    filters?: [string, WhereFilterOp, any][];
    page?: number;
    limit?: number;
    orderBy?: string;
    dir?: "asc" | "desc";
  }
): Promise<PaginatedResult<T>> {
  const page = opts?.page && opts.page > 0 ? opts.page : 1;
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : 20;
  const orderBy = opts?.orderBy ?? "createdAt";
  const dir = opts?.dir ?? "desc";

  let query: FirebaseFirestore.Query = fdb().collection(coll);
  for (const [field, op, value] of opts?.filters ?? []) {
    query = query.where(field, op, value);
  }

  const snap = await query.get();
  let items = snap.docs.map(d => docToData<T>(d));

  const search = opts?.search?.trim().toLowerCase();
  if (search && opts?.searchFields && opts.searchFields.length > 0) {
    items = items.filter(item =>
      opts.searchFields!.some(field => {
        const value = (item as any)[field];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(search);
      })
    );
  }

  items.sort((a, b) => {
    const av = (a as any)[orderBy];
    const bv = (b as any)[orderBy];
    let cmp = 0;
    if (av instanceof Date && bv instanceof Date) {
      cmp = av.getTime() - bv.getTime();
    } else if (av === bv) {
      cmp = 0;
    } else if (av === null || av === undefined) {
      cmp = -1;
    } else if (bv === null || bv === undefined) {
      cmp = 1;
    } else {
      cmp = av > bv ? 1 : -1;
    }
    return dir === "desc" ? -cmp : cmp;
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pageItems = items.slice(start, start + limit);

  return { items: pageItems, total, page, limit, totalPages };
}

// ============================================================
// Audit log
// ============================================================

export async function audit(
  userId: number | null | undefined,
  userName: string | null | undefined,
  action: string,
  entityType: string,
  entityId?: number | string | null,
  details?: string | null
): Promise<void> {
  await insertOne("audit_logs", {
    userId: userId ?? null,
    userName: userName ?? null,
    action,
    entity: entityType,
    entityId: entityId ?? null,
    details: details ?? null,
  });
}
