/**
 * Metadata for every Firestore collection the MCP generic tools can see.
 * This is what makes query_collection/get_document usable without Claude
 * guessing field names — tool descriptions are built from this table.
 *
 * `counters` (id-allocation state) is deliberately excluded — it isn't data.
 */
export type CollectionMeta = {
  /** Firestore collection id. */
  name: string;
  /** Human label surfaced in list_collections. */
  label: string;
  /** cash_requests uses string doc ids ("cr-0701053"); every other collection is numeric. */
  idMode: "numeric" | "raw";
  /** Default projection when a query doesn't request specific fields. */
  keyFields: string[];
  /** Stored as decimal strings — always coerce with format.toNum() before math. */
  moneyFields: string[];
  /** Date/Timestamp fields — docToData already turns these into JS Date; format.ts ISO-strings them. */
  dateFields: string[];
  description: string;
};

export const CATALOG: readonly CollectionMeta[] = [
  {
    name: "users",
    label: "Users",
    idMode: "numeric",
    keyFields: ["id", "username", "name", "role", "status"],
    moneyFields: [],
    dateFields: ["createdAt", "updatedAt", "lastSignedIn"],
    description:
      "App accounts. passwordHash/totpSecret/resetToken/resetTokenExpiry are always redacted from tool output.",
  },
  {
    name: "contacts",
    label: "Contacts",
    idMode: "numeric",
    keyFields: ["id", "firstName", "lastName", "email", "phone", "company"],
    moneyFields: [],
    dateFields: ["createdAt", "updatedAt"],
    description: "Individual CRM contacts (customers, suppliers' people, etc).",
  },
  {
    name: "accounts",
    label: "Accounts",
    idMode: "numeric",
    keyFields: ["id", "name", "industry", "phone", "email"],
    moneyFields: [],
    dateFields: ["createdAt", "updatedAt"],
    description: "Company/organization CRM records (distinct from individual contacts).",
  },
  {
    name: "leads",
    label: "Leads",
    idMode: "numeric",
    keyFields: ["id", "firstName", "lastName", "company", "status", "estimatedValue"],
    moneyFields: ["estimatedValue"],
    dateFields: ["createdAt", "updatedAt"],
    description: "Sales leads, funnel stage new -> contacted -> qualified -> proposal -> won/lost.",
  },
  {
    name: "opportunities",
    label: "Opportunities",
    idMode: "numeric",
    keyFields: ["id", "title", "status", "value", "expectedCloseDate"],
    moneyFields: ["value"],
    dateFields: ["expectedCloseDate", "createdAt", "updatedAt"],
    description: "Sales opportunities, same status funnel as leads.",
  },
  {
    name: "activities",
    label: "Activities",
    idMode: "numeric",
    keyFields: ["id", "type", "subject", "contactId", "opportunityId", "leadId"],
    moneyFields: [],
    dateFields: ["scheduledAt", "completedAt", "createdAt", "updatedAt"],
    description: "Calls/emails/meetings/site visits logged against a contact, opportunity, or lead.",
  },
  {
    name: "inventory_items",
    label: "Inventory Items",
    idMode: "numeric",
    keyFields: ["id", "sku", "name", "category", "stockOnHand", "stockReserved", "sellingPrice"],
    moneyFields: ["purchasePrice", "sellingPrice"],
    dateFields: ["createdAt", "updatedAt"],
    description: "Physical stock catalog (panels, inverters, batteries, accessories, mounting, cabling, breakers).",
  },
  {
    name: "stock_transactions",
    label: "Stock Transactions",
    idMode: "numeric",
    keyFields: ["id", "itemId", "type", "quantity", "purpose", "createdAt"],
    moneyFields: [],
    dateFields: ["createdAt"],
    description: "Every stock_in/stock_out/adjustment/reserved/unreserved movement against inventory_items.",
  },
  {
    name: "inventory_audit_log",
    label: "Inventory Audit Log",
    idMode: "numeric",
    keyFields: ["id", "itemId", "transactionType", "quantity", "previousStock", "newStock"],
    moneyFields: [],
    dateFields: ["createdAt"],
    description: "Chained previousStock/newStock audit trail, written alongside every stock_transactions row.",
  },
  {
    name: "purchase_orders",
    label: "Purchase Orders",
    idMode: "numeric",
    keyFields: ["id", "poNumber", "supplier", "status", "deliveryStatus", "paymentStatus", "totalAmount", "paidAmount"],
    moneyFields: ["totalAmount", "paidAmount"],
    dateFields: ["orderedAt", "receivedAt", "deliveredAt", "createdAt", "updatedAt"],
    description: "Supplier purchase orders.",
  },
  {
    name: "purchase_order_items",
    label: "Purchase Order Items",
    idMode: "numeric",
    keyFields: ["id", "purchaseOrderId", "itemName", "quantity", "unitPrice", "lineTotal", "receivedQuantity"],
    moneyFields: ["unitPrice", "lineTotal"],
    dateFields: ["createdAt"],
    description: "Line items on a purchase order.",
  },
  {
    name: "po_payments",
    label: "PO Payments",
    idMode: "numeric",
    keyFields: ["id", "purchaseOrderId", "amount", "paymentDate", "paymentMethod"],
    moneyFields: ["amount"],
    dateFields: ["paymentDate", "createdAt"],
    description: "Payments made against a purchase order (rolls up into purchase_orders.paidAmount).",
  },
  {
    name: "suppliers",
    label: "Suppliers",
    idMode: "numeric",
    keyFields: ["id", "name", "code", "contactPerson", "phone", "email"],
    moneyFields: [],
    dateFields: ["createdAt", "updatedAt"],
    description: "Vendor/supplier directory.",
  },
  {
    name: "supplier_item_prices",
    label: "Supplier Item Prices",
    idMode: "numeric",
    keyFields: ["id", "supplierId", "inventoryItemId", "unitPrice"],
    moneyFields: ["unitPrice"],
    dateFields: ["createdAt", "updatedAt"],
    description: "Last known price a given supplier charged for a given inventory item.",
  },
  {
    name: "item_price_history",
    label: "Item Price History",
    idMode: "numeric",
    keyFields: ["id", "itemId", "priceType", "oldPrice", "newPrice", "createdAt"],
    moneyFields: ["oldPrice", "newPrice"],
    dateFields: ["createdAt"],
    description: "Audit trail of purchasePrice/sellingPrice changes on inventory_items.",
  },
  {
    name: "bom_packages",
    label: "BOM Packages",
    idMode: "numeric",
    keyFields: ["id", "name", "systemSize", "systemType", "totalCost"],
    moneyFields: ["totalCost"],
    dateFields: ["createdAt", "updatedAt"],
    description: "Bill-of-materials bundles (a named set of inventory items) used to price standard system sizes.",
  },
  {
    name: "bom_package_items",
    label: "BOM Package Items",
    idMode: "numeric",
    keyFields: ["id", "packageId", "itemId", "quantity"],
    moneyFields: [],
    dateFields: ["createdAt"],
    description: "Inventory items making up a bom_packages bundle.",
  },
  {
    name: "quotations",
    label: "Quotations",
    idMode: "numeric",
    keyFields: ["id", "quoteNumber", "title", "status", "customerName", "totalAmount"],
    moneyFields: ["subtotal", "discountAmount", "discountManualAmount", "taxAmount", "totalAmount", "laborCost", "installationFee"],
    dateFields: ["validUntil", "approvedAt", "createdAt", "updatedAt"],
    description: "Customer quotations. discountPercent/taxPercent/vatEnabled are rates/flags, not currency.",
  },
  {
    name: "quotation_items",
    label: "Quotation Items",
    idMode: "numeric",
    keyFields: ["id", "quotationId", "description", "quantity", "unitPrice", "totalPrice"],
    moneyFields: ["unitPrice", "totalPrice"],
    dateFields: ["createdAt"],
    description: "Line items on a quotation.",
  },
  {
    name: "special_quotation_templates",
    label: "Special Quotation Templates",
    idMode: "numeric",
    keyFields: ["id", "name", "systemTitle", "kwRating", "isActive"],
    moneyFields: ["subtotal", "discount"],
    dateFields: ["createdAt", "updatedAt"],
    description: "Reusable templates for the freeform 'special quotation' document type. `items` is an embedded array, not a separate collection.",
  },
  {
    name: "special_quotations",
    label: "Special Quotations",
    idMode: "numeric",
    keyFields: ["id", "quotationNumber", "customerName", "status", "total", "date"],
    moneyFields: ["subtotal", "vatAmount", "discount", "total"],
    dateFields: ["date", "createdAt", "updatedAt"],
    description: "Issued instances of a special_quotation_templates document.",
  },
  {
    name: "projects",
    label: "Projects",
    idMode: "numeric",
    keyFields: ["id", "name", "customerName", "stage", "totalProjectAmount", "startDate"],
    moneyFields: ["totalProjectAmount"],
    dateFields: ["startDate", "targetCompletionDate", "completedDate", "createdAt", "updatedAt"],
    description: "Installation jobs, stage procurement -> implementation -> ongoing -> completed. Distinct from retail_sales.",
  },
  {
    name: "project_status_history",
    label: "Project Status History",
    idMode: "numeric",
    keyFields: ["id", "projectId", "fromStage", "toStage", "createdAt"],
    moneyFields: [],
    dateFields: ["createdAt"],
    description: "Stage-transition audit trail for projects.",
  },
  {
    name: "project_payments",
    label: "Project Payments",
    idMode: "numeric",
    keyFields: ["id", "projectId", "amount", "paymentDate", "paymentMethod"],
    moneyFields: ["amount"],
    dateFields: ["paymentDate", "createdAt"],
    description: "Payments collected against a project's totalProjectAmount.",
  },
  {
    name: "net_metering",
    label: "Net Metering",
    idMode: "numeric",
    keyFields: ["id", "projectId", "clientName", "status", "electricCompany"],
    moneyFields: [],
    dateFields: ["submittedDate", "approvedDate", "completedDate", "createdAt", "updatedAt"],
    description: "Net-metering application tracking, status plan_drawings -> ... -> completed_energized.",
  },
  {
    name: "net_metering_payments",
    label: "Net Metering Payments",
    idMode: "numeric",
    keyFields: ["id", "netMeteringId", "projectId", "amount", "paymentDate"],
    moneyFields: ["amount"],
    dateFields: ["paymentDate", "createdAt"],
    description: "Payments related to a net_metering application.",
  },
  {
    name: "delivery_receipts",
    label: "Delivery Receipts",
    idMode: "numeric",
    keyFields: ["id", "quotationId", "receiptNumber", "customerName", "deliveryDate"],
    moneyFields: [],
    dateFields: ["deliveryDate", "createdAt"],
    description: "Delivery receipt documents issued against a quotation.",
  },
  {
    name: "acknowledgement_receipts",
    label: "Acknowledgement Receipts",
    idMode: "numeric",
    keyFields: ["id", "type", "referenceId", "receiptNumber", "customerName", "amount"],
    moneyFields: ["amount"],
    dateFields: ["paymentDate", "createdAt"],
    description: "Payment acknowledgement documents; `type` says which entity referenceId points at (quotation/project_payment/net_metering_payment).",
  },
  {
    name: "stock_adjustments",
    label: "Stock Adjustments",
    idMode: "numeric",
    keyFields: ["id", "itemId", "adjustmentQuantity", "reason", "status"],
    moneyFields: [],
    dateFields: ["approvedAt", "createdAt", "updatedAt"],
    description: "Admin-approved manual corrections to inventory_items stock levels.",
  },
  {
    name: "cash_requests",
    label: "Cash Requests",
    idMode: "raw",
    keyFields: ["id", "purposeLabel", "amount", "status", "requestedByName", "month", "year"],
    moneyFields: ["amount"],
    dateFields: ["decidedAt", "receivedAt", "createdAt", "updatedAt"],
    description:
      "Petty-cash requests. IMPORTANT: doc ids are strings like \"cr-0701053\", not numbers — this is idMode:\"raw\".",
  },
  {
    name: "notifications",
    label: "Notifications",
    idMode: "numeric",
    keyFields: ["id", "userId", "type", "message", "read"],
    moneyFields: [],
    dateFields: ["createdAt"],
    description: "In-app notifications tied to a user.",
  },
  {
    name: "retail_sales",
    label: "Retail Sales",
    idMode: "numeric",
    keyFields: ["id", "contactId", "customerName", "totalAmount", "saleDate"],
    moneyFields: ["subtotal", "totalAmount"],
    dateFields: ["saleDate", "createdAt", "updatedAt"],
    description: "Walk-in product sales, distinct from the Projects installation flow. Line items are immutable after creation.",
  },
  {
    name: "retail_sale_items",
    label: "Retail Sale Items",
    idMode: "numeric",
    keyFields: ["id", "retailSaleId", "itemName", "quantity", "unitPrice", "lineTotal"],
    moneyFields: ["unitPrice", "lineTotal"],
    dateFields: ["createdAt"],
    description: "Line items on a retail sale — snapshot of the inventory item at sale time.",
  },
  {
    name: "config_options",
    label: "Config Options",
    idMode: "numeric",
    keyFields: ["id", "category", "value", "isActive"],
    moneyFields: [],
    dateFields: ["createdAt"],
    description: "Admin-managed dropdown values (e.g. cash_request_purpose, stock purpose options), keyed by `category`.",
  },
  {
    name: "audit_logs",
    label: "Audit Logs",
    idMode: "numeric",
    keyFields: ["id", "userId", "userName", "action", "entity", "entityId"],
    moneyFields: [],
    dateFields: ["createdAt"],
    description: "App-wide mutation audit trail written by server/firestore.ts#audit. Coverage is partial, not every mutation writes here.",
  },
] as const;

export const CATALOG_BY_NAME: ReadonlyMap<string, CollectionMeta> = new Map(
  CATALOG.map(c => [c.name, c])
);

export const COLLECTION_NAMES = CATALOG.map(c => c.name) as [string, ...string[]];

/** Fields never returned from any tool, regardless of requested projection. */
export const REDACTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  users: ["passwordHash", "totpSecret", "resetToken", "resetTokenExpiry"],
};
