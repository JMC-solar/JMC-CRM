import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

const COLORS = ["#4A7CC9", "#7BB3E0", "#1B2A4A", "#60A5FA", "#34D399", "#F87171"];

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">Business insights and performance metrics.</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Pipeline Value</div>
            <div className="text-2xl font-bold text-foreground mt-1">₱{Number(stats?.pipelineValue ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        {isAdmin && (
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Revenue</div>
            <div className="text-2xl font-bold text-green-400 mt-1">₱{Number(stats?.totalRevenue ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        )}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Won Deals</div>
            <div className="text-2xl font-bold text-foreground mt-1">{stats?.wonDeals ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Conversion Rate</div>
            <div className="text-2xl font-bold text-foreground mt-1">{stats?.conversionRate ?? 0}%</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Inventory Value</div>
            <div className="text-2xl font-bold text-foreground mt-1">₱{Number(stats?.inventoryValue ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Sales Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData && pipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="status" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} />
                  <Bar dataKey="count" fill="#4A7CC9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">No pipeline data yet</div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueData && revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} formatter={(value: any) => [`₱${Number(value).toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#34D399" fill="#34D399" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">No revenue data yet</div>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {/* Purchasing Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Purchases by Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            {poBySupplier && poBySupplier.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={poBySupplier}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="supplier" stroke="#94a3b8" fontSize={11} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} formatter={(value: any) => [`₱${Number(value).toLocaleString()}`, "Total Value"]} />
                  <Bar dataKey="totalValue" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">No purchase data yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Outstanding POs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 h-[250px] content-center">
              <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="text-3xl font-bold text-red-400">{poOutstanding?.unpaid ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Unpaid</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <div className="text-3xl font-bold text-orange-400">{poOutstanding?.partiallyPaid ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Partially Paid</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-500/10 border border-gray-500/20">
                <div className="text-3xl font-bold text-gray-400">{poOutstanding?.notDelivered ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Not Delivered</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="text-3xl font-bold text-yellow-400">{poOutstanding?.partiallyDelivered ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Partial Delivery</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Lead Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {leadConversion && leadConversion.some((d: any) => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={leadConversion} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                  <YAxis dataKey="status" type="category" stroke="#94a3b8" fontSize={12} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} />
                  <Bar dataKey="count" fill="#7BB3E0" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">No lead data yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Inventory by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {inventoryData && inventoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={inventoryData} dataKey="totalStock" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={(entry) => `${entry.category} (${entry.totalStock})`}>
                    {inventoryData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">No inventory data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Analytics Section */}
      <h2 className="text-lg font-semibold text-foreground pt-4">Project Payments</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Receivables</div>
            <div className="text-2xl font-bold text-red-400 mt-1">{formatPHP(paymentAnalytics?.totalReceivables)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Unpaid Projects</div>
            <div className="text-2xl font-bold text-red-400 mt-1">{paymentAnalytics?.unpaidCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Partially Paid</div>
            <div className="text-2xl font-bold text-yellow-400 mt-1">{paymentAnalytics?.partiallyPaidCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Fully Paid</div>
            <div className="text-2xl font-bold text-green-400 mt-1">{paymentAnalytics?.fullyPaidCount ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Payments Chart */}
      {paymentAnalytics?.monthlyPayments && paymentAnalytics.monthlyPayments.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Payments Received Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={paymentAnalytics.monthlyPayments}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(v) => `\u20B1${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} formatter={(value: any) => [formatPHP(value), "Amount (PHP)"]} />
                <Bar dataKey="amount" fill="#34D399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cash Requests Analytics */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Cash Requests by Purpose</CardTitle>
        </CardHeader>
        <CardContent>
          {cashRequestAnalytics && cashRequestAnalytics.rows.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cashRequestAnalytics.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip shared={false} contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }} formatter={(value: any, name: any) => [`₱${Number(value).toLocaleString()}`, name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {cashRequestAnalytics.purposes.map((purpose: string, index: number) => (
                  <Bar key={purpose} dataKey={purpose} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">No cash request data yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
