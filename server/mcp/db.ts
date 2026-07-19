import type { WhereFilterOp } from "firebase-admin/firestore";
import { fdb, docToData, docToDataRaw } from "../firestore";
import { CATALOG_BY_NAME } from "./catalog";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export type WhereClause = [string, WhereFilterOp, unknown];

export type QueryResult<T> = {
  count: number;
  truncated: boolean;
  items: T[];
  note?: string;
};

function clampLimit(limit?: number, maxLimit: number = MAX_LIMIT): number {
  if (!limit || limit <= 0) return Math.min(DEFAULT_LIMIT, maxLimit);
  return Math.min(limit, maxLimit);
}

function isRaw(collection: string): boolean {
  return CATALOG_BY_NAME.get(collection)?.idMode === "raw";
}

function toRow<T>(collection: string, snap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): T {
  return isRaw(collection) ? docToDataRaw<T>(snap) : docToData<T>(snap);
}

/**
 * Bounded, read-only Firestore query. Builds a real .where()/.orderBy()/.limit()
 * chain (unlike server/firestore.ts#listAll, which has no cap and fetches
 * whole collections) — every MCP read must be capped by construction.
 *
 * A composite index absent for where+orderBy throws FAILED_PRECONDITION
 * (grpc code 9). Rather than surface that as a broken tool, retry without
 * orderBy and sort the capped page in memory, flagging the response.
 */
export async function queryCollection<T>(opts: {
  collection: string;
  where?: WhereClause[];
  orderBy?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
  fields?: string[];
  /** Overrides the default 200-doc cap — used by bulk export, which needs a higher ceiling. */
  maxLimit?: number;
}): Promise<QueryResult<T>> {
  const limit = clampLimit(opts.limit, opts.maxLimit);

  const buildQuery = (includeOrderBy: boolean, fetchLimit: number): FirebaseFirestore.Query => {
    let query: FirebaseFirestore.Query = fdb().collection(opts.collection);
    for (const [field, op, value] of opts.where ?? []) {
      query = query.where(field, op, value);
    }
    if (includeOrderBy && opts.orderBy) {
      query = query.orderBy(opts.orderBy.field, opts.orderBy.direction ?? "asc");
    }
    if (opts.fields && opts.fields.length > 0) {
      query = query.select(...opts.fields);
    }
    return query.limit(fetchLimit);
  };

  let note: string | undefined;
  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    snap = await buildQuery(true, limit + 1).get();
  } catch (error) {
    const code = (error as { code?: number })?.code;
    const message = error instanceof Error ? error.message : String(error);
    const isMissingIndex = code === 9 || /requires an index/i.test(message);
    if (!isMissingIndex || !opts.orderBy) throw error;

    // No index for this where+orderBy — sorting only the first `limit+1` docs
    // (in whatever arbitrary order Firestore falls back to) would silently
    // return the wrong page. Fetch a much larger bounded window instead, sort
    // that in memory, then slice — same performance ceiling server/firestore.ts's
    // listAll/listPaginated already accept elsewhere in this app.
    const FALLBACK_SCAN_LIMIT = 5000;
    snap = await buildQuery(false, FALLBACK_SCAN_LIMIT).get();
    const field = opts.orderBy.field;
    const dir = opts.orderBy.direction === "desc" ? -1 : 1;
    const docs = [...snap.docs].sort((a, b) => {
      const av = a.get(field);
      const bv = b.get(field);
      if (av === bv) return 0;
      if (av === undefined || av === null) return -1 * dir;
      if (bv === undefined || bv === null) return 1 * dir;
      return av > bv ? dir : -dir;
    });
    note = "sorted in memory; composite index absent for this where+orderBy combination";
    return {
      count: Math.min(docs.length, limit),
      truncated: docs.length > limit,
      items: docs.slice(0, limit).map(d => toRow<T>(opts.collection, d)),
      note,
    };
  }

  const docs = snap.docs;
  return {
    count: Math.min(docs.length, limit),
    truncated: docs.length > limit,
    items: docs.slice(0, limit).map(d => toRow<T>(opts.collection, d)),
  };
}

export async function getDocument<T>(collection: string, id: string): Promise<T | undefined> {
  const snap = await fdb().collection(collection).doc(id).get();
  if (!snap.exists) return undefined;
  return toRow<T>(collection, snap);
}

export async function countCollection(collection: string, where?: WhereClause[]): Promise<number> {
  let query: FirebaseFirestore.Query = fdb().collection(collection);
  for (const [field, op, value] of where ?? []) {
    query = query.where(field, op, value);
  }
  const snap = await query.count().get();
  return snap.data().count;
}
