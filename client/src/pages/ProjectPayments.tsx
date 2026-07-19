import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { DollarSign, Search, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { useState } from "react";
import { useLocation } from "wouter";
import DetailDialog from "@/components/DetailDialog";

const stageLabels: Record<string, string> = {
  procurement: "Procurement",
  implementation: "Implementation",
  ongoing: "Ongoing",
  completed: "Completed",
};

export default function ProjectPayments() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "partially_paid" | "fully_paid">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewingPayment, setViewingPayment] = useState<any>(null);

  const { data: paymentsList, isLoading } = trpc.projects.paymentsList.useQuery({
    search: search || undefined,
    paymentStatus: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: analytics } = trpc.projects.paymentAnalytics.useQuery();

  const { data: paymentRecords } = trpc.projects.getPayments.useQuery(
    { projectId: viewingPayment?.projectId ?? 0 },
    { enabled: !!viewingPayment }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "fully_paid":
        return <Badge className="bg-green-500/20 text-green-400 text-xs">Fully Paid</Badge>;
      case "partially_paid":
        return <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Partially Paid</Badge>;
      default:
        return <Badge className="bg-red-500/20 text-red-400 text-xs">Unpaid</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Project Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">Track payment status and receivables across all projects</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Receivables</p>
              <p className="text-lg font-bold text-foreground">{formatPHP(analytics?.totalReceivables)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unpaid Projects</p>
              <p className="text-lg font-bold text-red-400">{analytics?.unpaidCount || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Partially Paid</p>
              <p className="text-lg font-bold text-yellow-400">{analytics?.partiallyPaidCount || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fully Paid</p>
              <p className="text-lg font-bold text-green-400">{analytics?.fullyPaidCount || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by project, customer, address, type, size..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-input border-border"
                />
              </div>
            </div>
            <div className="w-[180px]">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Payment Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="fully_paid">Fully Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-input border-border" placeholder="From date" />
            </div>
            <div className="w-[150px]">
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-input border-border" placeholder="To date" />
            </div>
            {(search || statusFilter !== "all" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }} className="text-muted-foreground">
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-foreground text-lg">
            All Projects ({paymentsList?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
          ) : !paymentsList?.length ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No projects found matching your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-3 px-3">Project Name</th>
                    <th className="text-left py-3 px-3">Customer</th>
                    <th className="text-right py-3 px-3">Total Amount</th>
                    <th className="text-right py-3 px-3">Total Paid</th>
                    <th className="text-right py-3 px-3">Balance</th>
                    <th className="text-center py-3 px-3">Status</th>
                    <th className="text-left py-3 px-3">Last Payment</th>
                    <th className="text-right py-3 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsList.map((row: any) => (
                    <tr key={row.projectId} className="border-b border-border/30 hover:bg-muted/10 cursor-pointer" onClick={() => setViewingPayment(row)}>
                      <td className="py-3 px-3 font-medium text-foreground">{row.projectName}</td>
                      <td className="py-3 px-3 text-muted-foreground">{row.customerName}</td>
                      <td className="py-3 px-3 text-right text-foreground">{formatPHP(row.totalProjectAmount, true)}</td>
                      <td className="py-3 px-3 text-right text-green-400 font-medium">{formatPHP(row.totalPaid, true)}</td>
                      <td className="py-3 px-3 text-right text-orange-400">{row.balance > 0 ? formatPHP(row.balance) : row.totalProjectAmount > 0 ? formatPHP(0) : "-"}</td>
                      <td className="py-3 px-3 text-center">{getStatusBadge(row.status)}</td>
                      <td className="py-3 px-3 text-muted-foreground text-xs">{row.lastPaymentDate ? new Date(row.lastPaymentDate).toLocaleDateString() : "-"}</td>
                      <td className="py-3 px-3 text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/projects/${row.projectId}`); }} className="text-primary text-xs">
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DetailDialog
        open={!!viewingPayment}
        onOpenChange={(open) => !open && setViewingPayment(null)}
        title={viewingPayment?.projectName}
        subtitle={viewingPayment?.customerName || undefined}
        headerRight={viewingPayment ? getStatusBadge(viewingPayment.status) : undefined}
        sections={[
          {
            title: "Project",
            fields: [
              { label: "Project Name", value: viewingPayment?.projectName },
              { label: "Customer", value: viewingPayment?.customerName },
              {
                label: "Stage",
                value: viewingPayment?.stage
                  ? stageLabels[viewingPayment.stage] || viewingPayment.stage
                  : undefined,
              },
            ],
          },
          {
            title: "Payment Summary",
            fields: [
              { label: "Total Project Amount", value: viewingPayment ? formatPHP(viewingPayment.totalProjectAmount) : undefined },
              { label: "Total Paid", value: viewingPayment ? formatPHP(viewingPayment.totalPaid) : undefined },
              { label: "Balance", value: viewingPayment ? formatPHP(viewingPayment.balance) : undefined },
              {
                label: "Last Payment Date",
                value: viewingPayment?.lastPaymentDate ? new Date(viewingPayment.lastPaymentDate).toLocaleDateString() : undefined,
              },
            ],
          },
        ]}
        footerLeft={
          <Button
            variant="outline"
            size="sm"
            className="border-border"
            onClick={() => { navigate(`/projects/${viewingPayment.projectId}`); setViewingPayment(null); }}
          >
            View Project
          </Button>
        }
      >
        {paymentRecords && paymentRecords.length > 0 && (
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-3">Payment Records</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-right py-2 px-3">Amount</th>
                    <th className="text-left py-2 px-3">Method</th>
                    <th className="text-left py-2 px-3">Reference</th>
                    <th className="text-left py-2 px-3">Notes</th>
                    <th className="text-left py-2 px-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRecords.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/30">
                      <td className="py-2 px-3 text-foreground">{new Date(p.paymentDate).toLocaleDateString()}</td>
                      <td className="py-2 px-3 text-right font-medium text-green-400">{formatPHP(p.amount)}</td>
                      <td className="py-2 px-3 text-foreground">{p.paymentMethod || "-"}</td>
                      <td className="py-2 px-3 text-foreground">{p.paymentReference || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{p.notes || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">{p.createdByName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DetailDialog>
    </div>
  );
}
