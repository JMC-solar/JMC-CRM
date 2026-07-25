/**
 * Plain TS interfaces for the Firestore data layer, mechanically ported from
 * drizzle/schema.ts `$inferSelect` shapes (see that file for the MySQL source
 * of truth during the migration window). Conventions:
 *  - int ids stay `number`
 *  - decimal columns stay `string` (e.g. "1234.50")
 *  - timestamp columns stay `Date`
 *  - tinyint-as-flag int columns (vatEnabled, isActive, discountType flags) stay `number`
 *  - real drizzle `boolean()` columns stay `boolean`
 *  - json columns are typed as their array/object shape
 *  - nullable columns are `T | null`
 */

// ============ USERS ============
// NOTE: passwordPlain is intentionally omitted — plaintext passwords are not
// carried over into Firestore. See server/localAuth.ts.
export interface User {
  id: number;
  openId: string;
  username: string | null;
  passwordHash: string | null;
  resetToken: string | null;
  resetTokenExpiry: Date | null;
  totpSecret: string | null;
  totpEnabled: boolean;
  name: string | null;
  email: string | null;
  mobile: string | null;
  loginMethod: string | null;
  role: "admin" | "subadmin" | "purchaser" | "staff" | "sales_rep";
  status: "active" | "inactive";
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
  /** Bumped to revoke every outstanding browser session token for this user at once. Absent = 0. */
  tokenVersion?: number;
  /** Same idea as tokenVersion but for MCP-issued bearer tokens — revoke agent credentials without logging out the browser. Absent = 0. */
  mcpTokenVersion?: number;
}

