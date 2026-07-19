import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CATALOG, CATALOG_BY_NAME, COLLECTION_NAMES } from "../catalog";
import { queryCollection, getDocument, countCollection, type WhereClause } from "../db";
import { redact, redactAll, toolResult, toolError } from "../format";

const WHERE_OP = z.enum([
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "array-contains",
  "array-contains-any",
  "in",
  "not-in",
]);

const WHERE_SHAPE = z.object({
  field: z.string(),
  op: WHERE_OP,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

function toWhereClauses(where?: z.infer<typeof WHERE_SHAPE>[]): WhereClause[] | undefined {
  return where?.map(w => [w.field, w.op, w.value] as WhereClause);
}

function assertKnownCollection(collection: string): string | null {
  if (!CATALOG_BY_NAME.has(collection)) {
    return `Unknown collection "${collection}". Call list_collections for the valid set.`;
  }
  return null;
}

export function registerGenericTools(server: McpServer): void {
  server.registerTool(
    "list_collections",
    {
      title: "List collections",
      description:
        "Orientation tool — call this first. Lists every Firestore collection query_collection/get_document/count_records can read, with field metadata and a live document count.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const counts = await Promise.all(CATALOG.map(c => countCollection(c.name).catch(() => -1)));
      const collections = CATALOG.map((c, i) => ({
        name: c.name,
        label: c.label,
        description: c.description,
        idMode: c.idMode,
        keyFields: c.keyFields,
        moneyFields: c.moneyFields,
        documentCount: counts[i],
      }));
      return toolResult({ collections });
    }
  );

  server.registerTool(
    "query_collection",
    {
      title: "Query a collection",
      description:
        "Escape-hatch read over any cataloged collection. Filters via where[], optional orderBy, capped limit (default 25, max 200). Returns {count, truncated, items} — check `truncated` before assuming you've seen everything.",
      inputSchema: {
        collection: z.enum(COLLECTION_NAMES),
        where: z.array(WHERE_SHAPE).optional().describe("Firestore-style filters, ANDed together"),
        orderBy: z
          .object({ field: z.string(), direction: z.enum(["asc", "desc"]).optional() })
          .optional(),
        limit: z.number().int().positive().max(200).optional(),
        fields: z.array(z.string()).optional().describe("Projection — omit for full documents"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, where, orderBy, limit, fields }) => {
      const err = assertKnownCollection(collection);
      if (err) return toolError("UNKNOWN_COLLECTION", err);

      try {
        const result = await queryCollection<Record<string, unknown>>({
          collection,
          where: toWhereClauses(where),
          orderBy,
          limit,
          fields,
        });
        return toolResult({ ...result, items: redactAll(collection, result.items) });
      } catch (error) {
        return toolError("QUERY_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "get_document",
    {
      title: "Get a single document",
      description:
        "Fetch one document by id from a cataloged collection. Most collections use numeric ids; cash_requests uses string ids like \"cr-0701053\" — pass whatever list_collections/query_collection returned as that row's `id` verbatim.",
      inputSchema: {
        collection: z.enum(COLLECTION_NAMES),
        id: z.union([z.string(), z.number()]),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, id }) => {
      const err = assertKnownCollection(collection);
      if (err) return toolError("UNKNOWN_COLLECTION", err);

      try {
        const doc = await getDocument<Record<string, unknown>>(collection, String(id));
        if (!doc) return toolError("NOT_FOUND", `No document "${id}" in ${collection}`);
        return toolResult(redact(collection, doc));
      } catch (error) {
        return toolError("GET_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "count_records",
    {
      title: "Count records",
      description: "Aggregation count over a cataloged collection, optionally filtered by where[]. No document reads — cheap even on large collections.",
      inputSchema: {
        collection: z.enum(COLLECTION_NAMES),
        where: z.array(WHERE_SHAPE).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, where }) => {
      const err = assertKnownCollection(collection);
      if (err) return toolError("UNKNOWN_COLLECTION", err);

      try {
        const count = await countCollection(collection, toWhereClauses(where));
        return toolResult({ collection, count });
      } catch (error) {
        return toolError("COUNT_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
  );
}
