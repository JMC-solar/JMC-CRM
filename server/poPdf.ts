import { Router } from "express";
import { getDb } from "./db";
import { purchaseOrders, purchaseOrderItems, suppliers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/api/purchase-orders/:id/pdf", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "Database unavailable" });
      return;
    }

    const id = parseInt(req.params.id);
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
    if (!po) {
      res.status(404).json({ error: "Purchase Order not found" });
      return;
    }

    const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));

    // Get supplier details
    let supplier: any = null;
    if (po.supplierId) {
      const [s] = await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId)).limit(1);
      supplier = s || null;
    }

    const createdByUser = po.createdByName ? { name: po.createdByName } : null;

    const html = generatePoHtml(po, items, supplier, createdByUser);

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="PO-${po.poNumber}.html"`);
    res.send(html);
  } catch (error) {
    console.error("PO PDF generation error:", error);
    res.status(500).json({ error: "Failed to generate PO document" });
  }
});

function generatePoHtml(po: any, items: any[], supplier: any, createdByUser: any) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const total = Number(po.totalAmount || subtotal);
  const vatEnabled = po.vatEnabled === 1 || po.vatEnabled === true;
  const vatRate = parseFloat(po.vatRate || "12");
  const discountType = po.discountType || "none";
  const discountValue = parseFloat(po.discountValue || "0");
  const discountAmount = discountType === "percentage" ? subtotal * (discountValue / 100) : discountType === "fixed" ? discountValue : 0;
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = vatEnabled ? afterDiscount * (vatRate / 100) : 0;
  const poDate = po.orderedAt ? new Date(po.orderedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : new Date(po.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td>
        <strong>${item.itemName || ''}</strong>
        ${item.description ? `<br><span style="color:#555;font-size:11px;">${item.description}</span>` : ''}
        ${item.itemSku ? `<br><span style="color:#777;font-size:10px;">SKU: ${item.itemSku}</span>` : ''}
      </td>
      <td style="text-align:center;">${item.quantity}</td>
      <td style="text-align:center;">${item.unit || 'pc'}</td>
      <td style="text-align:right;">₱${Number(item.unitPrice || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="text-align:right;">₱${Number(item.lineTotal || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order - ${po.poNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      color: #333;
      line-height: 1.5;
      padding: 20px;
      background: #fff;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #ddd;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1B2A4A;
      padding-bottom: 20px;
      margin-bottom: 25px;
    }
    .company-info .company-logo {
      height: 50px;
      width: auto;
      margin-bottom: 8px;
    }
    .company-info h1 {
      font-size: 22px;
      color: #1B2A4A;
      margin-bottom: 4px;
      font-weight: 700;
    }
    .company-info p {
      font-size: 11px;
      color: #555;
      line-height: 1.6;
    }
    .po-title {
      text-align: right;
    }
    .po-title h2 {
      font-size: 26px;
      color: #1B2A4A;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .po-title .po-number {
      font-size: 14px;
      color: #4A7CC9;
      font-weight: 600;
      margin-top: 4px;
    }
    .po-title .po-date {
      font-size: 11px;
      color: #666;
      margin-top: 2px;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 25px;
      gap: 30px;
    }
    .details-box {
      flex: 1;
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 15px;
    }
    .details-box h3 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #1B2A4A;
      margin-bottom: 8px;
      font-weight: 700;
      border-bottom: 1px solid #dee2e6;
      padding-bottom: 5px;
    }
    .details-box p {
      font-size: 11px;
      color: #444;
      margin-bottom: 3px;
    }
    .details-box p strong {
      color: #222;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .items-table thead th {
      background: #1B2A4A;
      color: #fff;
      padding: 10px 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .items-table tbody td {
      padding: 10px 8px;
      border-bottom: 1px solid #e9ecef;
      font-size: 11px;
      vertical-align: top;
    }
    .items-table tbody tr:nth-child(even) {
      background: #f8f9fa;
    }
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    .totals-box {
      width: 280px;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      overflow: hidden;
    }
    .totals-box .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 15px;
      font-size: 11px;
      border-bottom: 1px solid #e9ecef;
    }
    .totals-box .total-row:last-child {
      border-bottom: none;
    }
    .totals-box .total-row.grand-total {
      background: #1B2A4A;
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      padding: 12px 15px;
    }
    .terms-section {
      margin-bottom: 30px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
      border: 1px solid #e9ecef;
    }
    .terms-section h3 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #1B2A4A;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .terms-section p {
      font-size: 11px;
      color: #444;
      margin-bottom: 3px;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 50px;
      gap: 30px;
    }
    .signature-block {
      flex: 1;
      text-align: center;
    }
    .signature-block .line {
      border-top: 1px solid #333;
      margin-top: 50px;
      padding-top: 8px;
    }
    .signature-block .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
      font-weight: 600;
    }
    .signature-block .name {
      font-size: 11px;
      color: #222;
      font-weight: 600;
      margin-top: 4px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 15px;
      border-top: 1px solid #dee2e6;
      text-align: center;
      font-size: 9px;
      color: #999;
    }
    .no-print { margin-bottom: 20px; text-align: center; }
    .no-print button {
      padding: 10px 24px;
      margin: 0 8px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-print {
      background: #1B2A4A;
      color: #fff;
    }
    .btn-print:hover { background: #2a3f6a; }
    .btn-back {
      background: #e9ecef;
      color: #333;
    }
    .btn-back:hover { background: #dee2e6; }
    @media print {
      body { padding: 0; }
      .container { border: none; padding: 20px; }
      .no-print { display: none !important; }
      .items-table thead th { background: #1B2A4A !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .items-table tbody tr:nth-child(even) { background: #f8f9fa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .totals-box .total-row.grand-total { background: #1B2A4A !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print</button>
    <button class="btn-back" onclick="window.close()">← Close</button>
  </div>

  <div class="container">
    <div class="header">
      <div class="company-info">
        <img src="/images/jmc-solar-logo.png" alt="JMC Solar" class="company-logo" />
        <h1>JMC SOLAR</h1>
        <p>Solar Energy Solutions</p>
        <p>Lilia Ave., Cogon, Ormoc City</p>
        <p>Phone: 0917 508 8220 | Email: jmcsolarph@gmail.com</p>
      </div>
      <div class="po-title">
        <h2>PURCHASE ORDER</h2>
        <div class="po-number">${po.poNumber}</div>
        <div class="po-date">${poDate}</div>
      </div>
    </div>

    <div class="details-row">
      <div class="details-box">
        <h3>Supplier Information</h3>
        <p><strong>${supplier?.name || po.supplier}</strong></p>
        ${supplier?.contactPerson ? `<p>Attn: ${supplier.contactPerson}</p>` : ''}
        ${supplier?.address ? `<p>${supplier.address}${supplier.city ? `, ${supplier.city}` : ''}</p>` : ''}
        ${supplier?.phone ? `<p>Tel: ${supplier.phone}</p>` : ''}
        ${supplier?.email ? `<p>Email: ${supplier.email}</p>` : ''}
      </div>
      <div class="details-box">
        <h3>Order Details</h3>
        <p><strong>PO Number:</strong> ${po.poNumber}</p>
        <p><strong>Date:</strong> ${poDate}</p>
        <p><strong>Status:</strong> ${po.status.replace('_', ' ').toUpperCase()}</p>
        <p><strong>Delivery Status:</strong> ${po.deliveryStatus.replace(/_/g, ' ').toUpperCase()}</p>
        ${createdByUser ? `<p><strong>Prepared by:</strong> ${createdByUser.name || createdByUser.email || 'N/A'}</p>` : ''}
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:5%;text-align:center;">#</th>
          <th style="width:40%;">Item Description</th>
          <th style="width:10%;text-align:center;">Qty</th>
          <th style="width:10%;text-align:center;">Unit</th>
          <th style="width:15%;text-align:right;">Unit Price</th>
          <th style="width:15%;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${items.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">No items</td></tr>' : ''}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span>Subtotal</span>
          <span>₱${subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        ${discountAmount > 0 ? `
        <div class="total-row">
          <span>Discount ${discountType === "percentage" ? `(${discountValue}%)` : "(Fixed)"}</span>
          <span style="color:#c0392b;">-₱${discountAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        ` : ''}
        ${vatEnabled ? `
        <div class="total-row">
          <span>VAT (${vatRate}%)</span>
          <span>₱${vatAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        ` : ''}
        <div class="total-row grand-total">
          <span>GRAND TOTAL</span>
          <span>₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>

    ${(po.notes || supplier?.paymentTerms) ? `
    <div class="terms-section">
      <h3>Terms & Notes</h3>
      ${supplier?.paymentTerms ? `<p><strong>Payment Terms:</strong> ${supplier.paymentTerms}</p>` : ''}
      ${po.notes ? `<p><strong>Notes:</strong> ${po.notes}</p>` : ''}
    </div>
    ` : ''}

    <div class="signatures">
      <div class="signature-block">
        <div class="line">
          <div class="label">Prepared by</div>
          ${createdByUser ? `<div class="name">${createdByUser.name || ''}</div>` : ''}
        </div>
      </div>
      <div class="signature-block">
        <div class="line">
          <div class="label">Approved by</div>
        </div>
      </div>
      <div class="signature-block">
        <div class="line">
          <div class="label">Received by (Supplier)</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>This is a computer-generated document. JMC Solar &mdash; Solar Energy Solutions & Services</p>
    </div>
  </div>
</body>
</html>`;
}

export { router as poPdfRouter };
