import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardLayout from "@/components/DashboardLayout";
import PaginationControls from "@/components/PaginationControls";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/utils";
import { Search, Zap, Filter, ChevronDown, ChevronUp } from "lucide-react";
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

  const totalPaid = paymentsList?.items?.reduce((s: number, r: any) => s + r.totalPaid, 0) || 0;
  const withPayments = paymentsList?.items?.filter((r: any) => r.paymentCount > 0).length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Net Metering Payments</h1>
          <p className="text-muted-foreground mt-1">Track all net metering application payments across projects.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total NM Payments</p>
              <p className="text-xl font-bold text-green-400">{formatPHP(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total NM Records</p>
              <p className="text-xl font-bold text-foreground">{paymentsList?.total || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Records with Payments</p>
              <p className="text-xl font-bold text-blue-400">{withPayments}</p>
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
                      <TableHead className="text-right">Total Paid</TableHead>
                      <TableHead className="text-center">Payments</TableHead>
                      <TableHead>Last Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsList.items.map((r: any) => (
                      <TableRow key={r.id} className="border-border/30 hover:bg-muted/10 cursor-pointer" onClick={() => r.projectId && navigate(`/projects/${r.projectId}`)}>
                        <TableCell className="font-medium text-foreground">{r.projectName}</TableCell>
                        <TableCell className="text-foreground">{r.customerName}</TableCell>
                        <TableCell className="text-foreground">{r.electricCompany}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{r.status?.replace(/_/g, " ") || "-"}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-400">{formatPHP(r.totalPaid)}</TableCell>
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
      </div>
    </DashboardLayout>
  );
}
