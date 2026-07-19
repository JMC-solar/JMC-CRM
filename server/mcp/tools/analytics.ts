import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { appRouter } from "../../routers";
import { toolResult, toolError } from "../format";

type Caller = ReturnType<typeof appRouter.createCaller>;

/**
 * These wrap the same tRPC procedures the dashboard UI calls — via
 * createCaller, in-process, so every inline role check / row-level scope
 * (e.g. dashboard.stats withholding totalRevenue from non-admins,
 * cashRequests.analytics self-scoping non-admins) applies exactly as it
 * does for a browser session. Numbers here are guaranteed to match the UI
 * because it's the same code path, not a reimplementation.
 */
async function callProcedure<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return toolResult(data);
  } catch (error) {
    if (error instanceof TRPCError) {
      return toolError(error.code, error.message);
    }
    return toolError("INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
  }
}

export function registerAnalyticsTools(server: McpServer, caller: Caller): void {
  server.registerTool(
    "dashboard_stats",
    {
      title: "Dashboard stats",
      description:
        "Headline counts: leads, opportunities, inventory items, quotations, contacts, pipeline value, low-stock count, conversion rate. totalRevenue is only populated for admin callers (matches the dashboard UI).",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.dashboard.stats())
  );

  server.registerTool(
    "dashboard_pipeline_breakdown",
    {
      title: "Opportunity pipeline breakdown",
      description: "Opportunity count grouped by status (new/contacted/qualified/proposal/won/lost).",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.dashboard.pipelineBreakdown())
  );

  server.registerTool(
    "dashboard_inventory_by_category",
    {
      title: "Inventory by category",
      description: "Inventory item count and total stock on hand, grouped by category.",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.dashboard.inventoryByCategory())
  );

  server.registerTool(
    "dashboard_revenue_by_month",
    {
      title: "Revenue by month",
      description: "Project-payment revenue and count per month (oldest 12 months present in the data — admin only, empty array otherwise).",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.dashboard.revenueByMonth())
  );

  server.registerTool(
    "dashboard_lead_conversion",
    {
      title: "Lead conversion funnel",
      description: "Lead count for every funnel stage (new/contacted/qualified/proposal/won/lost), including zero-count stages.",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.dashboard.leadConversion())
  );

  server.registerTool(
    "purchase_orders_analytics_by_supplier",
    {
      title: "Purchase orders by supplier",
      description: "PO count, total value, and total paid, grouped by supplier, sorted by total value descending.",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.purchaseOrders.analyticsBySupplier())
  );

  server.registerTool(
    "purchase_orders_analytics_outstanding",
    {
      title: "Outstanding purchase orders",
      description: "Counts of POs that are unpaid/partially paid and not-delivered/partially delivered.",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.purchaseOrders.analyticsOutstanding())
  );

  server.registerTool(
    "projects_stats",
    {
      title: "Project stage counts",
      description: "Project count per stage: procurement, implementation, ongoing, completed.",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.projects.stats())
  );

  server.registerTool(
    "projects_payment_summary",
    {
      title: "Single project payment summary",
      description: "Total paid, total contract amount, balance, and payment status for one project.",
      inputSchema: { projectId: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId }) => callProcedure(() => caller.projects.paymentSummary({ projectId }))
  );

  server.registerTool(
    "projects_payments_list",
    {
      title: "All-projects payment list",
      description: "Per-project balance/status across every project, with optional search and paymentStatus/date filters.",
      inputSchema: {
        search: z.string().optional(),
        paymentStatus: z.enum(["all", "unpaid", "partially_paid", "fully_paid"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ search, paymentStatus, dateFrom, dateTo }) =>
      callProcedure(() =>
        caller.projects.paymentsList({
          search,
          paymentStatus: paymentStatus ?? "all",
          dateFrom,
          dateTo,
        })
      )
  );

  server.registerTool(
    "projects_payment_analytics",
    {
      title: "Project receivables analytics",
      description: "Total receivables, unpaid/partially-paid/fully-paid counts, and monthly payment totals (last 12 months present in the data).",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.projects.paymentAnalytics())
  );

  server.registerTool(
    "cash_requests_analytics",
    {
      title: "Cash requests analytics",
      description: "Approved cash request amounts by month and purpose. Self-scoped to the caller's own requests unless the caller is admin.",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.cashRequests.analytics())
  );

  server.registerTool(
    "net_metering_stats",
    {
      title: "Net metering status counts",
      description: "Net-metering application count grouped into planDrawings/submitted/approved/completed.",
      annotations: { readOnlyHint: true },
    },
    async () => callProcedure(() => caller.netMetering.stats())
  );
}
