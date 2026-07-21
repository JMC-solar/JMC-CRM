import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import {
  Target,
  FileText,
  TrendingUp,
  AlertTriangle,
  Trophy,
  Wallet,
  Users,
  Coins,
  Package,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  StatCard,
  ChartCard,
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

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: pipeline } = trpc.dashboard.pipelineBreakdown.useQuery();
  const { data: leadConversion } = trpc.dashboard.leadConversion.useQuery();
  const { data: revenue } = trpc.dashboard.revenueByMonth.useQuery(undefined, { enabled: isAdmin });
  const { data: projectStats } = trpc.projects.stats.useQuery();

  const dash = isLoading ? "…" : undefined;

  const pipelineChart = (pipeline ?? []).map((p) => ({ status: cap(p.status), count: p.count }));
  const funnel = (leadConversion ?? []).map((l) => ({ status: cap(l.status), count: l.count }));
  const revenueChart = (revenue ?? []).map((r) => ({ month: fmtMonth(r.month), revenue: r.revenue }));
  const projectsDonut = projectStats
    ? [
        { name: "Procurement", value: projectStats.procurement },
        { name: "Implementation", value: projectStats.implementation },
        { name: "Ongoing", value: projectStats.ongoing },
        { name: "Completed", value: projectStats.completed },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Welcome to JMC Solar CRM — your business at a glance.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isAdmin && (
          <StatCard
            icon={Wallet}
            accent="green"
            label="Total Revenue"
            value={dash ?? formatPHP(stats?.totalRevenue)}
            hint="All-time payments collected"
          />
        )}
        <StatCard
          icon={TrendingUp}
          accent="blue"
          label="Pipeline Value"
          value={dash ?? formatPHP(stats?.pipelineValue)}
          hint={`${stats?.totalOpportunities ?? 0} open opportunities`}
        />
        <StatCard
          icon={Trophy}
          accent="green"
          label="Won Deals"
          value={dash ?? (stats?.wonDeals ?? 0)}
          hint={`${stats?.conversionRate ?? 0}% conversion rate`}
        />
        <StatCard
          icon={Target}
          accent="teal"
          label="Total Leads"
          value={dash ?? (stats?.totalLeads ?? 0)}
          hint="Across the funnel"
        />
        {/* Peso value is admin-only; sub-admins see the item count instead. */}
        {isAdmin ? (
          <StatCard
            icon={Coins}
            accent="amber"
            label="Inventory Value"
            value={dash ?? formatPHP(stats?.inventoryValue)}
            hint={`${stats?.totalInventoryItems ?? 0} items in stock`}
          />
        ) : (
          <StatCard
            icon={Package}
            accent="amber"
            label="Inventory Items"
            value={dash ?? (stats?.totalInventoryItems ?? 0)}
            hint="Items in stock"
          />
        )}
        <StatCard
          icon={AlertTriangle}
          accent="red"
          label="Low Stock Alerts"
          value={dash ?? (stats?.lowStockItems ?? 0)}
          hint="Items at or below reorder level"
        />
        <StatCard
          icon={FileText}
          accent="purple"
          label="Quotations"
          value={dash ?? (stats?.totalQuotations ?? 0)}
          hint="Total prepared"
        />
        <StatCard
          icon={Users}
          accent="blue"
          label="Contacts"
          value={dash ?? (stats?.totalContacts ?? 0)}
          hint="People on record"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Sales Pipeline" subtitle="Opportunities by stage">
          {pipelineChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pipelineChart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="dashPipeline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.blue} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={CHART.blue} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="status" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Opportunities" fill="url(#dashPipeline)" radius={[6, 6, 0, 0]} maxBarSize={64} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState height={260} />
          )}
        </ChartCard>

        <ChartCard title="Lead Conversion Funnel" subtitle="Where your leads stand">
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

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {isAdmin && (
          <ChartCard title="Revenue Trend" subtitle="Payments collected per month">
            {revenueChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={revenueChart} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                  <defs>
                    <linearGradient id="dashRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.green} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={CHART.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} tickFormatter={pesoCompact} width={56} />
                  <Tooltip content={<ChartTooltip formatter={(v: any) => formatPHP(v)} />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART.green} strokeWidth={2} fill="url(#dashRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState height={260} />
            )}
          </ChartCard>
        )}

        <ChartCard title="Projects by Stage" subtitle={`${projectStats?.total ?? 0} projects total`}>
          <Donut data={projectsDonut} centerLabel="projects" height={230} />
        </ChartCard>
      </div>
    </div>
  );
}
