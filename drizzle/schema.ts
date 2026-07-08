import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, bigint, json, boolean } from "drizzle-orm/mysql-core";

// ============ USERS ============
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 100 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  passwordPlain: varchar("passwordPlain", { length: 255 }),
  resetToken: varchar("resetToken", { length: 255 }),
  resetTokenExpiry: timestamp("resetTokenExpiry"),
  totpSecret: varchar("totpSecret", { length: 255 }),
  totpEnabled: boolean("totpEnabled").default(false).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  mobile: varchar("mobile", { length: 50 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "subadmin", "purchaser", "staff", "sales_rep"]).default("subadmin").notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ CRM: CONTACTS ============
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 200 }),
  position: varchar("position", { length: 100 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ============ CRM: ACCOUNTS ============
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  industry: varchar("industry", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 500 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

// ============ CRM: LEADS ============
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 200 }),
  source: varchar("source", { length: 100 }),
  status: mysqlEnum("status", ["new", "contacted", "qualified", "proposal", "won", "lost"]).default("new").notNull(),
  systemSize: varchar("systemSize", { length: 50 }),
  estimatedValue: decimal("estimatedValue", { precision: 12, scale: 2 }),
  notes: text("notes"),
  contactId: int("contactId"),
  accountId: int("accountId"),
  assignedTo: int("assignedTo"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// ============ CRM: OPPORTUNITIES ============
export const opportunities = mysqlTable("opportunities", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  status: mysqlEnum("status", ["new", "contacted", "qualified", "proposal", "won", "lost"]).default("new").notNull(),
  value: decimal("value", { precision: 12, scale: 2 }),
  systemSize: varchar("systemSize", { length: 50 }),
  systemType: varchar("systemType", { length: 100 }),
  contactId: int("contactId"),
  accountId: int("accountId"),
  leadId: int("leadId"),
  assignedTo: int("assignedTo"),
  expectedCloseDate: timestamp("expectedCloseDate"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = typeof opportunities.$inferInsert;

// ============ CRM: ACTIVITIES ============
export const activities = mysqlTable("activities", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["call", "email", "meeting", "site_visit", "follow_up", "note"]).notNull(),
  subject: varchar("subject", { length: 300 }).notNull(),
  description: text("description"),
  contactId: int("contactId"),
  opportunityId: int("opportunityId"),
  leadId: int("leadId"),
  scheduledAt: timestamp("scheduledAt"),
  completedAt: timestamp("completedAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

// ============ INVENTORY: ITEMS ============
export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", ["panels", "inverters", "batteries", "accessories", "mounting", "cabling", "breakers"]).notNull(),
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }),
  specs: text("specs"),
  unit: varchar("unit", { length: 50 }).default("pcs"),
  purchasePrice: decimal("purchasePrice", { precision: 12, scale: 2 }),
  sellingPrice: decimal("sellingPrice", { precision: 12, scale: 2 }),
  stockOnHand: int("stockOnHand").default(0).notNull(),
  stockReserved: int("stockReserved").default(0).notNull(),
  reorderLevel: int("reorderLevel").default(5),
  warehouseLocation: varchar("warehouseLocation", { length: 100 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

// ============ INVENTORY: STOCK TRANSACTIONS ============
export const stockTransactions = mysqlTable("stock_transactions", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  type: mysqlEnum("type", ["stock_in", "stock_out", "adjustment", "reserved", "unreserved"]).notNull(),
  quantity: int("quantity").notNull(),
  reference: varchar("reference", { length: 200 }),
  /** Denormalized label of the config_options row, kept for display and legacy rows. */
  purpose: varchar("purpose", { length: 100 }),
  /** Stable id of the config_options row. Survives admins renaming the label. */
  purposeOptionId: int("purposeOptionId"),
  purposeRefId: int("purposeRefId"),
  purposeRefName: varchar("purposeRefName", { length: 200 }),
  accountId: int("accountId"),
  accountName: varchar("accountName", { length: 200 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockTransaction = typeof stockTransactions.$inferSelect;
export type InsertStockTransaction = typeof stockTransactions.$inferInsert;

// ============ INVENTORY: PURCHASE ORDERS ============
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  poNumber: varchar("poNumber", { length: 50 }).notNull().unique(),
  supplier: varchar("supplier", { length: 200 }).notNull(),
  supplierId: int("supplierId"),
  status: mysqlEnum("status", ["draft", "sent", "received", "cancelled"]).default("draft").notNull(),
  deliveryStatus: mysqlEnum("deliveryStatus", ["not_delivered", "partially_delivered", "fully_delivered"]).default("not_delivered").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "partially_paid", "paid"]).default("unpaid").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  paidAmount: decimal("paidAmount", { precision: 12, scale: 2 }).default("0"),
  vatEnabled: int("vatEnabled").default(0),
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }).default("12"),
  discountType: mysqlEnum("discountType", ["none", "percentage", "fixed"]).default("none"),
  discountValue: decimal("discountValue", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  orderedAt: timestamp("orderedAt"),
  receivedAt: timestamp("receivedAt"),
  deliveredAt: timestamp("deliveredAt"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// ============ INVENTORY: PURCHASE ORDER ITEMS ============
export const purchaseOrderItems = mysqlTable("purchase_order_items", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  itemId: int("itemId").notNull(),
  itemName: varchar("itemName", { length: 300 }),
  itemSku: varchar("itemSku", { length: 100 }),
  description: varchar("description", { length: 500 }),
  unit: varchar("unit", { length: 50 }),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }),
  receivedQuantity: int("receivedQuantity").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;

// ============ INVENTORY: PO PAYMENTS ============
export const poPayments = mysqlTable("po_payments", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  reference: varchar("reference", { length: 200 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PoPayment = typeof poPayments.$inferSelect;
export type InsertPoPayment = typeof poPayments.$inferInsert;

// ============ BOM: PACKAGES ============
export const bomPackages = mysqlTable("bom_packages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description"),
  systemSize: varchar("systemSize", { length: 50 }),
  systemType: varchar("systemType", { length: 100 }),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BomPackage = typeof bomPackages.$inferSelect;
export type InsertBomPackage = typeof bomPackages.$inferInsert;

// ============ BOM: PACKAGE ITEMS ============
export const bomPackageItems = mysqlTable("bom_package_items", {
  id: int("id").autoincrement().primaryKey(),
  packageId: int("packageId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: int("quantity").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BomPackageItem = typeof bomPackageItems.$inferSelect;
export type InsertBomPackageItem = typeof bomPackageItems.$inferInsert;

// ============ QUOTATIONS ============
export const quotations = mysqlTable("quotations", {
  id: int("id").autoincrement().primaryKey(),
  quoteNumber: varchar("quoteNumber", { length: 50 }).notNull().unique(),
  version: int("version").default(1).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  status: mysqlEnum("status", ["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "expired"]).default("draft").notNull(),
  opportunityId: int("opportunityId"),
  contactId: int("contactId"),
  accountId: int("accountId"),
  customerName: varchar("customerName", { length: 200 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhone: varchar("customerPhone", { length: 50 }),
  customerAddress: text("customerAddress"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }),
  discountManualAmount: decimal("discountManualAmount", { precision: 12, scale: 2 }),
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }),
  vatEnabled: int("vatEnabled").default(0).notNull(),
  taxPercent: decimal("taxPercent", { precision: 5, scale: 2 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  laborCost: decimal("laborCost", { precision: 12, scale: 2 }),
  installationFee: decimal("installationFee", { precision: 12, scale: 2 }),
  lastEditedBy: int("lastEditedBy"),
  paymentTerms: text("paymentTerms"),
  warrantyTerms: text("warrantyTerms"),
  validUntil: timestamp("validUntil"),
  notes: text("notes"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = typeof quotations.$inferInsert;

// ============ QUOTATION LINE ITEMS ============
export const quotationItems = mysqlTable("quotation_items", {
  id: int("id").autoincrement().primaryKey(),
  quotationId: int("quotationId").notNull(),
  itemId: int("itemId"),
  itemType: mysqlEnum("itemType", ["inventory", "labor", "custom"]).default("inventory").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: int("quantity").notNull().default(1),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuotationItem = typeof quotationItems.$inferSelect;
export type InsertQuotationItem = typeof quotationItems.$inferInsert;

// ============ SUPPLIERS ============
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 50 }),
  contactPerson: varchar("contactPerson", { length: 200 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  paymentTerms: varchar("paymentTerms", { length: 200 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

// ============ CONFIGURABLE OPTIONS (Admin-managed dropdowns) ============
export const configOptions = mysqlTable("config_options", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 100 }).notNull(),
  value: varchar("value", { length: 200 }).notNull(),
  sortOrder: int("sortOrder").default(0),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigOption = typeof configOptions.$inferSelect;
export type InsertConfigOption = typeof configOptions.$inferInsert;

// ============ AUDIT LOG ============
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 100 }).notNull(),
  entityId: int("entityId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ============ PROJECT MONITORING ============
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description"),
  sizeOfSetup: varchar("sizeOfSetup", { length: 100 }),
  typeOfSetup: varchar("typeOfSetup", { length: 100 }),
  customerName: varchar("customerName", { length: 200 }),
  address: text("address"),
  stage: mysqlEnum("stage", ["procurement", "implementation", "ongoing", "completed"]).default("procurement").notNull(),
  startDate: timestamp("startDate"),
  targetCompletionDate: timestamp("targetCompletionDate"),
  completedDate: timestamp("completedDate"),
  opportunityId: int("opportunityId"),
  quotationId: int("quotationId"),
  contactId: int("contactId"),
  totalProjectAmount: decimal("totalProjectAmount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ============ PROJECT STATUS HISTORY ============
export const projectStatusHistory = mysqlTable("project_status_history", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  fromStage: varchar("fromStage", { length: 50 }),
  toStage: varchar("toStage", { length: 50 }).notNull(),
  notes: text("notes"),
  changedBy: int("changedBy"),
  changedByName: varchar("changedByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProjectStatusHistory = typeof projectStatusHistory.$inferSelect;
export type InsertProjectStatusHistory = typeof projectStatusHistory.$inferInsert;

// ============ NET METERING ============
export const netMetering = mysqlTable("net_metering", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  clientName: varchar("clientName", { length: 200 }).notNull(),
  projectName: varchar("projectName", { length: 200 }),
  address: text("address"),
  sizeOfSetup: varchar("sizeOfSetup", { length: 50 }),
  typeOfSetup: varchar("typeOfSetup", { length: 100 }),
  status: mysqlEnum("status", [
    "plan_drawings",
    "submitted_lgu",
    "submitted_fire",
    "submitted_electric",
    "approved",
    "completed_energized"
  ]).default("plan_drawings").notNull(),
  electricCompany: varchar("electricCompany", { length: 200 }),
  applicationNumber: varchar("applicationNumber", { length: 100 }),
  notes: text("notes"),
  submittedDate: timestamp("submittedDate"),
  approvedDate: timestamp("approvedDate"),
  completedDate: timestamp("completedDate"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NetMetering = typeof netMetering.$inferSelect;
export type InsertNetMetering = typeof netMetering.$inferInsert;

// ============ STOCK ADJUSTMENTS (Admin-only) ============
export const stockAdjustments = mysqlTable("stock_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  previousQuantity: int("previousQuantity").notNull(),
  newQuantity: int("newQuantity").notNull(),
  adjustmentQuantity: int("adjustmentQuantity").notNull(),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  requestedBy: int("requestedBy"),
  requestedByName: varchar("requestedByName", { length: 200 }),
  approvedBy: int("approvedBy"),
  approvedByName: varchar("approvedByName", { length: 200 }),
  approvedAt: timestamp("approvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type InsertStockAdjustment = typeof stockAdjustments.$inferInsert;

// ============ INVENTORY AUDIT LOG ============
export const inventoryAuditLog = mysqlTable("inventory_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  itemName: varchar("itemName", { length: 300 }),
  itemSku: varchar("itemSku", { length: 100 }),
  transactionType: mysqlEnum("transactionType", ["stock_in", "stock_out", "transfer_in", "transfer_out", "adjustment", "initial"]).notNull(),
  quantity: int("quantity").notNull(),
  previousStock: int("previousStock").notNull(),
  newStock: int("newStock").notNull(),
  sourceLocation: varchar("sourceLocation", { length: 100 }),
  destinationLocation: varchar("destinationLocation", { length: 100 }),
  reference: varchar("reference", { length: 200 }),
  purpose: varchar("purpose", { length: 200 }),
  notes: text("notes"),
  performedBy: int("performedBy"),
  performedByName: varchar("performedByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InventoryAuditLog = typeof inventoryAuditLog.$inferSelect;
export type InsertInventoryAuditLog = typeof inventoryAuditLog.$inferInsert;

// ============ SUPPLIER-ITEM PRICES ============
export const supplierItemPrices = mysqlTable("supplier_item_prices", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId").notNull(),
  inventoryItemId: int("inventoryItemId").notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  lastPurchaseOrderId: int("lastPurchaseOrderId"),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupplierItemPrice = typeof supplierItemPrices.$inferSelect;
export type InsertSupplierItemPrice = typeof supplierItemPrices.$inferInsert;

// ============ PROJECT PAYMENTS ============
export const projectPayments = mysqlTable("project_payments", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  paymentReference: varchar("paymentReference", { length: 200 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProjectPayment = typeof projectPayments.$inferSelect;
export type InsertProjectPayment = typeof projectPayments.$inferInsert;


// ============ NET METERING PAYMENTS ============
export const netMeteringPayments = mysqlTable("net_metering_payments", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  netMeteringId: int("netMeteringId").notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  paymentReference: varchar("paymentReference", { length: 200 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NetMeteringPayment = typeof netMeteringPayments.$inferSelect;
export type InsertNetMeteringPayment = typeof netMeteringPayments.$inferInsert;

// ============ DELIVERY RECEIPTS ============
export const deliveryReceipts = mysqlTable("delivery_receipts", {
  id: int("id").autoincrement().primaryKey(),
  quotationId: int("quotationId").notNull(),
  receiptNumber: varchar("receiptNumber", { length: 50 }).notNull().unique(),
  deliveryDate: timestamp("deliveryDate").notNull(),
  customerName: varchar("customerName", { length: 200 }),
  customerAddress: text("customerAddress"),
  projectReference: varchar("projectReference", { length: 300 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeliveryReceipt = typeof deliveryReceipts.$inferSelect;
export type InsertDeliveryReceipt = typeof deliveryReceipts.$inferInsert;

// ============ ACKNOWLEDGEMENT RECEIPTS ============
export const acknowledgementReceipts = mysqlTable("acknowledgement_receipts", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["quotation", "project_payment", "net_metering_payment"]).notNull(),
  referenceId: int("referenceId").notNull(),
  receiptNumber: varchar("receiptNumber", { length: 50 }).notNull().unique(),
  customerName: varchar("customerName", { length: 200 }),
  projectReference: varchar("projectReference", { length: 300 }),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  paymentDate: timestamp("paymentDate"),
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  paymentReference: varchar("paymentReference", { length: 200 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AcknowledgementReceipt = typeof acknowledgementReceipts.$inferSelect;
export type InsertAcknowledgementReceipt = typeof acknowledgementReceipts.$inferInsert;

// ============ SPECIAL QUOTATION TEMPLATES ============
export const specialQuotationTemplates = mysqlTable("special_quotation_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  systemTitle: varchar("systemTitle", { length: 500 }),
  systemDescription: text("systemDescription"),
  kwRating: varchar("kwRating", { length: 50 }),
  setupType: varchar("setupType", { length: 100 }),
  items: json("items"), // Array of { illustration, description, qty, unit, unitPrice, total, notes, warranty }
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }),
  discount: decimal("discount", { precision: 12, scale: 2 }),
  remarks: text("remarks"),
  warrantyClaims: text("warrantyClaims"),
  paymentTerms: text("paymentTerms"),
  paymentDetails: text("paymentDetails"),
  deliveryTerms: text("deliveryTerms"),
  preparedBy: varchar("preparedBy", { length: 200 }),
  contactInfo: text("contactInfo"),
  isActive: int("isActive").default(1).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SpecialQuotationTemplate = typeof specialQuotationTemplates.$inferSelect;
export type InsertSpecialQuotationTemplate = typeof specialQuotationTemplates.$inferInsert;

// ============ SPECIAL QUOTATIONS (instances from templates) ============
export const specialQuotations = mysqlTable("special_quotations", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId"),
  quotationNumber: varchar("quotationNumber", { length: 50 }).notNull().unique(),
  date: timestamp("date"),
  customerName: varchar("customerName", { length: 200 }),
  customerAddress: text("customerAddress"),
  systemTitle: varchar("systemTitle", { length: 500 }),
  systemDescription: text("systemDescription"),
  kwRating: varchar("kwRating", { length: 50 }),
  setupType: varchar("setupType", { length: 100 }),
  items: json("items"), // Array of { illustration, description, qty, unit, unitPrice, total, notes, warranty }
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }),
  vatAmount: decimal("vatAmount", { precision: 12, scale: 2 }),
  discount: decimal("discount", { precision: 12, scale: 2 }),
  total: decimal("total", { precision: 12, scale: 2 }),
  remarks: text("remarks"),
  warrantyClaims: text("warrantyClaims"),
  paymentTerms: text("paymentTerms"),
  paymentDetails: text("paymentDetails"),
  deliveryTerms: text("deliveryTerms"),
  preparedBy: varchar("preparedBy", { length: 200 }),
  contactInfo: text("contactInfo"),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "rejected"]).default("draft").notNull(),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SpecialQuotation = typeof specialQuotations.$inferSelect;
export type InsertSpecialQuotation = typeof specialQuotations.$inferInsert;


// ============ TWO-FACTOR AUTH CODES ============
export const twoFactorCodes = mysqlTable("two_factor_codes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TwoFactorCode = typeof twoFactorCodes.$inferSelect;
export type InsertTwoFactorCode = typeof twoFactorCodes.$inferInsert;


// ============ INVENTORY: ITEM PRICE HISTORY ============
export const itemPriceHistory = mysqlTable("item_price_history", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  priceType: mysqlEnum("priceType", ["purchase", "selling"]).notNull(),
  oldPrice: decimal("oldPrice", { precision: 12, scale: 2 }),
  newPrice: decimal("newPrice", { precision: 12, scale: 2 }),
  changedBy: int("changedBy"),
  changedByName: varchar("changedByName", { length: 200 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ItemPriceHistory = typeof itemPriceHistory.$inferSelect;
export type InsertItemPriceHistory = typeof itemPriceHistory.$inferInsert;
