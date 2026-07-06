import { Router } from "express";
import { getDb } from "./db";
import { contacts, inventoryItems, quotations, projects, projectPayments } from "../drizzle/schema";
import { eq, like, and, or, desc, sql, gte, lte, inArray, count, sum } from "drizzle-orm";
import ExcelJS from "exceljs";

const router = Router();

// ============ CONTACTS EXPORT ============
router.get("/api/export/contacts", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) { res.status(500).json({ error: "Database unavailable" }); return; }
    const { search, format } = req.query as { search?: string; format?: string };
    const conditions: any[] = [];
    if (search) conditions.push(or(like(contacts.firstName, `%${search}%`), like(contacts.lastName, `%${search}%`), like(contacts.email, `%${search}%`), like(contacts.company, `%${search}%`), like(contacts.phone, `%${search}%`), like(contacts.position, `%${search}%`), like(contacts.city, `%${search}%`), like(contacts.address, `%${search}%`)));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const items = await db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(2000);

    const columns = [
      { header: "Name", key: "name" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "phone" },
      { header: "Company", key: "company" },
      { header: "Position", key: "position" },
      { header: "City", key: "city" },
      { header: "Address", key: "address" },
      { header: "Date Created", key: "createdAt" },
    ];
    const rows = items.map(c => ({
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      email: c.email || "",
      phone: c.phone || "",
      company: c.company || "",
      position: c.position || "",
      city: c.city || "",
      address: c.address || "",
      createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "",
    }));

    if (format === "pdf") {
      const html = generatePdfHtml("Contacts / Customers Database", columns.map(c => c.header), rows.map(r => columns.map(c => (r as any)[c.key])));
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } else {
      const buffer = await generateExcel("Contacts", columns, rows);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="contacts-export.xlsx"`);
      res.send(buffer);
    }
  } catch (error) {
    console.error("Export contacts error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

// ============ INVENTORY EXPORT ============
router.get("/api/export/inventory", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) { res.status(500).json({ error: "Database unavailable" }); return; }
    const { search, category, format } = req.query as { search?: string; category?: string; format?: string };
    const conditions: any[] = [];
    if (search) conditions.push(or(like(inventoryItems.name, `%${search}%`), like(inventoryItems.sku, `%${search}%`), like(inventoryItems.brand, `%${search}%`), like(inventoryItems.model, `%${search}%`), like(inventoryItems.description, `%${search}%`), like(inventoryItems.warehouseLocation, `%${search}%`)));
    if (category) conditions.push(eq(inventoryItems.category, category as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const items = await db.select().from(inventoryItems).where(where).orderBy(desc(inventoryItems.createdAt)).limit(5000);

    const columns = [
      { header: "SKU", key: "sku" },
      { header: "Name", key: "name" },
      { header: "Category", key: "category" },
      { header: "Brand", key: "brand" },
      { header: "Model", key: "model" },
      { header: "Unit", key: "unit" },
      { header: "Purchase Price", key: "purchasePrice" },
      { header: "Selling Price", key: "sellingPrice" },
      { header: "Stock On Hand", key: "stockOnHand" },
      { header: "Reorder Level", key: "reorderLevel" },
      { header: "Location", key: "warehouseLocation" },
    ];
    const rows = items.map(i => ({
      sku: i.sku,
      name: i.name,
      category: i.category,
      brand: i.brand || "",
      model: i.model || "",
      unit: i.unit || "pcs",
      purchasePrice: i.purchasePrice ? `₱${parseFloat(i.purchasePrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "",
      sellingPrice: i.sellingPrice ? `₱${parseFloat(i.sellingPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "",
      stockOnHand: String(i.stockOnHand),
      reorderLevel: String(i.reorderLevel || 5),
      warehouseLocation: i.warehouseLocation || "",
    }));

    if (format === "pdf") {
      const html = generatePdfHtml("Inventory Items Database", columns.map(c => c.header), rows.map(r => columns.map(c => (r as any)[c.key])));
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } else {
      const buffer = await generateExcel("Inventory", columns, rows);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="inventory-export.xlsx"`);
      res.send(buffer);
    }
  } catch (error) {
    console.error("Export inventory error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

// ============ QUOTATIONS EXPORT ============
router.get("/api/export/quotations", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) { res.status(500).json({ error: "Database unavailable" }); return; }
    const { search, dateFrom, dateTo, format } = req.query as { search?: string; dateFrom?: string; dateTo?: string; format?: string };
    const conditions: any[] = [];
    if (search) conditions.push(or(like(quotations.customerName, `%${search}%`), like(quotations.title, `%${search}%`), like(quotations.quoteNumber, `%${search}%`), like(quotations.customerAddress, `%${search}%`), like(quotations.customerEmail, `%${search}%`), like(quotations.notes, `%${search}%`)));
    if (dateFrom) conditions.push(gte(quotations.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(quotations.createdAt, new Date(dateTo + "T23:59:59")));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const items = await db.select().from(quotations).where(where).orderBy(desc(quotations.createdAt)).limit(2000);

    const columns = [
      { header: "Quote #", key: "quoteNumber" },
      { header: "Customer Name", key: "customerName" },
      { header: "Title", key: "title" },
      { header: "Status", key: "status" },
      { header: "Address", key: "customerAddress" },
      { header: "Subtotal", key: "subtotal" },
      { header: "Total Amount", key: "totalAmount" },
      { header: "Date Created", key: "createdAt" },
    ];
    const rows = items.map(q => ({
      quoteNumber: q.quoteNumber,
      customerName: q.customerName || "",
      title: q.title,
      status: q.status,
      customerAddress: q.customerAddress || "",
      subtotal: q.subtotal ? `₱${parseFloat(q.subtotal).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "",
      totalAmount: q.totalAmount ? `₱${parseFloat(q.totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "",
      createdAt: q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "",
    }));

    if (format === "pdf") {
      const html = generatePdfHtml("Quotations Database", columns.map(c => c.header), rows.map(r => columns.map(c => (r as any)[c.key])));
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } else {
      const buffer = await generateExcel("Quotations", columns, rows);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="quotations-export.xlsx"`);
      res.send(buffer);
    }
  } catch (error) {
    console.error("Export quotations error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

// ============ PROJECTS EXPORT ============
router.get("/api/export/projects", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) { res.status(500).json({ error: "Database unavailable" }); return; }
    const { search, stage, typeOfSetup, format } = req.query as { search?: string; stage?: string; typeOfSetup?: string; format?: string };
    const conditions: any[] = [];
    if (search) conditions.push(or(like(projects.name, `%${search}%`), like(projects.customerName, `%${search}%`), like(projects.address, `%${search}%`), like(projects.sizeOfSetup, `%${search}%`), like(projects.typeOfSetup, `%${search}%`), like(projects.description, `%${search}%`), like(projects.notes, `%${search}%`)));
    if (stage) conditions.push(eq(projects.stage, stage as any));
    if (typeOfSetup) conditions.push(eq(projects.typeOfSetup, typeOfSetup));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(2000);

    // Get payment data
    const projectIds = rows.map(r => r.id);
    let paymentsMap: Record<number, number> = {};
    if (projectIds.length > 0) {
      const payments = await db.select({ projectId: projectPayments.projectId, total: sql<string>`COALESCE(SUM(${projectPayments.amount}), 0)` }).from(projectPayments).where(inArray(projectPayments.projectId, projectIds)).groupBy(projectPayments.projectId);
      for (const p of payments) paymentsMap[p.projectId] = parseFloat(p.total || "0");
    }

    const columns = [
      { header: "Project Name", key: "name" },
      { header: "Customer", key: "customerName" },
      { header: "Address", key: "address" },
      { header: "Size", key: "sizeOfSetup" },
      { header: "Type", key: "typeOfSetup" },
      { header: "Stage", key: "stage" },
      { header: "Total Amount", key: "totalProjectAmount" },
      { header: "Total Paid", key: "totalPaid" },
      { header: "Payment Status", key: "paymentStatus" },
      { header: "Start Date", key: "startDate" },
      { header: "Date Created", key: "createdAt" },
    ];
    const exportRows = rows.map(r => {
      const totalAmount = parseFloat(r.totalProjectAmount || "0");
      const totalPaid = paymentsMap[r.id] || 0;
      let paymentStatus = "Unpaid";
      if (totalAmount > 0 && totalPaid >= totalAmount) paymentStatus = "Fully Paid";
      else if (totalPaid > 0) paymentStatus = "Partially Paid";
      return {
        name: r.name,
        customerName: r.customerName || "",
        address: r.address || "",
        sizeOfSetup: r.sizeOfSetup || "",
        typeOfSetup: r.typeOfSetup || "",
        stage: r.stage,
        totalProjectAmount: totalAmount > 0 ? `₱${totalAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "",
        totalPaid: totalPaid > 0 ? `₱${totalPaid.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "₱0.00",
        paymentStatus,
        startDate: r.startDate ? new Date(r.startDate).toLocaleDateString() : "",
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "",
      };
    });

    if (format === "pdf") {
      const html = generatePdfHtml("Projects / Project Monitoring Database", columns.map(c => c.header), exportRows.map(r => columns.map(c => (r as any)[c.key])));
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } else {
      const buffer = await generateExcel("Projects", columns, exportRows);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="projects-export.xlsx"`);
      res.send(buffer);
    }
  } catch (error) {
    console.error("Export projects error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

// ============ HELPERS ============
async function generateExcel(sheetName: string, columns: { header: string; key: string }[], rows: Record<string, string>[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JMC Solar CRM";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sheetName);

  // Header row
  worksheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: Math.max(col.header.length + 4, 15),
  }));

  // Style header
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2A4A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 24;

  // Add data rows
  for (const row of rows) {
    worksheet.addRow(row);
  }

  // Style data rows
  for (let i = 2; i <= rows.length + 1; i++) {
    const row = worksheet.getRow(i);
    row.alignment = { vertical: "middle", wrapText: true };
    if (i % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
    }
  }

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    if (column && column.eachCell) {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellLength = cell.value ? cell.value.toString().length : 0;
        if (cellLength > maxLength) maxLength = cellLength;
      });
      column.width = Math.min(Math.max(maxLength + 2, 12), 50);
    }
  });

  return await workbook.xlsx.writeBuffer();
}

