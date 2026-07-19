import { Router } from "express";
import { getById, listAll } from "./firestore";
import type { RetailSale, RetailSaleItem, Contact } from "./models";
import { requireAuth } from "./_core/requireAuth";

const router = Router();

/** "First Last" for a contact, trimmed; a missing lastName is dropped rather than left as a trailing space. */
function personName(p: { firstName: string; lastName: string | null }): string | null {
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || null;
}

router.get("/api/retail-sales/:id/pdf", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await getById<RetailSale>("retail_sales", id);
    if (!sale) {
      res.status(404).json({ error: "Retail sale not found" });
      return;
    }

    const [contact, items] = await Promise.all([
      getById<Contact>("contacts", sale.contactId),
      listAll<RetailSaleItem>("retail_sale_items", { where: [["retailSaleId", "==", id]] }),
    ]);

    const customerName = (contact ? personName(contact) : null) ?? sale.customerName ?? `Customer #${sale.contactId}`;

    const html = generateReceiptHtml(sale, items, contact, customerName);

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="Receipt-RS-${sale.id}.html"`);
    res.send(html);
  } catch (error) {
    console.error("Retail sale PDF generation error:", error);
    res.status(500).json({ error: "Failed to generate receipt document" });
  }
});

function generateReceiptHtml(sale: any, items: any[], contact: any, customerName: string) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const total = Number(sale.totalAmount || subtotal);
  const saleDate = new Date(sale.saleDate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td>
        <strong>${item.itemName || ''}</strong>
        ${item.itemSku ? `<br><span style="color:#777;font-size:10px;">SKU: ${item.itemSku}</span>` : ''}
      </td>
      <td style="text-align:center;">${item.quantity}${item.unit ? ` ${item.unit}` : ''}</td>
      <td style="text-align:right;">₱${Number(item.unitPrice || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="text-align:right;">₱${Number(item.lineTotal || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acknowledgement Receipt - RS-${sale.id}</title>
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
    .doc-title {
      text-align: right;
    }
    .doc-title h2 {
      font-size: 22px;
      color: #1B2A4A;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .doc-title .doc-number {
      font-size: 14px;
      color: #4A7CC9;
      font-weight: 600;
      margin-top: 4px;
    }
    .doc-title .doc-date {
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
    .notes-section {
      margin-bottom: 30px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
      border: 1px solid #e9ecef;
    }
    .notes-section h3 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #1B2A4A;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .notes-section p {
      font-size: 11px;
      color: #444;
      margin-bottom: 3px;
    }
    .ack-statement {
      margin-bottom: 40px;
      font-size: 11px;
      color: #444;
      line-height: 1.7;
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
      <div class="doc-title">
        <h2>ACKNOWLEDGEMENT RECEIPT</h2>
        <div class="doc-number">RS-${sale.id}</div>
        <div class="doc-date">${saleDate}</div>
      </div>
    </div>

    <div class="details-row">
      <div class="details-box">
        <h3>Customer Information</h3>
        <p><strong>${customerName}</strong></p>
        ${contact?.address ? `<p>${contact.address}${contact.city ? `, ${contact.city}` : ''}</p>` : ''}
        ${contact?.phone ? `<p>Tel: ${contact.phone}</p>` : ''}
        ${contact?.email ? `<p>Email: ${contact.email}</p>` : ''}
      </div>
      <div class="details-box">
        <h3>Sale Details</h3>
        <p><strong>Receipt No.:</strong> RS-${sale.id}</p>
        <p><strong>Date:</strong> ${saleDate}</p>
        ${sale.createdByName ? `<p><strong>Issued by:</strong> ${sale.createdByName}</p>` : ''}
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:5%;text-align:center;">#</th>
          <th style="width:45%;">Item Description</th>
          <th style="width:15%;text-align:center;">Qty</th>
          <th style="width:15%;text-align:right;">Unit Price</th>
          <th style="width:20%;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${items.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999;">No items</td></tr>' : ''}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span>Subtotal</span>
          <span>₱${subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="total-row grand-total">
          <span>TOTAL RECEIVED</span>
          <span>₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>

    ${sale.notes ? `
    <div class="notes-section">
      <h3>Notes</h3>
      <p>${sale.notes}</p>
    </div>
    ` : ''}

    <div class="ack-statement">
      This acknowledges that the above-listed items were received by the customer in good order and condition on the date stated above, in exchange for the total amount indicated.
    </div>

    <div class="signatures">
      <div class="signature-block">
        <div class="line">
          <div class="label">Received by (Customer)</div>
          <div class="name">${customerName}</div>
        </div>
      </div>
      <div class="signature-block">
        <div class="line">
          <div class="label">Issued by (JMC Solar)</div>
          ${sale.createdByName ? `<div class="name">${sale.createdByName}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="footer">
      <p>This document is not valid for claiming input tax.</p>
      <p>This is a computer-generated document. JMC Solar &mdash; Solar Energy Solutions & Services</p>
    </div>
  </div>
</body>
</html>`;
}

export { router as retailPdfRouter };
