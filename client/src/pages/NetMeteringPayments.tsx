import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PaginationControls from "@/components/PaginationControls";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/utils";
import { Search, Zap, Filter, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function NetMeteringPayments() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [electricCompany, setElectricCompany] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [viewingPayment, setViewingPayment] = useState<any>(null);

  const { data: paymentsList, isLoading } = trpc.netMeteringPayments.centralList.useQuery({
    search: search || undefined,
    electricCompany: electricCompany || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: 20,
  });

  useEffect(() => { setPage(1); }, [search, electricCompany, statusFilter, dateFrom, dateTo]);

  // Individual payments for the record being viewed, so each can get a receipt.
  const { data: recordPayments } = trpc.netMeteringPayments.list.useQuery(
    { netMeteringId: viewingPayment?.id ?? 0 },
    { enabled: !!viewingPayment?.id }
  );

  const ackMutation = trpc.acknowledgements.createForNetMeteringPayment.useMutation({
    onError: (err: any) => toast.error(err.message),
  });

  /** Generate the acknowledgement receipt for a payment and open it for printing. */
  const handleReceipt = async (paymentId: number) => {
    const printWindow = window.open("about:blank", "_blank");
    try {
      const data = await ackMutation.mutateAsync({ paymentId });
      toast.success(`Acknowledgement Receipt ${data.receiptNumber} generated`);
      if (printWindow && data.id) {
        printWindow.location.href = `/api/acknowledgement-receipts/${data.id}/print`;
      }
    } catch {
      if (printWindow) printWindow.close();
    }
  };

  const totalPaid = paymentsList?.items?.reduce((s: number, r: any) => s + r.totalPaid, 0) || 0;
  const totalBilled = paymentsList?.items?.reduce((s: number, r: any) => s + (r.totalBilled || 0), 0) || 0;
  const outstanding = totalBilled - totalPaid;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Net Metering Payments</h1>
        <p className="text-muted-foreground mt-1">Track all net metering application payments across projects.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Billed</p>
            <p className="text-xl font-bold text-foreground">{formatPHP(totalBilled)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total NM Payments</p>
            <p className="text-xl font-bold text-green-400">{formatPHP(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Outstanding Balance</p>
            <p className="text-xl font-bold text-red-400">{formatPHP(outstanding)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total NM Records</p>
            <p className="text-xl font-bold text-foreground">{paymentsList?.total || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by project, customer, electric company..." className="pl-10 bg-input border-border" />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="border-border">
              <Filter className="h-4 w-4 mr-2" /> Filters {showFilters ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
            </Button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-border/50">
              <div><Label className="text-xs">Electric Company</Label><Input value={electricCompany} onChange={(e) => setElectricCompany(e.target.value)} placeholder="Filter by company" className="bg-input border-border" /></div>
              <div>
                <Label className="text-xs">Status</Label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full h-9 rounded-md border border-border bg-input px-3 text-sm">
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="approved">Approved</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div><Label className="text-xs">Date From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-input border-border" /></div>
              <div><Label className="text-xs">Date To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-input border-border" /></div>
              <div className="col-span-full flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setElectricCompany(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); }} className="text-muted-foreground">Clear Filters</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-foreground text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-400" /> NM Payment Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading...</p>
          ) : !paymentsList?.items?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No net metering records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Project</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Electric Co.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Payments</TableHead>
                    <TableHead>Last Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsList.items.map((r: any) => (
                    <TableRow key={r.id} className="border-border/30 hover:bg-muted/10 cursor-pointer" onClick={() => setViewingPayment(r)}>
                      <TableCell className="font-medium text-foreground">{r.projectName}</TableCell>
                      <TableCell className="text-foreground">{r.customerName}</TableCell>
                      <TableCell className="text-foreground">{r.electricCompany}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{r.status?.replace(/_/g, " ") || "-"}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {r.totalBilled ? formatPHP(r.totalBilled) : <span className="text-muted-foreground text-xs">Not billed</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-400">{formatPHP(r.totalPaid)}</TableCell>
                      <TableCell className={`text-right font-medium ${r.balance > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {r.totalBilled ? formatPHP(r.balance) : "-"}
                      </TableCell>
                      <TableCell className="text-center text-foreground">{r.paymentCount}</TableCell>
                      <TableCell className="text-muted-foreground">{r.lastPaymentDate ? new Date(r.lastPaymentDate).toLocaleDateString() : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {paymentsList && paymentsList.total > 20 && (
        <PaginationControls
          page={page}
          totalPages={Math.ceil(paymentsList.total / 20)}
          total={paymentsList.total}
          limit={20}
          onPageChange={setPage}
        />
      )}

      {/* Record detail — billing summary + each payment with its receipt */}
      <Dialog open={!!viewingPayment} onOpenChange={(open) => !open && setViewingPayment(null)}>
        <DialogContent className="max-w-3xl bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-3">
              {viewingPayment?.projectName}
              <Badge variant="outline" className="text-xs capitalize">
                {viewingPayment?.status?.replace(/_/g, " ") || "-"}
              </Badge>
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{viewingPayment?.customerName}</p>
          </DialogHeader>

          {/* Billing summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Billing No.</p>
              <p className="font-mono text-sm font-semibold text-foreground">{viewingPayment?.billingNumber || "Not billed"}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Total Billed</p>
              <p className="text-sm font-bold text-foreground">{viewingPayment?.totalBilled ? formatPHP(viewingPayment.totalBilled) : "-"}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="text-sm font-bold text-green-400">{formatPHP(viewingPayment?.totalPaid)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-sm font-bold text-red-400">{viewingPayment?.totalBilled ? formatPHP(viewingPayment.balance) : "-"}</p>
            </div>
          </div>

          {/* Payments with receipts */}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Payments</p>
            {!recordPayments?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded for this record yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Amount</th>
                      <th className="text-left py-2 px-3">Method</th>
                      <th className="text-left py-2 px-3">Reference</th>
                      <th className="text-right py-2 px-3">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordPayments.map((p: any) => (
                      <tr key={p.id} className="border-b border-border/30 hover:bg-muted/10">
                        <td className="py-2 px-3 text-foreground">{new Date(p.paymentDate).toLocaleDateString()}</td>
                        <td className="py-2 px-3 text-right font-medium text-green-400">{formatPHP(p.amount)}</td>
                        <td className="py-2 px-3 text-foreground">{p.paymentMethod || "-"}</td>
                        <td className="py-2 px-3 text-foreground">{p.paymentReference || "-"}</td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-border"
                            onClick={() => handleReceipt(p.id)}
                            disabled={ackMutation.isPending}
                            title="Generate & print acknowledgement receipt"
                          >
                            <FileText className="h-4 w-4 mr-1" /> Receipt
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            {viewingPayment?.billingNumber && (
              <Button
                size="sm"
                variant="outline"
                className="border-border"
                onClick={() => window.open(`/api/net-metering/${viewingPayment.id}/billing/pdf`, "_blank")}
              >
                <FileText className="h-4 w-4 mr-2" /> Print Billing
              </Button>
            )}
            {viewingPayment?.projectId && (
              <Button
                size="sm"
                variant="outline"
                className="border-border"
                onClick={() => { navigate(`/projects/${viewingPayment.projectId}`); setViewingPayment(null); }}
              >
                View Project
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