function generatePdfHtml(title: string, headers: string[], rows: string[][]) {
  const tableRows = rows.map((row, idx) => {
    const bgColor = idx % 2 === 0 ? "#ffffff" : "#f5f7fa";
    return `<tr style="background:${bgColor}">${row.map(cell => `<td style="padding:6px 8px;border:1px solid #ddd;font-size:10px;white-space:nowrap;">${cell}</td>`).join("")}</tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title} - JMC Solar</title>
<style>
  @media print {
    body { margin: 0; padding: 15px; }
    .no-print { display: none !important; }
    @page { size: landscape; margin: 10mm; }
  }
  body { font-family: Arial, sans-serif; color: #333; padding: 20px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1B2A4A; padding-bottom: 15px; margin-bottom: 20px; }
  .company-info h1 { margin: 0; color: #1B2A4A; font-size: 22px; }
  .company-info p { margin: 2px 0; font-size: 11px; color: #666; }
  .report-title { text-align: center; margin-bottom: 15px; }
  .report-title h2 { margin: 0; color: #1B2A4A; font-size: 16px; }
  .report-title p { margin: 4px 0 0; font-size: 11px; color: #666; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #1B2A4A; color: white; padding: 8px; text-align: left; font-size: 10px; white-space: nowrap; }
  .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  .actions { margin-bottom: 15px; text-align: right; }
  .actions button { padding: 8px 16px; margin-left: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .btn-print { background: #1B2A4A; color: white; }
  .btn-back { background: #e5e7eb; color: #333; }
</style>
</head>
<body>
<div class="no-print actions">
  <button class="btn-back" onclick="window.history.back()">← Back</button>
  <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
</div>
<div class="header">
  <div class="company-info">
    <h1>JMC SOLAR</h1>
    <p>Solar Energy Solutions</p>
    <p>Philippines</p>
  </div>
  <div style="text-align:right;font-size:11px;color:#666;">
    <p>Generated: ${new Date().toLocaleDateString()}</p>
    <p>Records: ${rows.length}</p>
  </div>
</div>
<div class="report-title">
  <h2>${title}</h2>
  <p>Export Date: ${new Date().toLocaleDateString()} | Total Records: ${rows.length}</p>
</div>
<table>
  <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="footer">
  <p>JMC Solar CRM - Confidential | Generated on ${new Date().toLocaleString()}</p>
</div>
</body>
</html>`;
}

export const exportRouter = router;
