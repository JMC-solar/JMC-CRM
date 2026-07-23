import { Router } from "express";
import { getById, listAll } from "./firestore";
import type { Project, ProjectBilling, ProjectPayment } from "./models";
import { requireAuth } from "./_core/requireAuth";

const router = Router();

const peso = (v: any) =>
  `₱${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtDate = (d: any) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "";

const fmtShort = (d: any) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "";

/** Load a project, its (optional) billing, and its payments. */
async function load(projectId: number) {
  const project = await getById<Project>("projects", projectId);
  if (!project) return null;
  const [billings, payments] = await Promise.all([
    listAll<ProjectBilling>("project_billings", { where: [["projectId", "==", projectId]] }),
    listAll<ProjectPayment>("project_payments", { where: [["projectId", "==", projectId]] }),
  ]);
  const billing = billings[0] || null;
  payments.sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());
  // Billed total = the saved billing if there is one, else the project's contract amount.
  const items: { description: string; amount: number }[] = billing?.items?.length
    ? billing.items.map((it: any) => ({ description: it.description, amount: Number(it.amount || 0) }))
    : [{ description: "Project contract amount", amount: Number(project.totalProjectAmount || 0) }];
  const total = items.reduce((s, it) => s + it.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  return { project, billing, payments, items, total, totalPaid, balance: total - totalPaid };
}

const styles = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; background: #fff; }
  .sheet { max-width: 780px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #16a34a; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 800; color: #1B2A4A; letter-spacing: -0.4px; }
  .brand small { display: block; font-size: 11px; font-weight: 500; color: #667085; letter-spacing: .04em; margin-top: 4px; text-transform: uppercase; }
  .doc { text-align: right; }
  .doc h1 { font-size: 16px; margin: 0 0 6px; color: #16a34a; text-transform: uppercase; letter-spacing: .06em; }
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
  .totals { margin-top: 16px; margin-left: auto; width: 320px; font-size: 13px; }
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
  .print button { background: #16a34a; color: #fff; border: 0; padding: 9px 18px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 600; }
  @media print { .print { display: none; } body { padding: 0; } }
`;

function header(project: any, title: string, docNo: string, dateLabel: string) {
  return `
    <div class="head">
      <div class="brand">JMC SOLAR PH<small>Renewable Energy Solutions</small></div>
      <div class="doc">
        <h1>${esc(title)}</h1>
        <div class="no">${esc(docNo)}</div>
        <div class="date">${esc(dateLabel)}</div>
      </div>
    </div>
    <div class="grid">
      <div>
        <div class="label">Billed To</div>
        <div class="value">${esc(project.customerName || "-")}</div>
        ${project.address ? `<div class="value" style="font-weight:400;color:#475467;margin-top:3px">${esc(project.address)}</div>` : ""}
      </div>
      <div>
        <div class="label">Project</div>
        <div class="value">${esc(project.name || "-")}</div>
      </div>
    </div>`;
}

function page(title: string, docNo: string, inner: string) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(docNo)} — ${esc(title)}</title><style>${styles}</style></head>
<body>
  <div class="print"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="sheet">${inner}</div>
</body></html>`;
}

// ---- Project Billing ------------------------------------------------------
router.get("/api/projects/:id/billing/pdf", requireAuth, async (req, res) => {
  try {
    const data = await load(parseInt(req.params.id));
    if (!data) { res.status(404).json({ error: "Project not found" }); return; }
    const { project, billing, items, total, totalPaid, balance } = data;
    const docNo = billing?.billingNumber || `PB-${project.id}`;

    const rows = items.map((it, i) => `
        <tr><td class="num">${i + 1}</td><td>${esc(it.description)}</td><td class="amt">${peso(it.amount)}</td></tr>`).join("");

    const inner = header(project, "Project Billing", docNo, `Issued ${fmtDate(billing?.createdAt || new Date())}`) + `
    <h2>Billing Details</h2>
    <table><thead><tr><th class="num">#</th><th>Description</th><th class="amt">Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="totals">
      <div class="grand"><span>Total Amount Due</span><span>${peso(total)}</span></div>
      <div class="paid"><span>Payments Received</span><span>${peso(totalPaid)}</span></div>
      <div class="bal"><span>Balance Due</span><span>${peso(balance)}</span></div>
    </div>
    ${billing?.notes ? `<div class="notes"><strong>Notes:</strong>\n${esc(billing.notes)}</div>` : ""}
    <div class="sign">
      <div><div class="line">Prepared by${billing?.createdByName ? ` — ${esc(billing.createdByName)}` : ""}</div></div>
      <div><div class="line">Received / Conforme (Client)</div></div>
    </div>
    <div class="foot">Please settle the balance due. Thank you for choosing JMC Solar PH.</div>`;

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="${docNo}.html"`);
    res.send(page("Project Billing", docNo, inner));
  } catch (error) {
    console.error("Project billing PDF error:", error);
    res.status(500).json({ error: "Failed to generate project billing" });
  }
});

// ---- Statement of Account -------------------------------------------------
router.get("/api/projects/:id/soa/pdf", requireAuth, async (req, res) => {
  try {
    const data = await load(parseInt(req.params.id));
    if (!data) { res.status(404).json({ error: "Project not found" }); return; }
    const { project, billing, payments, total, totalPaid, balance } = data;
    const docNo = `SOA-${project.id}`;

    // Ledger: start with the billed total as a charge, then each payment reduces the balance.
    let running = total;
    const chargeRow = `
        <tr><td>${fmtShort(billing?.createdAt || project.createdAt)}</td><td>${esc(billing?.billingNumber ? `Billing ${billing.billingNumber}` : "Project contract amount")}</td>
          <td class="amt">${peso(total)}</td><td class="amt muted">—</td><td class="amt">${peso(running)}</td></tr>`;
    const paymentRows = payments.length
      ? payments.map(p => {
          running -= Number(p.amount || 0);
          const ref = p.paymentReference ? ` (${esc(p.paymentReference)})` : "";
          return `
        <tr><td>${fmtShort(p.paymentDate)}</td><td>Payment${esc(p.paymentMethod ? ` — ${p.paymentMethod}` : "")}${ref}</td>
          <td class="amt muted">—</td><td class="amt paid">${peso(p.amount)}</td><td class="amt">${peso(running)}</td></tr>`;
        }).join("")
      : `<tr><td colspan="5" class="muted center">No payments received yet.</td></tr>`;

    const inner = header(project, "Statement of Account", docNo, `As of ${fmtDate(new Date())}`) + `
    <h2>Account Ledger</h2>
    <table><thead><tr><th>Date</th><th>Description</th><th class="amt">Charges</th><th class="amt">Payments</th><th class="amt">Balance</th></tr></thead>
      <tbody>${chargeRow}${paymentRows}</tbody></table>
    <div class="totals">
      <div class="grand"><span>Total Billed</span><span>${peso(total)}</span></div>
      <div class="paid"><span>Total Paid</span><span>${peso(totalPaid)}</span></div>
      <div class="bal"><span>Outstanding Balance</span><span>${peso(balance)}</span></div>
    </div>
    <div class="foot">This statement reflects all charges and payments on record as of the date above. JMC Solar PH.</div>`;

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `inline; filename="${docNo}.html"`);
    res.send(page("Statement of Account", docNo, inner));
  } catch (error) {
    console.error("Statement of account PDF error:", error);
    res.status(500).json({ error: "Failed to generate statement of account" });
  }
});

export { router as projectBillingPdfRouter };
