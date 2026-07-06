import { Router } from "express";
import { getDb } from "./db";
import { quotations, quotationItems, accounts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/api/quotations/:id/pdf", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "Database unavailable" });
      return;
    }

    const id = parseInt(req.params.id);
    const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
    if (!quotation) {
      res.status(404).json({ error: "Quotation not found" });
      return;
    }

    // Get account name if linked
    let accountName = "";
    if (quotation.accountId) {
      const [acct] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, quotation.accountId)).limit(1);
      accountName = acct?.name || "";
    }

    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id));

    const html = generateQuotationHtml({ ...quotation, accountName }, items);
    
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="quotation-${quotation.quoteNumber}.html"`);
    res.send(html);
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

function getLogoUrl(): string {
  return "/images/jmc-solar-logo.png";
}

function generateQuotationHtml(quotation: any, items: any[]) {
  const inventoryItems = items.filter(i => i.itemType === "inventory");
  const laborItems = items.filter(i => i.itemType === "labor");
  const customItems = items.filter(i => i.itemType === "custom");

  const subtotal = items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  const discountPercent = Number(quotation.discountPercent || 0);
  const discountManualAmount = Number(quotation.discountManualAmount || 0);
  const percentDiscountValue = discountPercent > 0 ? subtotal * discountPercent / 100 : 0;
  const discountAmount = Number(quotation.discountAmount || 0);
  const vatEnabled = !!quotation.vatEnabled;
  const taxPercent = Number(quotation.taxPercent || 0);
  const taxAmount = vatEnabled ? Number(quotation.taxAmount || 0) : 0;
  const laborCost = Number(quotation.laborCost || 0);
  const installationFee = Number(quotation.installationFee || 0);
  const total = Number(quotation.totalAmount || subtotal - discountAmount + taxAmount + laborCost + installationFee);

  const quoteDate = new Date(quotation.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const validUntilDate = quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quotation ${quotation.quoteNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #1B2A4A; padding: 0; background: #f1f5f9; }
    .page-wrapper { max-width: 800px; margin: 0 auto; padding: 20px; }
    .document { background: white; padding: 50px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    /* Action bar */
    .action-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding: 16px 20px; background: white; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
    .btn-print { background: #1B2A4A; color: white; }
    .btn-print:hover { background: #2d4a7a; }
    .btn-pdf { background: #4A7CC9; color: white; }
    .btn-pdf:hover { background: #3a6ab5; }
    .pdf-hint { font-size: 12px; color: #666; margin-left: auto; }
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 35px; padding-bottom: 20px; border-bottom: 3px solid #4A7CC9; }
    .company-info { }
    .company-info .company-logo { height: 50px; width: auto; margin-bottom: 8px; }
    .company-info h1 { font-size: 26px; color: #1B2A4A; font-weight: 800; letter-spacing: -0.5px; }
    .company-info .tagline { color: #4A7CC9; font-size: 12px; margin-top: 2px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; }
    .company-info .contact-details { margin-top: 10px; font-size: 11px; color: #666; line-height: 1.6; }
    .doc-meta { text-align: right; }
    .doc-meta .doc-type { font-size: 20px; font-weight: 700; color: #1B2A4A; text-transform: uppercase; letter-spacing: 0.5px; }
    .doc-meta .doc-number { font-size: 14px; color: #4A7CC9; font-weight: 600; margin-top: 4px; }
    .doc-meta .doc-date { font-size: 12px; color: #666; margin-top: 4px; }
    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-box { background: #f8fafc; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .info-box h3 { font-size: 10px; text-transform: uppercase; color: #64748b; margin-bottom: 10px; letter-spacing: 0.8px; font-weight: 700; }
    .info-box p { font-size: 13px; margin-bottom: 4px; line-height: 1.5; }
    .info-box p strong { color: #1B2A4A; }
    /* Table */
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    thead th { background: #1B2A4A; color: white; padding: 12px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    thead th:first-child { border-radius: 6px 0 0 0; }
    thead th:last-child { border-radius: 0 6px 0 0; }
    tbody td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    tbody tr:hover { background: #f8fafc; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr.labor-row { background: #fffbeb; }
    tbody tr.labor-row td { color: #92400e; }
    tbody tr.custom-row { background: #faf5ff; }
    tbody tr.custom-row td { color: #6b21a8; }
    .type-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-left: 8px; text-transform: uppercase; }
    .labor-badge { background: #fef3c7; color: #92400e; }
    .custom-badge { background: #f3e8ff; color: #6b21a8; }
    /* Totals */
    .totals { margin-top: 20px; display: flex; justify-content: flex-end; }
    .totals-table { width: 300px; }
    .totals-table tr td { padding: 8px 16px; font-size: 13px; }
    .totals-table tr.total td { font-weight: 700; font-size: 15px; border-top: 2px solid #1B2A4A; padding-top: 12px; }
    .vat-row td { color: #059669; font-weight: 500; }
    /* Terms */
    .terms-section { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .terms-section h3 { font-size: 11px; font-weight: 700; color: #4A7CC9; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .terms-section p { font-size: 13px; color: #555; line-height: 1.6; white-space: pre-line; margin-bottom: 16px; }
    /* Signatures */
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
    .sig-block { text-align: center; }
    .sig-space { height: 60px; }
    .sig-line { border-top: 1px solid #1B2A4A; padding-top: 8px; font-size: 12px; color: #64748b; }
    .sig-name { font-size: 13px; font-weight: 600; color: #1B2A4A; margin-top: 4px; }
    /* Footer */
    .doc-footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .doc-footer p { font-size: 11px; color: #94a3b8; line-height: 1.6; }
    .doc-footer .company-name { font-weight: 600; color: #64748b; }
    /* Print styles */
    @media print {
      body { background: white; padding: 0; }
      .page-wrapper { padding: 0; max-width: none; }
      .document { box-shadow: none; padding: 30px; border-radius: 0; }
      .no-print { display: none !important; }
      .header { border-bottom-color: #1B2A4A; }
      thead th { background: #1B2A4A !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .info-box { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page { margin: 15mm; size: A4; }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="action-bar no-print">
      <button class="btn btn-print" onclick="window.print()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print
      </button>
      <button class="btn btn-pdf" onclick="window.print()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Save as PDF
      </button>
      <span class="pdf-hint">Use "Save as PDF" in print dialog to download</span>
    </div>

    <div class="document">
      <div class="header">
        <div class="company-info">
          <img src="${getLogoUrl()}" alt="JMC Solar" class="company-logo" />
          <h1>JMC SOLAR</h1>
          <div class="tagline">Solar Energy Solutions</div>
          <div class="contact-details">
            Lilia Ave., Cogon, Ormoc City<br>
            Phone: 0917 508 8220 | Email: jmcsolarph@gmail.com
          </div>
        </div>
        <div class="doc-meta">
          <div class="doc-type">Quotation</div>
          <div class="doc-number">${quotation.quoteNumber}</div>
          <div class="doc-date">${quoteDate}</div>
          ${validUntilDate ? `<div class="doc-date">Valid until: ${validUntilDate}</div>` : ''}
        </div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <h3>Customer Information</h3>
          ${quotation.customerName ? `<p><strong>${quotation.customerName}</strong></p>` : ''}
          ${quotation.accountId ? `<p><strong>Account:</strong> ${(quotation as any).accountName || 'Account #' + quotation.accountId}</p>` : ''}
          ${quotation.customerEmail ? `<p><strong>Email:</strong> ${quotation.customerEmail}</p>` : ''}
          ${quotation.customerPhone ? `<p><strong>Phone:</strong> ${quotation.customerPhone}</p>` : ''}
          ${quotation.customerAddress ? `<p><strong>Address:</strong> ${quotation.customerAddress}</p>` : ''}
        </div>
        <div class="info-box">
          <h3>Project Details</h3>
          <p><strong>Project:</strong> ${quotation.title || '-'}</p>
          <p><strong>Status:</strong> ${(quotation.status || '').replace('_', ' ').toUpperCase()}</p>
          ${quotation.createdByName ? `<p><strong>Prepared by:</strong> ${quotation.createdByName}</p>` : ''}
        </div>
      </div>

      ${items.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">#</th>
            <th>Description</th>
            <th style="width: 60px; text-align: center;">Qty</th>
            <th style="width: 110px; text-align: right;">Unit Price</th>
            <th style="width: 110px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${inventoryItems.map((item, i) => `
          <tr>
            <td style="text-align: center; color: #64748b;">${i + 1}</td>
            <td>${item.description}</td>
            <td style="text-align: center;">${item.quantity}</td>
            <td style="text-align: right;">\u20B1${Number(item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
            <td style="text-align: right;">\u20B1${Number(item.totalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
          </tr>`).join('')}
          ${laborItems.map((item, i) => `
          <tr class="labor-row">
            <td style="text-align: center; color: #64748b;">${inventoryItems.length + i + 1}</td>
            <td>${item.description}<span class="type-badge labor-badge">Labor</span></td>
            <td style="text-align: center;">-</td>
            <td style="text-align: right;">\u20B1${Number(item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
            <td style="text-align: right;">\u20B1${Number(item.totalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
          </tr>`).join('')}
          ${customItems.map((item, i) => `
          <tr class="custom-row">
            <td style="text-align: center; color: #64748b;">${inventoryItems.length + laborItems.length + i + 1}</td>
            <td>${item.description}<span class="type-badge custom-badge">Misc</span></td>
            <td style="text-align: center;">-</td>
            <td style="text-align: right;">\u20B1${Number(item.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
            <td style="text-align: right;">\u20B1${Number(item.totalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ` : '<p style="color:#94a3b8;font-style:italic;">No line items added yet.</p>'}

      <div class="totals">
        <table class="totals-table">
          <tr><td>Subtotal</td><td style="text-align:right">\u20B1${subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
          ${discountPercent > 0 ? `<tr><td>Discount (${discountPercent}%)</td><td style="text-align:right;color:#ef4444">-\u20B1${percentDiscountValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>` : ''}
          ${discountManualAmount > 0 ? `<tr><td>Manual Discount</td><td style="text-align:right;color:#ef4444">-\u20B1${discountManualAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>` : ''}
          ${discountAmount > 0 && !discountPercent && !discountManualAmount ? `<tr><td>Discount</td><td style="text-align:right;color:#ef4444">-\u20B1${discountAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>` : ''}
          ${laborCost > 0 ? `<tr><td>Labor Cost</td><td style="text-align:right">\u20B1${laborCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>` : ''}
          ${installationFee > 0 ? `<tr><td>Installation Fee</td><td style="text-align:right">\u20B1${installationFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>` : ''}
          ${vatEnabled && taxAmount > 0 ? `<tr class="vat-row"><td>VAT (${taxPercent}%)</td><td style="text-align:right">\u20B1${taxAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>` : ''}
          <tr class="total"><td>Grand Total</td><td style="text-align:right">\u20B1${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      ${quotation.paymentTerms || quotation.warrantyTerms || quotation.notes ? `
      <div class="terms-section">
        ${quotation.paymentTerms ? `<h3>Payment Terms</h3><p>${quotation.paymentTerms}</p>` : ''}
        ${quotation.warrantyTerms ? `<h3>Warranty Terms</h3><p>${quotation.warrantyTerms}</p>` : ''}
        ${quotation.notes ? `<h3>Notes</h3><p>${quotation.notes}</p>` : ''}
      </div>
      ` : ''}

      <div class="signature-grid">
        <div class="sig-block">
          <div class="sig-space"></div>
          <div class="sig-line">Prepared by</div>
          ${quotation.createdByName ? `<div class="sig-name">${quotation.createdByName}</div>` : ''}
        </div>
        <div class="sig-block">
          <div class="sig-space"></div>
          <div class="sig-line">Conforme / Customer</div>
        </div>
      </div>

      <div class="doc-footer">
        <p><span class="company-name">JMC Solar</span> &mdash; Powering the Future with Clean Energy</p>
        <p>This quotation is computer-generated and valid without signature.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export { router as quotationPdfRouter };
