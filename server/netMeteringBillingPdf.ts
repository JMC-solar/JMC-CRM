import { Router } from "express";
import { getById, listAll } from "./firestore";
import type { NetMetering, NetMeteringBilling, NetMeteringPayment } from "./models";
import { requireAuth } from "./_core/requireAuth";

const router = Router();

/** Printable billing statement for a net metering application. */
router.get("/api/net-metering/:id/billing/pdf", requireAuth, async (req, res) => {
  try {
    const netMeteringId = parseInt(req.params.id);
    const nm = await getById<NetMetering>("net_metering", netMeteringId);
    if (!nm) {
      res.status(404).json({ error: "Net metering record not found" });
      return;
    }

    const billings = await listAll<NetMeteringBilling>("net_metering_billings", {
      where: [["netMeteringId", "==", netMeteringId]],
    });
    const billing = billings[0];
    if (!billing) {
      res.status(404).json({ error: "No billing has been issued for this net metering record yet" });
      return;
    }

    const payments = await listAll<NetMeteringPayment>("net_metering_payments", {
      where: [["netMeteringId", "==", netMeteringId]],
    });

    const html = generateBillingHtml(nm, billing, payments);
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="${billing.billingNumber}.html"`);
    res.send(html);
  } catch (error) {
    console.error("NM billing generation error:", error);
    res.status(500).json({ error: "Failed to generate net metering billing" });
  }
});

const peso = (v: any) =>
  `₱${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function generateBillingHtml(nm: any, billing: any, payments: any[]) {
  const items: any[] = Array.isArray(billing.items) ? billing.items : [];
  const total = Number(billing.total || 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balance = total - totalPaid;

  const issuedDate = new Date(billing.createdAt).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });

  const itemRows = items.map((it, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${esc(it.description)}</td>
          <td class="amt">${peso(it.amount)}</td>
        </tr>`).join("");

  const paymentRows = payments.length
    ? payments
        .slice()
        .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
        .map(p => `
        <tr>
          <td>${new Date(p.paymentDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</td>
          <td>${esc(p.paymentMethod || "-")}</td>
          <td>${esc(p.paymentReference || "-")}</td>
          <td class="amt">${peso(p.amount)}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" class="muted center">No payments received yet.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(billing.billingNumber)} — NetMetering Process Billing</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; background: #fff; }
  .sheet { max-width: 780px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4A7CC9; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 800; color: #1B2A4A; letter-spacing: -0.4px; }
  .brand small { display: block; font-size: 11px; font-weight: 500; color: #667085; letter-spacing: .04em; margin-top: 4px; text-transform: uppercase; }
  .doc { text-align: right; }
  .doc h1 { font-size: 16px; margin: 0 0 6px; color: #4A7CC9; text-transform: uppercase; letter-spacing: .06em; }
  .doc .no { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 15px; font-weight: 700; }
  .doc .date { font-size: 12px; color: #667085; margin-top: 4px; }
  .grid { display: flex; gap: 32px; margin-bottom: 24px; }
  .grid > div { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #667085; margin-bottom: 3px; }
  .value { font-size: 13px; font-weight: 600; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #667085; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #f4f6fa; color: #344054; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 9px 10px; border-bottom: 1px solid #e4e7ec; }
  td { padding: 9px 10px; border-bottom: 1px solid #eef0f4; }
  .amt, th.amt { text-align: right; font-variant-numeric: tabular-nums; }
  .num { width: 34px; color: #98a2b3; }
  .muted { color: #98a2b3; }
  .center { text-align: center; }
  .totals { margin-top: 16px; margin-left: auto; width: 300px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 7px 10px; }
  .totals .grand { border-top: 2px solid #1B2A4A; font-size: 16px; font-weight: 800; color: #1B2A4A; }
  .totals .bal { background: #fff4f4; color: #b42318; font-weight: 700; border-radius: 4px; }
  .totals .paid { color: #067647; font-weight: 600; }
  .notes { margin-top: 24px; font-size: 12px; color: #475467; white-space: pre-wrap; }
  .sign { margin-top: 48px; display: flex; gap: 48px; }
  .sign > div { flex: 1; }
  .sign .line { border-top: 1px solid #98a2b3; margin-top: 44px; padding-top: 6px; font-size: 11px; color: #667085; }
  .foot { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e4e7ec; font-size: 10px; color: #98a2b3; text-align: center; }
  .print { position: fixed; top: 16px; right: 16px; }
  .print button { background: #4A7CC9; color: #fff; border: 0; padding: 9px 18px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 600; }
  @media print { .print { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="print"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="sheet">

    <div class="head">
      <div class="brand">JMC SOLAR PH<small>Renewable Energy Solutions</small></div>
      <div class="doc">
        <h1>NetMetering Process Billing</h1>
        <div class="no">${esc(billing.billingNumber)}</div>
        <div class="date">Issued ${issuedDate}</div>
      </div>
    </div>

    <div class="grid">
      <div>
        <div class="label">Billed To</div>
        <div class="value">${esc(nm.clientName)}</div>
        ${nm.address ? `<div class="value" style="font-weight:400;color:#475467;margin-top:3px">${esc(nm.address)}</div>` : ""}
      </div>
      <div>
        <div class="label">Project</div>
        <div class="value">${esc(nm.projectName || "-")}</div>
        <div class="label" style="margin-top:10px">Electric Company</div>
        <div class="value">${esc(nm.electricCompany || "-")}</div>
      </div>
      <div>
        <div class="label">Application No.</div>
        <div class="value">${esc(nm.applicationNumber || "-")}</div>
        <div class="label" style="margin-top:10px">System Size</div>
        <div class="value">${esc(nm.sizeOfSetup || "-")}</div>
      </div>
    </div>

    <h2>Billing Details</h2>
    <table>
      <thead>
        <tr><th class="num">#</th><th>Description</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <div class="grand"><span>Total Amount Due</span><span>${peso(total)}</span></div>
      <div class="paid"><span>Payments Received</span><span>${peso(totalPaid)}</span></div>
      <div class="bal"><span>Balance</span><span>${peso(balance)}</span></div>
    </div>

    <h2>Payments Received</h2>
    <table>
      <thead>
        <tr><th>Date</th><th>Method</th><th>Reference</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>

    ${billing.notes ? `<div class="notes"><strong>Notes:</strong>\n${esc(billing.notes)}</div>` : ""}

    <div class="sign">
      <div><div class="line">Prepared by${billing.createdByName ? ` — ${esc(billing.createdByName)}` : ""}</div></div>
      <div><div class="line">Received / Conforme (Client)</div></div>
    </div>

    <div class="foot">This billing covers net metering processing services rendered by JMC Solar PH.</div>
  </div>
</body>
</html>`;
}

export { router as netMeteringBillingPdfRouter };
