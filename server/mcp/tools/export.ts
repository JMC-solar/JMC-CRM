import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CATALOG_BY_NAME, COLLECTION_NAMES } from "../catalog";
import { queryCollection, getDocument } from "../db";
import { redactAll, toNum, toolResult, toolError } from "../format";
import { generateExcel } from "../../exportRouter";
import { storagePut, storageGetSignedUrl } from "../../storage";

const EXPORT_MAX_LIMIT = 5000;

const WHERE_OP = z.enum(["==", "!=", "<", "<=", ">", ">=", "array-contains", "array-contains-any", "in", "not-in"]);
const WHERE_SHAPE = z.object({
  field: z.string(),
  op: WHERE_OP,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

/** Documents with an existing print-HTML/PDF route — no new rendering, just a link to what's already there. */
const DOCUMENT_TYPES = {
  quotation: { collection: "quotations", path: (id: string | number) => `/api/quotations/${id}/pdf` },
  purchase_order: { collection: "purchase_orders", path: (id: string | number) => `/api/purchase-orders/${id}/pdf` },
  retail_sale: { collection: "retail_sales", path: (id: string | number) => `/api/retail-sales/${id}/pdf` },
  delivery_receipt: { collection: "delivery_receipts", path: (id: string | number) => `/api/delivery-receipts/${id}/print` },
  acknowledgement_receipt: {
    collection: "acknowledgement_receipts",
    path: (id: string | number) => `/api/acknowledgement-receipts/${id}/print`,
  },
  special_quotation: { collection: "special_quotations", path: (id: string | number) => `/api/special-quotations/${id}/print` },
} as const;

function formatCell(collection: string, field: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  const meta = CATALOG_BY_NAME.get(collection);
  if (meta?.moneyFields.includes(field)) return toNum(value).toFixed(2);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function registerExportTools(server: McpServer, origin: string): void {
  server.registerTool(
    "export_collection",
    {
      title: "Export a collection to XLSX",
      description:
        "Bulk-exports a cataloged collection to an Excel file, uploaded to storage, returning a download URL. Higher cap than query_collection (up to 5000 rows) since this is meant for bulk pull, not inspection.",
      inputSchema: {
        collection: z.enum(COLLECTION_NAMES),
        where: z.array(WHERE_SHAPE).optional(),
        fields: z.array(z.string()).optional().describe("Columns to include — omit to use the collection's default key fields"),
        limit: z.number().int().positive().max(EXPORT_MAX_LIMIT).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ collection, where, fields, limit }) => {
      const meta = CATALOG_BY_NAME.get(collection);
      if (!meta) return toolError("UNKNOWN_COLLECTION", `Unknown collection "${collection}"`);

      try {
        const columns = fields && fields.length > 0 ? fields : meta.keyFields;
        const result = await queryCollection<Record<string, unknown>>({
          collection,
          where: where?.map(w => [w.field, w.op, w.value] as [string, typeof w.op, unknown]),
          fields: columns,
          limit,
          maxLimit: EXPORT_MAX_LIMIT,
        });
        const rows = redactAll(collection, result.items).map(row => {
          const out: Record<string, string> = {};
          for (const col of columns) out[col] = formatCell(collection, col, row[col]);
          return out;
        });

        const buffer = await generateExcel(
          meta.label,
          columns.map(c => ({ header: c, key: c })),
          rows
        );
        const filename = `${collection}-${Date.now()}.xlsx`;
        const { key } = await storagePut(
          `mcp-exports/${filename}`,
          buffer as unknown as Uint8Array,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        // Signed directly rather than via the /storage proxy: the proxy's
        // mint step requires a CRM session/bearer, which a plain browser tab
        // opening this link won't have. The caller is already authenticated
        // (this tool ran under an authenticated MCP request), so hand back
        // Firebase's own signed URL — no further auth needed to open it.
        const url = await storageGetSignedUrl(key);

        return toolResult({
          url,
          filename,
          count: result.count,
          truncated: result.truncated,
        });
      } catch (error) {
        return toolError("EXPORT_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    "get_document_url",
    {
      title: "Get a printable document URL",
      description:
        "Returns the existing print-HTML/PDF URL for a single document (quotation, purchase_order, retail_sale, delivery_receipt, acknowledgement_receipt, special_quotation). Links to what the app already renders — no new PDF generation.",
      inputSchema: {
        documentType: z.enum(
          Object.keys(DOCUMENT_TYPES) as [keyof typeof DOCUMENT_TYPES, ...(keyof typeof DOCUMENT_TYPES)[]]
        ),
        id: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ documentType, id }) => {
      const spec = DOCUMENT_TYPES[documentType];
      try {
        const doc = await getDocument(spec.collection, String(id));
        if (!doc) return toolError("NOT_FOUND", `No ${documentType} with id ${id}`);
        return toolResult({ url: `${origin}${spec.path(id)}` });
      } catch (error) {
        return toolError("LOOKUP_FAILED", error instanceof Error ? error.message : String(error));
      }
    }
  );
}
