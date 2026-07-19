import { Router } from "express";
import { getById, listAll } from "./firestore";
import type {
  DeliveryReceipt,
  AcknowledgementReceipt,
  QuotationItem,
  SpecialQuotation,
  Project,
  Quotation,
  ProjectPayment,
  NetMeteringPayment,
  NetMetering,
} from "./models";
import { requireAuth } from "./_core/requireAuth";

const router = Router();

// Delivery Receipt printable HTML
router.get("/api/delivery-receipts/:id/print", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dr = await getById<DeliveryReceipt>("delivery_receipts", id);
    if (!dr) { res.status(404).json({ error: "Delivery Receipt not found" }); return; }

    // Get quotation items for this DR
    const items = dr.quotationId
      ? await listAll<QuotationItem>("quotation_items", { where: [["quotationId", "==", dr.quotationId]] })
      : [];

    const html = generateDeliveryReceiptHtml(dr, items);
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="delivery-receipt-${dr.receiptNumber}.html"`);
    res.send(html);
  } catch (error) {
    console.error("DR generation error:", error);
    res.status(500).json({ error: "Failed to generate Delivery Receipt" });
  }
});

// Acknowledgement Receipt printable HTML - Enhanced with full details
router.get("/api/acknowledgement-receipts/:id/print", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const ack = await getById<AcknowledgementReceipt>("acknowledgement_receipts", id);
    if (!ack) { res.status(404).json({ error: "Acknowledgement Receipt not found" }); return; }

    // Fetch full project/quotation details based on type
    let projectData: Project | null = null;
    let quotationData: Quotation | null = null;
    let quotationItemsData: QuotationItem[] = [];
    let allPayments: (ProjectPayment | NetMeteringPayment)[] = [];
    let totalProjectAmount: number = 0;
    let nmData: NetMetering | null = null;

    if (ack.type === "project_payment") {
      // Fetch the project
      const project = await getById<Project>("projects", ack.referenceId);
      if (project) {
        projectData = project;
        totalProjectAmount = Number(project.totalProjectAmount || 0);

        // Fetch quotation items if project has a linked quotation
        if (project.quotationId) {
          const quot = await getById<Quotation>("quotations", project.quotationId);
          if (quot) {
            quotationData = quot;
            quotationItemsData = await listAll<QuotationItem>("quotation_items", { where: [["quotationId", "==", quot.id]] });
          }
        }

        // Fetch all payments for this project up to and including this payment
        allPayments = await listAll<ProjectPayment>("project_payments", { where: [["projectId", "==", project.id]] });
      }
    } else if (ack.type === "net_metering_payment") {
      // referenceId is the netMeteringPayment ID - find the NM record
      const nmPayment = await getById<NetMeteringPayment>("net_metering_payments", ack.referenceId);
      if (nmPayment) {
        // Get the net metering record
        const nm = await getById<NetMetering>("net_metering", nmPayment.netMeteringId);
        if (nm) {
          nmData = nm;
          // Get the project if linked
          if (nm.projectId) {
            const project = await getById<Project>("projects", nm.projectId);
            if (project) {
              projectData = project;
              totalProjectAmount = Number(project.totalProjectAmount || 0);
              if (project.quotationId) {
                const quot = await getById<Quotation>("quotations", project.quotationId);
                if (quot) {
                  quotationData = quot;
                  quotationItemsData = await listAll<QuotationItem>("quotation_items", { where: [["quotationId", "==", quot.id]] });
                }
              }
            }
          }
          // Get all NM payments for this NM record
          allPayments = await listAll<NetMeteringPayment>("net_metering_payments", { where: [["netMeteringId", "==", nm.id]] });
        }
      }
    } else if (ack.type === "quotation") {
      // Fetch quotation directly
      const quot = await getById<Quotation>("quotations", ack.referenceId);
      if (quot) {
        quotationData = quot;
        totalProjectAmount = Number(quot.totalAmount || 0);
        quotationItemsData = await listAll<QuotationItem>("quotation_items", { where: [["quotationId", "==", quot.id]] });
      }
    }

    const html = generateAcknowledgementHtml(ack, {
      projectData,
      quotationData,
      quotationItemsData,
      allPayments,
      totalProjectAmount,
      nmData,
    });
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="acknowledgement-${ack.receiptNumber}.html"`);
    res.send(html);
  } catch (error) {
    console.error("Acknowledgement generation error:", error);
    res.status(500).json({ error: "Failed to generate Acknowledgement Receipt" });
  }
});

