import { REDACTED_FIELDS } from "./catalog";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Money is stored as decimal strings throughout (see models.ts `money()`). Always coerce before math. */
export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Strips catalog-listed secret fields from a row before it ever reaches tool output. */
export function redact<T extends Record<string, unknown>>(collection: string, row: T): T {
  const fields = REDACTED_FIELDS[collection];
  if (!fields || fields.length === 0) return row;
  const copy = { ...row };
  for (const field of fields) delete copy[field];
  return copy;
}

export function redactAll<T extends Record<string, unknown>>(collection: string, rows: T[]): T[] {
  const fields = REDACTED_FIELDS[collection];
  if (!fields || fields.length === 0) return rows;
  return rows.map(row => redact(collection, row));
}

/**
 * Every tool's success path returns through this. JSON.stringify already
 * ISO-strings Date instances via Date.prototype.toJSON, so no separate date
 * pass is needed — this just gives every tool one consistent content shape.
 */
export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Structured tool error: {code, message, details} rather than letting a raw
 * Firestore/tRPC stack trace escape as an opaque failure. `isError: true`
 * signals the MCP client this call did not succeed.
 */
export function toolError(code: string, message: string, details?: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ code, message, details }, null, 2) }],
    isError: true,
  };
}
