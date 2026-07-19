import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { TrendingUp, Wallet, Trophy, Percent, Coins } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  StatCard,
  ChartCard,
  SectionHeader,
  ChartTooltip,
  Donut,
  EmptyState,
  CHART,
  SERIES,
  AXIS,
  GRID,
  pesoCompact,
} from "@/components/charts/ChartKit";

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : s);

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return `${d.toLocaleString("en-US", { month: "short" })} '${String(y).slice(2)}`;
}

export default function Analytics() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: pipelineData } = trpc.dashboard.pipelineBreakdown.useQuery();
  const { data: inventoryData } = trpc.dashboard.inventoryByCategory.useQuery();
  const { data: revenueData } = trpc.dashboard.revenueByMonth.useQuery(undefined, { enabled: isAdmin });
  const { data: leadConversion } = trpc.dashboard.leadConversion.useQuery();
  const { data: poBySupplier } = trpc.purchaseOrders.analyticsBySupplier.useQuery();
  const { data: poOutstanding } = trpc.purchaseOrders.analyticsOutstanding.useQuery();
  const { data: paymentAnalytics } = trpc.projects.paymentAnalytics.useQuery();
  const { data: cashRequestAnalytics } = trpc.cashRequests.analytics.useQuery();
  const { data: projectStats } = trpc.projects.stats.useQuery();
  const { data: netMeteringStats } = trpc.netMetering.stats.useQuery();

  const pipeline = (pipelineData ?? []).map((p) => ({ status: cap(p.status), count: p.count }));
  const funnel = (leadConversion ?? []).map((l) => ({ status: cap(l.status), count: l.count }));
  const revenue = (revenueData ?? []).map((r) => ({ month: fmtMonth(r.month), revenue: r.revenue }));
  const payments = (paymentAnalytics?.monthlyPayments ?? []).map((p) => ({ month: fmtMonth(p.month), amount: p.amount }));
  const inventory = (inventoryData ?? []).map((i) => ({ name: i.category, value: i.totalStock }));
  const suppliers = (poBySupplier ?? []).map((s: any) => ({ supplier: s.supplier, totalValue: Number(s.totalValue) }));

  const projectsDonut = projectStats
    ? [
        { name: "Procurement", value: projectStats.procurement },
        { name: "Implementation", value: projectStats.implementation },
        { name: "Ongoing", value: projectStats.ongoing },
        { name: "Completed", value: projectStats.completed },
      ]
    : [];

  const netMetering = netMeteringStats
    ? [
        { stage: "Plan Drawings", count: netMeteringStats.planDrawings },
        { stage: "Submitted", count: netMeteringStats.submitted },
        { stage: "Approved", count: netMeteringStats.approved },
        { stage: "Completed", count: netMeteringStats.completed },
      ]
    : [];

  const paymentStatus = paymentAnalytics
    ? [
        { name: "Fully Paid", value: paymentAnalytics.fullyPaidCount },
        { name: "Partially Paid", value: paymentAnalytics.partiallyPaidCount },
        { name: "Unpaid", value: paymentAnalytics.unpaidCount },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="mt-1 text-muted-foreground">Business insights and performance metrics across your operation.</p>
      </div>

      {/* KPI overview */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={TrendingUp} accent="blue" label="Pipeline Value" value={formatPHP(stats?.pipelineValue)} />
        {isAdmin && (
          <StatCard icon={Wallet} accent="green" label="Total Revenue" value={formatPHP(stats?.totalRevenue)} />
        )}
        <StatCard icon={Trophy} accent="green" label="Won Deals" value={stats?.wonDeals ?? 0} />
        <StatCard icon={Percent} accent="teal" label="Conversion Rate" value={`${stats?.conversionRate ?? 0}%`} />
        <StatCard icon={Coins} accent="amber" label="Inventory Value" value={formatPHP(stats?.inventoryValue)} />
      </div>

      {/* ---------------- SALES ---------------- */}
      <SectionHeader title="Sales" description="Pipeline health and lead progression." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Sales Pipeline" subtitle="Opportunities by stage">
          {pipeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pipeline} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="anPipeline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.blue} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={CHART.blue} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="status" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Opportunities" fill="url(#anPipeline)" radius={[6, 6, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState height={260} />
          )}
        </ChartCard>

        <ChartCard title="Lead Conversion Funnel" subtitle="Leads by stage">
          {funnel.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnel} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="status" type="category" stroke={AXIS} fontSize={12} width={78} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Leads" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {funnel.map((_, i) => (
                    <Cell key={i} fill={SERIES[i % SERIES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState height={260} />
          )}
        </ChartCard>
      </div>

      {/* ---------------- PROJECTS & OPERATIONS ---------------- */}
      <SectionHeader title="Projects & Operations" description="Delivery pipeline and net-metering progress." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Projects by Stage" subtitle={`${projectStats?.total ?? 0} projects total`}>
          <Donut data={projectsDonut} centerLabel="projects" height={240} />
        </ChartCard>

        <ChartCard title="Net Metering Progress" subtitle="Applications by status">
          {netMetering.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={netMetering} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="stage" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Applications" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {netMetering.map((_, i) => (
                    <Cell key={i} fill={SERIES[i % SERIES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState height={260} />
          )}
        </ChartCard>
      </div>

      {/* ---------------- PAYMENTS & REVENUE ---------------- */}
      <SectionHeader title="Payments & Revenue" description="Cash coming in and what's still outstanding." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard accent="red" label="Total Receivables" value={formatPHP(paymentAnalytics?.totalReceivables)} hint="Still owed to you" />
        <StatCard accent="red" label="Unpaid Projects" value={paymentAnalytics?.unpaidCount ?? 0} />
        <StatCard accent="amber" label="Partially Paid" value={paymentAnalytics?.partiallyPaidCount ?? 0} />
        <StatCard accent="green" label="Fully Paid" value={paymentAnalytics?.fullyPaidCount ?? 0} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {isAdmin && (
          <ChartCard title="Revenue Trend" subtitle="Payments collected per month">
            {revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={revenue} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                  <defs>
                    <linearGradient id="anRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.green} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={CHART.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={56} />
                  <Tooltip content={<ChartTooltip formatter={(v: any) => formatPHP(v)} />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART.green} strokeWidth={2} fill="url(#anRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState height={260} />
            )}
          </ChartCard>
        )}

        <ChartCard title="Payment Status" subtitle="Projects by how much has been paid">
          <Donut
            data={paymentStatus}
            centerLabel="projects"
            height={240}
            colors={[CHART.green, CHART.amber, CHART.red]}
          />
        </ChartCard>

        <ChartCard title="Payments Received Over Time" subtitle="Monthly collections">
          {payments.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={payments} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={56} />
                <Tooltip content={<ChartTooltip formatter={(v: any) => formatPHP(v)} />} />
                <Line type="monotone" dataKey="amount" name="Received" stroke={CHART.teal} strokeWidth={2.5} dot={{ r: 3, fill: CHART.teal }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState height={260} />
          )}
        </ChartCard>

        <ChartCard title="Cash Requests by Purpose" subtitle="Spend requested per month">
          {cashRequestAnalytics && cashRequestAnalytics.rows.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cashRequestAnalytics.rows} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="month" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={56} />
                <Tooltip content={<ChartTooltip formatter={(v: any) => formatPHP(v)} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {cashRequestAnalytics.purposes.map((purpose: string, index: number) => (
                  <Bar key={purpose} dataKey={purpose} stackId="cash" fill={SERIES[index % SERIES.length]} radius={[0, 0, 0, 0]} maxBarSize={48} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState height={260} />
          )}
        </ChartCard>
      </div>

      {/* ---------------- PURCHASING & INVENTORY ---------------- */}
      <SectionHeader title="Purchasing & Inventory" description="Supplier spend, outstanding orders, and stock." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Purchases by Supplier" subtitle="Total value ordered">
          {suppliers.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={suppliers} margin={{ top: 8, right: 8, bottom: 24, left: -4 }}>
                <defs>
                  <linearGradient id="anSupplier" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.purple} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={CHART.purple} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="supplier" stroke={AXIS} fontSize={11} angle={-20} textAnchor="end" height={54} tickLine={false} axisLine={false} />
                <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={56} />
                <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} content={<ChartTooltip formatter={(v: any) => formatPHP(v)} />} />
                <Bar dataKey="totalValue" name="Total Value" fill="url(#anSupplier)" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState height={280} />
          )}
        </ChartCard>

        <ChartCard title="Outstanding Purchase Orders" subtitle="What still needs attention">
          <div className="grid h-[280px] grid-cols-2 content-center gap-4">
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center">
              <div className="text-3xl font-bold tabular-nums text-destructive">{poOutstanding?.unpaid ?? 0}</div>
              <div className="mt-1 text-sm text-muted-foreground">Unpaid</div>
            </div>
            <div className="rounded-xl border border-chart-4/20 bg-chart-4/10 p-4 text-center">
              <div className="text-3xl font-bold tabular-nums text-chart-4">{poOutstanding?.partiallyPaid ?? 0}</div>
              <div className="mt-1 text-sm text-muted-foreground">Partially Paid</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
              <div className="text-3xl font-bold tabular-nums text-foreground">{poOutstanding?.notDelivered ?? 0}</div>
              <div className="mt-1 text-sm text-muted-foreground">Not Delivered</div>
            </div>
            <div className="rounded-xl border border-chart-2/20 bg-chart-2/10 p-4 text-center">
              <div className="text-3xl font-bold tabular-nums text-chart-2">{poOutstanding?.partiallyDelivered ?? 0}</div>
              <div className="mt-1 text-sm text-muted-foreground">Partial Delivery</div>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Inventory by Category" subtitle="Stock on hand">
          <Donut data={inventory} centerLabel="units" height={240} />
        </ChartCard>
      </div>
    </div>
  );
}