function formatPHP(amount: number | string | null): string {
  const num = Number(amount || 0);
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getActionButtons(): string {
  return `
    <div class="action-bar no-print">
      <button onclick="window.print()" class="btn btn-print">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print
      </button>
      <button onclick="window.print()" class="btn btn-pdf">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Save as PDF
      </button>
      <p class="pdf-hint">To save as PDF: Click "Save as PDF" or use Print → Change destination to "Save as PDF"</p>
    </div>
  `;
}

function getCommonStyles(): string {
  return `
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
    .table-footer { background: #f8fafc; }
    .table-footer td { font-weight: 600; border-top: 2px solid #e2e8f0; }
    
    /* Notes */
    .notes-section { background: #fffbeb; padding: 16px 20px; border-radius: 8px; border: 1px solid #fde68a; margin-bottom: 30px; }
    .notes-section h3 { font-size: 11px; color: #92400e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
    .notes-section p { font-size: 13px; color: #78350f; line-height: 1.5; }
    
    /* Signatures */
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; }
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
      .notes-section { background: #fffbeb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    
    @page { margin: 15mm; size: A4; }
  `;
}

function getLogoUrl(): string {
  return "/images/jmc-solar-logo.png";
}

function generateDeliveryReceiptHtml(dr: any, items: any[]) {
  const inventoryItems = items.filter(i => i.itemType === "inventory" || !i.itemType);
  const itemRows = inventoryItems.map((item, i) => `
    <tr>
      <td style="text-align: center; color: #64748b;">${i + 1}</td>
      <td><strong>${item.description || item.itemName || "-"}</strong></td>
      <td style="text-align: center;">${item.quantity || 1}</td>
      <td style="text-align: center;">${item.unit || "pcs"}</td>
    </tr>
  `).join("");

  const deliveryDate = dr.deliveryDate 
    ? new Date(dr.deliveryDate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) 
    : new Date(dr.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Delivery Receipt - ${dr.receiptNumber}</title>
  <style>${getCommonStyles()}
    .company-logo { height: 50px; width: auto; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="page-wrapper">
    ${getActionButtons()}
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
          <div class="doc-type">Delivery Receipt</div>
          <div class="doc-number">${dr.receiptNumber}</div>
          <div class="doc-date">${deliveryDate}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <h3>Delivered To</h3>
          <p><strong>${dr.customerName || "-"}</strong></p>
          <p>${dr.customerAddress || ""}</p>
        </div>
        <div class="info-box">
          <h3>Delivery Details</h3>
          <p><strong>Project:</strong> ${dr.projectReference || "-"}</p>
          <p><strong>Date:</strong> ${deliveryDate}</p>
          <p><strong>Prepared by:</strong> ${dr.createdByName || "-"}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">#</th>
            <th>Item Description</th>
            <th style="width: 80px; text-align: center;">Qty</th>
            <th style="width: 80px; text-align: center;">Unit</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8;">No items listed</td></tr>'}
          <tr class="table-footer">
            <td colspan="2" style="text-align: right;">Total Items:</td>
            <td style="text-align: center;">${inventoryItems.reduce((sum, i) => sum + (i.quantity || 1), 0)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      ${dr.notes ? `<div class="notes-section"><h3>Notes / Remarks</h3><p>${dr.notes}</p></div>` : ""}

      <div class="signature-grid">
        <div class="sig-block">
          <div class="sig-space"></div>
          <div class="sig-line">Delivered By</div>
          <div class="sig-name">${dr.createdByName || ""}</div>
        </div>
        <div class="sig-block">
          <div class="sig-space"></div>
          <div class="sig-line">Received By (Customer)</div>
          <div class="sig-name">${dr.customerName || ""}</div>
        </div>
      </div>

      <div class="doc-footer">
        <p class="company-name">JMC Solar Energy Solutions</p>
        <p>This document acknowledges the delivery of the items listed above.</p>
        <p>Please inspect all items upon receipt and report any discrepancies immediately.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function generateAcknowledgementHtml(ack: any, context: {
  projectData: any;
  quotationData: any;
  quotationItemsData: any[];
  allPayments: any[];
  totalProjectAmount: number;
  nmData: any;
}) {
  const { projectData, quotationData, quotationItemsData, allPayments, totalProjectAmount, nmData } = context;

  const typeLabel = ack.type === "quotation" 
    ? "Quotation Acknowledgement" 
    : ack.type === "net_metering_payment" 
      ? "Net Metering Payment Receipt" 
      : "Project Payment Receipt";

  const accentColor = ack.type === "quotation" ? "#4A7CC9" : "#16a34a";

  const paymentDate = ack.paymentDate 
    ? new Date(ack.paymentDate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) 
    : "";
  const issuedDate = new Date(ack.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  // Calculate total payments received
  const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const currentPayment = Number(ack.amount || 0);
  const balance = totalProjectAmount - totalPaid;

  // Build itemized breakdown rows
  const equipmentItems = quotationItemsData.filter(i => i.itemType === "inventory" || !i.itemType);
  const laborItems = quotationItemsData.filter(i => i.itemType === "labor");
  const customItems = quotationItemsData.filter(i => i.itemType === "custom");

  const itemRows = quotationItemsData.map((item, i) => {
    const typeTag = item.itemType === "labor" ? '<span style="color: #7c3aed; font-size: 9px; font-weight: 600;">[LABOR]</span> ' 
      : item.itemType === "custom" ? '<span style="color: #d97706; font-size: 9px; font-weight: 600;">[MISC]</span> ' 
      : '';
    return `
    <tr>
      <td style="text-align: center; color: #64748b;">${i + 1}</td>
      <td>${typeTag}${escapeHtml(item.description || "-")}</td>
      <td style="text-align: center;">${item.itemType === "labor" || item.itemType === "custom" ? "-" : (item.quantity || 1)}</td>
      <td style="text-align: right;">${item.itemType === "labor" || item.itemType === "custom" ? "-" : formatPHP(item.unitPrice)}</td>
      <td style="text-align: right;">${formatPHP(item.totalPrice)}</td>
    </tr>`;
  }).join("");

  // Build payment history rows
  const paymentRows = allPayments.map((p, i) => {
    const pDate = p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "-";
    const isCurrentPayment = Number(p.amount) === currentPayment && 
      p.paymentDate && ack.paymentDate && 
      new Date(p.paymentDate).toDateString() === new Date(ack.paymentDate).toDateString();
    const highlight = isCurrentPayment ? ' style="background: #f0fdf4;"' : '';
    return `
    <tr${highlight}>
      <td style="text-align: center; color: #64748b;">${i + 1}</td>
      <td>${pDate}</td>
      <td style="text-align: right;">${formatPHP(p.amount)}</td>
      <td>${p.paymentMethod || "-"}</td>
      <td>${p.paymentReference || "-"}</td>
    </tr>`;
  }).join("");

  // Project/customer details section
  const customerName = ack.customerName || projectData?.customerName || quotationData?.customerName || "-";
  const customerAddress = projectData?.address || quotationData?.customerAddress || "";
  const projectName = projectData?.name || ack.projectReference || quotationData?.title || "-";
  const setupType = projectData?.typeOfSetup || nmData?.typeOfSetup || "";
  const systemSize = projectData?.sizeOfSetup || nmData?.sizeOfSetup || "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Acknowledgement Receipt - ${ack.receiptNumber}</title>
  <style>
    ${getCommonStyles()}
    .company-logo { height: 50px; width: auto; margin-bottom: 8px; }
    .header { border-bottom-color: ${accentColor}; }
    .doc-meta .doc-number { color: ${accentColor}; }
    
    .section-title { font-size: 12px; font-weight: 700; color: #1B2A4A; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid ${accentColor}; }
    
    .amount-box { text-align: center; padding: 20px; margin: 25px 0; border: 2px solid ${accentColor}; border-radius: 10px; background: ${accentColor}08; }
    .amount-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; }
    .amount-value { font-size: 32px; font-weight: 800; color: ${accentColor}; letter-spacing: -0.5px; }
    
    .financial-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .fin-item { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; }
    .fin-item:nth-child(odd) { border-right: 1px solid #f1f5f9; }
    .fin-item .fin-label { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 4px; }
    .fin-item .fin-value { font-size: 16px; font-weight: 700; color: #1B2A4A; }
    .fin-item.highlight { background: #f0fdf4; }
    .fin-item.highlight .fin-value { color: ${accentColor}; }
    .fin-item.balance { background: #fef3c7; }
    .fin-item.balance .fin-value { color: #d97706; }
    
    .ack-text { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center; }
    .ack-text p { font-size: 14px; color: #166534; line-height: 1.6; }
    
    @media print {
      .header { border-bottom-color: ${accentColor} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .amount-box { border-color: ${accentColor} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .amount-value { color: ${accentColor} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .financial-summary { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .fin-item.highlight { background: #f0fdf4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .fin-item.balance { background: #fef3c7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page-wrapper">
    ${getActionButtons()}
    <div class="document">
      <!-- Header -->
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
          <div class="doc-type">Acknowledgement Receipt</div>
          <div class="doc-number">${ack.receiptNumber}</div>
          <div class="doc-date">${issuedDate}</div>
        </div>
      </div>

      <p style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 20px; font-weight: 600;">${typeLabel}</p>

      <!-- Customer & Project Details -->
      <div class="info-grid">
        <div class="info-box">
          <h3>Customer Details</h3>
          <p><strong>${escapeHtml(customerName)}</strong></p>
          ${customerAddress ? `<p>${escapeHtml(customerAddress)}</p>` : ""}
        </div>
        <div class="info-box">
          <h3>Project Details</h3>
          <p><strong>${escapeHtml(projectName)}</strong></p>
          ${setupType ? `<p><strong>Type:</strong> ${escapeHtml(setupType)}</p>` : ""}
          ${systemSize ? `<p><strong>System Size:</strong> ${escapeHtml(systemSize)}</p>` : ""}
          ${nmData ? `<p><strong>Electric Company:</strong> ${escapeHtml(nmData.electricCompany || "-")}</p>` : ""}
        </div>
      </div>

      <!-- Current Payment Amount -->
      ${ack.amount ? `
      <div class="amount-box">
        <div class="amount-label">Amount Acknowledged</div>
        <div class="amount-value">${formatPHP(ack.amount)}</div>
      </div>` : ""}

      <!-- Payment Details -->
      <div class="section-title">Payment Details</div>
      <div class="info-grid" style="margin-bottom: 25px;">
        <div class="info-box">
          <h3>Payment Information</h3>
          ${paymentDate ? `<p><strong>Payment Date:</strong> ${paymentDate}</p>` : ""}
          <p><strong>Amount:</strong> ${formatPHP(ack.amount)}</p>
          ${ack.paymentMethod ? `<p><strong>Method:</strong> ${ack.paymentMethod}</p>` : ""}
          ${ack.paymentReference ? `<p><strong>Reference:</strong> ${ack.paymentReference}</p>` : ""}
        </div>
        <div class="info-box">
          <h3>Receipt Information</h3>
          <p><strong>Receipt No:</strong> ${ack.receiptNumber}</p>
          <p><strong>Issued:</strong> ${issuedDate}</p>
          <p><strong>Issued By:</strong> ${ack.createdByName || "-"}</p>
        </div>
      </div>

      <!-- Itemized Breakdown (if quotation items exist) -->
      ${quotationItemsData.length > 0 ? `
      <div class="section-title">Itemized Breakdown</div>
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">#</th>
            <th>Description</th>
            <th style="width: 60px; text-align: center;">Qty</th>
            <th style="width: 100px; text-align: right;">Unit Price</th>
            <th style="width: 110px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr class="table-footer">
            <td colspan="4" style="text-align: right;"><strong>Subtotal:</strong></td>
            <td style="text-align: right;"><strong>${formatPHP(quotationData?.subtotal || quotationItemsData.reduce((s, i) => s + Number(i.totalPrice || 0), 0))}</strong></td>
          </tr>
          ${quotationData?.vatEnabled ? `
          <tr class="table-footer">
            <td colspan="4" style="text-align: right;">VAT (${quotationData.taxPercent || 12}%):</td>
            <td style="text-align: right;">${formatPHP(quotationData.taxAmount)}</td>
          </tr>` : ""}
          ${quotationData?.discountAmount && Number(quotationData.discountAmount) > 0 ? `
          <tr class="table-footer">
            <td colspan="4" style="text-align: right;">Discount:</td>
            <td style="text-align: right;">-${formatPHP(quotationData.discountAmount)}</td>
          </tr>` : ""}
          <tr class="table-footer">
            <td colspan="4" style="text-align: right;"><strong>Total Project Amount:</strong></td>
            <td style="text-align: right;"><strong>${formatPHP(totalProjectAmount)}</strong></td>
          </tr>
        </tbody>
      </table>` : ""}



      <!-- Payment History -->
      ${allPayments.length > 1 ? `
      <div class="section-title">Payment History</div>
      <table>
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">#</th>
            <th>Date</th>
            <th style="text-align: right;">Amount</th>
            <th>Method</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows}
          <tr class="table-footer">
            <td colspan="2" style="text-align: right;"><strong>Total Paid:</strong></td>
            <td style="text-align: right;"><strong>${formatPHP(totalPaid)}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>` : ""}

      <!-- Acknowledgement Text -->
      <div class="ack-text">
        <p>This acknowledges receipt of the above payment. Thank you for your trust in JMC Solar.</p>
      </div>

      ${ack.notes ? `<div class="notes-section"><h3>Notes / Remarks</h3><p>${escapeHtml(ack.notes)}</p></div>` : ""}

      <!-- Signatures -->
      <div class="signature-grid">
        <div class="sig-block">
          <div class="sig-space"></div>
          <div class="sig-line">Issued By</div>
          <div class="sig-name">${ack.createdByName || ""}</div>
        </div>
        <div class="sig-block">
          <div class="sig-space"></div>
          <div class="sig-line">Received By (Customer)</div>
          <div class="sig-name">${escapeHtml(customerName)}</div>
        </div>
      </div>

      <div class="doc-footer">
        <p class="company-name">JMC Solar Energy Solutions</p>
        <p>Lilia Ave., Cogon, Ormoc City | Phone: 0917 508 8220 | Email: jmcsolarph@gmail.com</p>
        <p>This is an official acknowledgement receipt. Please keep this document for your records.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Special Quotation printable HTML
router.get("/api/special-quotations/:id/print", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sq = await getById<SpecialQuotation>("special_quotations", id);
    if (!sq) { res.status(404).json({ error: "Special Quotation not found" }); return; }

    const html = generateSpecialQuotationHtml(sq);
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="special-quotation-${sq.quotationNumber}.html"`);
    res.send(html);
  } catch (error) {
    console.error("Special Quotation generation error:", error);
    res.status(500).json({ error: "Failed to generate Special Quotation" });
  }
});

function generateSpecialQuotationHtml(sq: any) {
  const items = (sq.items || []) as any[];
  const itemRows = items.map((item: any, i: number) => `
    <tr class="item-row">
      <td class="item-illustration">
        <div class="item-number">${i + 1}</div>
      </td>
      <td class="item-description">
        <strong>${escapeHtml(item.description || "")}</strong>
        ${item.notes ? `<div class="item-notes">${escapeHtml(item.notes).replace(/\n/g, "<br>")}</div>` : ""}
        ${item.warranty ? `<div class="item-warranty"><strong>${escapeHtml(item.warranty)}</strong></div>` : ""}
      </td>
      <td class="item-qty">${item.qty || ""}</td>
      <td class="item-unit">${item.unit || ""}</td>
      <td class="item-price">${item.unitPrice ? formatPHP(item.unitPrice) : "-"}</td>
      <td class="item-total">${item.total ? formatPHP(item.total) : "-"}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Special Quotation - ${sq.quotationNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #333; background: #f5f5f5; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 0; position: relative; }
    @media screen {
      .page { margin: 20px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
      .no-print { display: flex; position: fixed; top: 20px; right: 20px; gap: 10px; z-index: 100; }
      .no-print button { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
      .btn-print { background: #1a56db; color: #fff; }
      .btn-print:hover { background: #1e40af; }
      .btn-pdf { background: #059669; color: #fff; }
      .btn-pdf:hover { background: #047857; }
    }
    @media print {
      body { background: #fff; }
      .page { width: 100%; margin: 0; box-shadow: none; padding: 0; }
      .no-print { display: none !important; }
    }

    /* Header */
    .header { position: relative; padding: 15px 20px; border-bottom: 3px solid #1a3a6b; }
    .header-bg { position: absolute; top: 0; right: 0; width: 50%; height: 100%; background: linear-gradient(135deg, #1a3a6b 0%, #2563eb 100%); clip-path: polygon(15% 0, 100% 0, 100% 100%, 0% 100%); }
    .header-content { position: relative; display: flex; justify-content: space-between; align-items: center; z-index: 1; }
    .logo-section { display: flex; align-items: center; gap: 10px; }
    .logo-section img { height: 50px; width: auto; }
    .title-section { text-align: right; color: #fff; }
    .title-section h1 { font-size: 24px; font-weight: 700; letter-spacing: 1px; }

    /* Company & Customer Info */
    .info-section { padding: 12px 20px; display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; }
    .company-info { font-size: 10px; line-height: 1.6; }
    .company-info strong { font-size: 11px; }
    .meta-info { text-align: right; font-size: 10px; line-height: 1.8; }
    .meta-info .label { color: #6b7280; }
    .meta-info .value { font-weight: 600; }

    .customer-section { padding: 10px 20px; border-bottom: 1px solid #e5e7eb; }
    .customer-section .label { font-size: 10px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
    .customer-section .value { font-size: 11px; font-weight: 500; }

    /* Items Table */
    .items-table { width: 100%; border-collapse: collapse; margin: 0; }
    .items-table thead th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; text-align: center; }
    .items-table thead th:first-child { width: 50px; }
    .items-table thead th:nth-child(2) { text-align: left; }
    .items-table tbody td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; font-size: 10px; }
    .item-illustration { text-align: center; width: 50px; }
    .item-number { width: 24px; height: 24px; background: #e5e7eb; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; }
    .item-description { min-width: 200px; }
    .item-description strong { font-size: 10px; display: block; margin-bottom: 4px; }
    .item-notes { color: #6b7280; font-size: 9px; margin-top: 4px; line-height: 1.4; font-style: italic; }
    .item-warranty { color: #1a56db; font-size: 9px; margin-top: 4px; }
    .item-qty, .item-unit { text-align: center; }
    .item-price, .item-total { text-align: right; white-space: nowrap; }
    .item-row:nth-child(even) { background: #fafafa; }

    /* Totals */
    .totals-section { padding: 0 20px; }
    .totals-table { width: 100%; border-collapse: collapse; }
    .totals-table td { padding: 4px 8px; font-size: 10px; border: none; }
    .totals-table .label-cell { text-align: right; width: 80%; color: #6b7280; }
    .totals-table .value-cell { text-align: right; font-weight: 500; white-space: nowrap; }
    .totals-table .total-row td { font-size: 12px; font-weight: 700; border-top: 2px solid #1a3a6b; padding-top: 6px; color: #1a3a6b; }

    /* Footer Sections */
    .footer-sections { padding: 15px 20px; }
    .footer-section { margin-bottom: 12px; }
    .footer-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: center; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 6px; }
    .footer-section-content { font-size: 9px; line-height: 1.6; white-space: pre-line; }

    /* Signature */
    .signature-section { padding: 20px 20px 10px; }
    .sig-line { border-top: 1px solid #333; width: 200px; padding-top: 4px; font-size: 9px; }
    .sig-name { font-weight: 700; font-size: 10px; margin-top: 2px; }
    .contact-footer { padding: 10px 20px; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .thank-you { text-align: center; font-size: 10px; font-weight: 500; color: #1a3a6b; padding: 10px; }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">Print</button>
    <button class="btn-pdf" onclick="window.print()">Save as PDF</button>
  </div>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-bg"></div>
      <div class="header-content">
        <div class="logo-section">
          <img src="${getLogoUrl()}" alt="JMC Solar" />
        </div>
        <div class="title-section">
          <h1>Quotation</h1>
        </div>
      </div>
    </div>

    <!-- Company & Meta Info -->
    <div class="info-section">
      <div class="company-info">
        <strong>Company Address</strong><br>
        Lilia Ave., Cogon, Ormoc<br>
        Phone: 0917 508 8220 Email: jmcsolarph@gmail.com
      </div>
      <div class="meta-info">
        <div><span class="label">Date: </span><span class="value">${sq.date ? new Date(sq.date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : ""}</span></div>
        <div><span class="label">Quotation #: </span><span class="value">${sq.quotationNumber}</span></div>
      </div>
    </div>

    <!-- Customer -->
    <div class="customer-section">
      <div class="label">Quotation For</div>
      <div class="value">Customer Name: ${escapeHtml(sq.customerName || "")}</div>
      <div class="value">Address: ${escapeHtml(sq.customerAddress || "")}</div>
    </div>

    <!-- Items Table -->
    <div style="padding: 0 20px;">
      <table class="items-table">
        <thead>
          <tr>
            <th>ILLUSTRATION</th>
            <th>DESCRIPTION</th>
            <th>QTY</th>
            <th>UM</th>
            <th>UNIT PRICE</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <table class="totals-table">
        <tr><td class="label-cell">Subtotal</td><td class="value-cell">${sq.subtotal ? formatPHP(sq.subtotal) : "-"}</td></tr>
        <tr><td class="label-cell">VAT (${sq.vatRate || "12"}%)</td><td class="value-cell">${sq.vatAmount ? formatPHP(sq.vatAmount) : ""}</td></tr>
        <tr><td class="label-cell">Discount</td><td class="value-cell">${sq.discount ? formatPHP(sq.discount) : ""}</td></tr>
        <tr class="total-row"><td class="label-cell">TOTAL</td><td class="value-cell">${sq.total ? formatPHP(sq.total) : formatPHP(sq.subtotal)}</td></tr>
      </table>
    </div>

    <!-- Footer Sections -->
    <div class="footer-sections">
      ${sq.remarks ? `<div class="footer-section"><div class="footer-section-title">REMARKS</div><div class="footer-section-content">${escapeHtml(sq.remarks)}</div></div>` : ""}
      ${sq.warrantyClaims ? `<div class="footer-section"><div class="footer-section-title">WARRANTY CLAIMS</div><div class="footer-section-content">${escapeHtml(sq.warrantyClaims)}</div></div>` : ""}
      ${sq.paymentTerms ? `<div class="footer-section"><div class="footer-section-title">PAYMENT TERMS</div><div class="footer-section-content">${escapeHtml(sq.paymentTerms)}</div></div>` : ""}
      ${sq.paymentDetails ? `<div class="footer-section"><div class="footer-section-title">PAYMENT DETAILS</div><div class="footer-section-content">${escapeHtml(sq.paymentDetails)}</div></div>` : ""}
      ${sq.deliveryTerms ? `<div class="footer-section"><div class="footer-section-title">DELIVERY & COMMENCEMENT OF INSTALLATION</div><div class="footer-section-content">${escapeHtml(sq.deliveryTerms)}</div></div>` : ""}
    </div>

    <!-- Signature -->
    <div class="signature-section">
      <div>Prepared by:</div>
      <div class="sig-line"></div>
      <div class="sig-name">${escapeHtml(sq.preparedBy || "")}</div>
    </div>

    ${sq.contactInfo ? `<div class="contact-footer">If you have any questions concerning this quotation, please contact:<br>${escapeHtml(sq.contactInfo)}</div>` : ""}

    <div class="thank-you">Thank you for your business!</div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export { router as documentPdfRouter };