// ============ CRM: CONTACTS ============
export interface Contact {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ CRM: ACCOUNTS ============
export interface Account {
  id: number;
  name: string;
  industry: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ CRM: LEADS ============
export interface Lead {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
  systemSize: string | null;
  estimatedValue: string | null;
  notes: string | null;
  contactId: number | null;
  accountId: number | null;
  assignedTo: number | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ CRM: OPPORTUNITIES ============
export interface Opportunity {
  id: number;
  title: string;
  status: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
  value: string | null;
  systemSize: string | null;
  systemType: string | null;
  contactId: number | null;
  accountId: number | null;
  leadId: number | null;
  assignedTo: number | null;
  expectedCloseDate: Date | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ CRM: ACTIVITIES ============
export interface Activity {
  id: number;
  type: "call" | "email" | "meeting" | "site_visit" | "follow_up" | "note";
  subject: string;
  description: string | null;
  contactId: number | null;
  opportunityId: number | null;
  leadId: number | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ INVENTORY: ITEMS ============
export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: "panels" | "inverters" | "batteries" | "accessories" | "mounting" | "cabling" | "breakers";
  brand: string | null;
  model: string | null;
  specs: string | null;
  unit: string | null;
  purchasePrice: string | null;
  sellingPrice: string | null;
  stockOnHand: number;
  stockReserved: number;
  reorderLevel: number | null;
  warehouseLocation: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ INVENTORY: STOCK TRANSACTIONS ============
export interface StockTransaction {
  id: number;
  itemId: number;
  type: "stock_in" | "stock_out" | "adjustment" | "reserved" | "unreserved";
  quantity: number;
  reference: string | null;
  purpose: string | null;
  purposeOptionId: number | null;
  purposeRefId: number | null;
  purposeRefName: string | null;
  accountId: number | null;
  accountName: string | null;
  contactId: number | null;
  contactName: string | null;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

// ============ INVENTORY: PURCHASE ORDERS ============
export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplier: string;
  supplierId: number | null;
  status: "draft" | "sent" | "received" | "cancelled";
  deliveryStatus: "not_delivered" | "partially_delivered" | "fully_delivered";
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  totalAmount: string | null;
  paidAmount: string | null;
  vatEnabled: number | null;
  vatRate: string | null;
  discountType: "none" | "percentage" | "fixed" | null;
  discountValue: string | null;
  notes: string | null;
  orderedAt: Date | null;
  receivedAt: Date | null;
  deliveredAt: Date | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ INVENTORY: PURCHASE ORDER ITEMS ============
export interface PurchaseOrderItem {
  id: number;
  purchaseOrderId: number;
  itemId: number;
  itemName: string | null;
  itemSku: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: string | null;
  lineTotal: string | null;
  receivedQuantity: number | null;
  createdAt: Date;
}

// ============ INVENTORY: PO PAYMENTS ============
export interface PoPayment {
  id: number;
  purchaseOrderId: number;
  amount: string;
  paymentDate: Date;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
}

// ============ BOM: PACKAGES ============
export interface BomPackage {
  id: number;
  name: string;
  description: string | null;
  systemSize: string | null;
  systemType: string | null;
  totalCost: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ BOM: PACKAGE ITEMS ============
export interface BomPackageItem {
  id: number;
  packageId: number;
  itemId: number;
  quantity: number;
  createdAt: Date;
}

// ============ QUOTATIONS ============
export interface Quotation {
  id: number;
  quoteNumber: string;
  version: number;
  title: string;
  status: "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected" | "expired";
  opportunityId: number | null;
  contactId: number | null;
  accountId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  subtotal: string | null;
  discountPercent: string | null;
  discountManualAmount: string | null;
  discountAmount: string | null;
  vatEnabled: number;
  taxPercent: string | null;
  taxAmount: string | null;
  totalAmount: string | null;
  laborCost: string | null;
  installationFee: string | null;
  lastEditedBy: number | null;
  paymentTerms: string | null;
  warrantyTerms: string | null;
  validUntil: Date | null;
  notes: string | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ QUOTATION LINE ITEMS ============
export interface QuotationItem {
  id: number;
  quotationId: number;
  itemId: number | null;
  itemType: "inventory" | "labor" | "custom";
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  createdAt: Date;
}

// ============ SUPPLIERS ============
export interface Supplier {
  id: number;
  name: string;
  code: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  paymentTerms: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ CONFIGURABLE OPTIONS (Admin-managed dropdowns) ============
export interface ConfigOption {
  id: number;
  category: string;
  value: string;
  sortOrder: number | null;
  isActive: number;
  createdAt: Date;
}

// ============ AUDIT LOG ============
export interface AuditLog {
  id: number;
  userId: number | null;
  // Denormalized at write time (see server/firestore.ts#audit) since Firestore
  // has no server-side join to fetch it at read time the way MySQL did.
  userName: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  details: string | null;
  createdAt: Date;
}

// ============ PROJECT MONITORING ============
export interface Project {
  id: number;
  name: string;
  description: string | null;
  sizeOfSetup: string | null;
  typeOfSetup: string | null;
  customerName: string | null;
  address: string | null;
  stage: "procurement" | "implementation" | "ongoing" | "completed";
  startDate: Date | null;
  targetCompletionDate: Date | null;
  completedDate: Date | null;
  opportunityId: number | null;
  quotationId: number | null;
  contactId: number | null;
  totalProjectAmount: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ PROJECT STATUS HISTORY ============
export interface ProjectStatusHistory {
  id: number;
  projectId: number;
  fromStage: string | null;
  toStage: string;
  notes: string | null;
  changedBy: number | null;
  changedByName: string | null;
  createdAt: Date;
}

// ============ NET METERING ============
export interface NetMetering {
  id: number;
  projectId: number | null;
  clientName: string;
  projectName: string | null;
  address: string | null;
  sizeOfSetup: string | null;
  typeOfSetup: string | null;
  status:
    | "plan_drawings"
    | "submitted_lgu"
    | "submitted_fire"
    | "submitted_electric"
    | "approved"
    | "completed_energized";
  electricCompany: string | null;
  applicationNumber: string | null;
  notes: string | null;
  submittedDate: Date | null;
  approvedDate: Date | null;
  completedDate: Date | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ STOCK ADJUSTMENTS (Admin-only) ============
export interface StockAdjustment {
  id: number;
  itemId: number;
  previousQuantity: number;
  newQuantity: number;
  adjustmentQuantity: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: number | null;
  requestedByName: string | null;
  approvedBy: number | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ INVENTORY AUDIT LOG ============
export interface InventoryAuditLog {
  id: number;
  itemId: number;
  itemName: string | null;
  itemSku: string | null;
  transactionType: "stock_in" | "stock_out" | "transfer_in" | "transfer_out" | "adjustment" | "initial";
  quantity: number;
  previousStock: number;
  newStock: number;
  sourceLocation: string | null;
  destinationLocation: string | null;
  reference: string | null;
  purpose: string | null;
  notes: string | null;
  performedBy: number | null;
  performedByName: string | null;
  createdAt: Date;
}

// ============ SUPPLIER-ITEM PRICES ============
export interface SupplierItemPrice {
  id: number;
  supplierId: number;
  inventoryItemId: number;
  unitPrice: string;
  lastPurchaseOrderId: number | null;
  updatedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ PROJECT PAYMENTS ============
export interface ProjectPayment {
  id: number;
  projectId: number;
  paymentDate: Date;
  amount: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

// ============ NET METERING PAYMENTS ============
/**
 * One line on a project billing. Additions are usually inventory items (with
 * quantity × unit price), but a line can also be a free-text lump sum such as
 * the project contract amount. `amount` is always the line total.
 * Older records only have description + amount — read them via a normaliser
 * that fills quantity = 1 and unitPrice = amount.
 */
export interface ProjectBillingItem {
  description: string;
  inventoryItemId?: number | null;
  sku?: string | null;
  quantity?: number;
  unitPrice?: string;
  amount: string;
}

/**
 * The amount JMC bills a client for a project. One billing sheet per project,
 * seeded from the project's contract amount with additions added on top; the
 * total is the final amount due. Payments are tracked in project_payments.
 */
export interface ProjectBilling {
  id: number;
  projectId: number;
  billingNumber: string; // "PB-XXXXXX"
  items: ProjectBillingItem[];
  total: string;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One line on a net metering billing, e.g. "LGU permit fee" — ₱3,000. */
export interface NetMeteringBillingItem {
  description: string;
  amount: string;
}

/**
 * The amount JMC bills the client for processing a net metering application.
 * One billing sheet per net metering record; entries are added to it and the
 * total is what the client owes. Payments are tracked separately below.
 */
export interface NetMeteringBilling {
  id: number;
  netMeteringId: number;
  projectId: number | null;
  billingNumber: string; // "NMB-XXXXXX"
  items: NetMeteringBillingItem[];
  total: string;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NetMeteringPayment {
  id: number;
  projectId: number;
  netMeteringId: number;
  paymentDate: Date;
  amount: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

// ============ DELIVERY RECEIPTS ============
export interface DeliveryReceipt {
  id: number;
  quotationId: number;
  receiptNumber: string;
  deliveryDate: Date;
  customerName: string | null;
  customerAddress: string | null;
  projectReference: string | null;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

// ============ ACKNOWLEDGEMENT RECEIPTS ============
export interface AcknowledgementReceipt {
  id: number;
  type: "quotation" | "project_payment" | "net_metering_payment";
  referenceId: number;
  receiptNumber: string;
  customerName: string | null;
  projectReference: string | null;
  amount: string | null;
  paymentDate: Date | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
}

// Line item shape stored in specialQuotationTemplates.items / specialQuotations.items.
// Not enforced by a zod schema upstream — verified against client/src/pages/SpecialQuotationEdit.tsx
// (which always initializes every field to "" / "1" / "LOT", never omitting a key) and
// server/documentPdf.ts's generateSpecialQuotationHtml (which reads description/qty/unit/
// unitPrice/total/notes/warranty — "illustration" is a legacy/unused DB comment artifact,
// never read or written anywhere in the app).
export interface SpecialQuotationLineItem {
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  total: string;
  notes: string;
  warranty: string;
}

// ============ SPECIAL QUOTATION TEMPLATES ============
export interface SpecialQuotationTemplate {
  id: number;
  name: string;
  description: string | null;
  systemTitle: string | null;
  systemDescription: string | null;
  kwRating: string | null;
  setupType: string | null;
  items: SpecialQuotationLineItem[] | null;
  subtotal: string | null;
  vatRate: string | null;
  discount: string | null;
  remarks: string | null;
  warrantyClaims: string | null;
  paymentTerms: string | null;
  paymentDetails: string | null;
  deliveryTerms: string | null;
  preparedBy: string | null;
  contactInfo: string | null;
  isActive: number;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ SPECIAL QUOTATIONS (instances from templates) ============
export interface SpecialQuotation {
  id: number;
  templateId: number | null;
  quotationNumber: string;
  date: Date | null;
  customerName: string | null;
  customerAddress: string | null;
  systemTitle: string | null;
  systemDescription: string | null;
  kwRating: string | null;
  setupType: string | null;
  items: SpecialQuotationLineItem[] | null;
  subtotal: string | null;
  vatRate: string | null;
  vatAmount: string | null;
  discount: string | null;
  total: string | null;
  remarks: string | null;
  warrantyClaims: string | null;
  paymentTerms: string | null;
  paymentDetails: string | null;
  deliveryTerms: string | null;
  preparedBy: string | null;
  contactInfo: string | null;
  status: "draft" | "sent" | "accepted" | "rejected";
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ TWO-FACTOR AUTH CODES ============
export interface TwoFactorCode {
  id: number;
  userId: number;
  code: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

// ============ INVENTORY: ITEM PRICE HISTORY ============
export interface ItemPriceHistory {
  id: number;
  itemId: number;
  priceType: "purchase" | "selling";
  oldPrice: string | null;
  newPrice: string | null;
  changedBy: number | null;
  changedByName: string | null;
  notes: string | null;
  createdAt: Date;
}

/** money(1234.5) => "1234.50" — matches drizzle decimal column string wire-shape. */
export function money(n: number): string {
  return n.toFixed(2);
}

// ============ CASH REQUESTS ============
/** One line entry inside a cash request (e.g. Fuel — ₱2,000). */
export interface CashRequestItem {
  purposeOptionId: number;
  purposeLabel: string; // denormalized at request time
  amount: string;
}

export interface CashRequest {
  id: string; // "cr-0701053" — the Firestore doc id itself, not a numeric surrogate
  month: number; // 1-12, month this request is attributed to
  year: number;
  monthSeq: number; // per-month counter value
  yearSeq: number; // running yearly counter value
  // A request can hold several entries. Records created before multi-entry
  // support have no `items` — read them through the normaliser, which falls
  // back to the single legacy purpose/amount below.
  items?: CashRequestItem[];
  purposeOptionId: number; // config_options row id, category "cash_request_purpose"
  purposeLabel: string; // denormalized at request time
  amount: string; // total across all items
  isOldRecord: boolean;
  status: "pending" | "approved" | "rejected";
  received: boolean;
  requestedBy: number;
  requestedByName: string;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  receivedAt: Date | null;
  // Who confirmed receipt of the cash. Need not be the requester — any sub-admin
  // can receive it. Absent on records created before this was tracked.
  receivedBy?: number | null;
  receivedByName?: string | null;
  notes: string | null;
  // Admin's reason for rejecting, kept separate from the requester's own `notes`.
  // Absent (`undefined`) on requests rejected before this field existed.
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ NOTIFICATIONS ============
export interface Notification {
  id: number;
  userId: number;
  type: "cash_request_created" | "cash_request_approved" | "cash_request_rejected" | "cash_request_received";
  message: string;
  link: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: Date;
}

// ============ RETAIL SALES ============
// Walk-in product sales, distinct from the Projects (installation job) flow.
// Every line item must reference a real inventory_items row — enforced server-side
// in server/routers.ts, never trust a client-supplied itemId/price/total.
export interface RetailSale {
  id: number;
  contactId: number;
  // Denormalized at sale time from the Contact; re-derived from the live contact on
  // read (see personName/nameFor in server/routers.ts) and falls back to this snapshot
  // if the contact has since been deleted.
  customerName: string | null;
  saleDate: Date;
  subtotal: string;
  totalAmount: string;
  notes: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ RETAIL SALE LINE ITEMS ============
export interface RetailSaleItem {
  id: number;
  retailSaleId: number;
  itemId: number;
  // Snapshot of the inventory_items row at time of sale — prices and descriptions
  // change, and the sale record must not silently rewrite history.
  itemName: string | null;
  itemSku: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  createdAt: Date;
}
