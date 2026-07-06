import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Search, ArrowUpCircle, ArrowDownCircle, RefreshCw, ArrowRightLeft, Wrench, Package, CalendarDays, X } from "lucide-react";
import { useState, useMemo } from "react";

export default function InventoryAuditLog() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fromTimestamp = useMemo(() => {
    if (!fromDate) return undefined;
    return new Date(fromDate).getTime();
  }, [fromDate]);

  const toTimestamp = useMemo(() => {
    if (!toDate) return undefined;
    // Set to end of day
    const d = new Date(toDate);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, [toDate]);

  const { data: logs, isLoading } = trpc.inventoryAudit.list.useQuery({
    search: search || undefined,
    transactionType: typeFilter === "all" ? undefined : typeFilter,
    fromDate: fromTimestamp,
    toDate: toTimestamp,
  });

  const clearDateRange = () => {
    setFromDate("");
    setToDate("");
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "stock_in": return <ArrowUpCircle className="h-4 w-4 text-green-400" />;
      case "stock_out": return <ArrowDownCircle className="h-4 w-4 text-red-400" />;
      case "transfer_in": return <ArrowRightLeft className="h-4 w-4 text-blue-400" />;
      case "transfer_out": return <ArrowRightLeft className="h-4 w-4 text-orange-400" />;
      case "adjustment": return <Wrench className="h-4 w-4 text-yellow-400" />;
      case "initial": return <Package className="h-4 w-4 text-purple-400" />;
      default: return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      stock_in: "bg-green-500/20 text-green-400 border-green-500/30",
      stock_out: "bg-red-500/20 text-red-400 border-red-500/30",
      transfer_in: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      transfer_out: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      adjustment: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      initial: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    const labels: Record<string, string> = {
      stock_in: "Stock In",
      stock_out: "Stock Out",
      transfer_in: "Transfer In",
      transfer_out: "Transfer Out",
      adjustment: "Adjustment",
      initial: "Initial",
    };
    return <Badge className={colors[type] || ""}>{labels[type] || type}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory Audit Trail</h1>
          <p className="text-muted-foreground mt-1">Complete history of all stock movements, adjustments, and transfers.</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by item name, SKU, or user..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-input border-border" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44 bg-input border-border"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="stock_in">Stock In</SelectItem>
              <SelectItem value="stock_out">Stock Out</SelectItem>
              <SelectItem value="transfer_in">Transfer In</SelectItem>
              <SelectItem value="transfer_out">Transfer Out</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
              <SelectItem value="initial">Initial</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36 bg-input border-border" placeholder="From" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36 bg-input border-border" placeholder="To" />
            {(fromDate || toDate) && (
              <Button variant="ghost" size="icon" onClick={clearDateRange} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Item</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Qty</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Previous</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">New</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Location</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Purpose/Reference</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">By</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : logs?.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No audit records found.</td></tr>
                  ) : (
                    logs?.map((log: any) => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4">{typeBadge(log.transactionType)}</td>
                        <td className="p-4">
                          <div className="font-medium text-foreground">{log.itemName || `Item #${log.itemId}`}</div>
                          <div className="text-xs text-muted-foreground">{log.itemSku}</div>
                        </td>
                        <td className="p-4 text-sm font-medium">
                          <span className={log.transactionType === 'stock_in' || log.transactionType === 'transfer_in' ? "text-green-400" : log.transactionType === 'stock_out' || log.transactionType === 'transfer_out' ? "text-red-400" : "text-yellow-400"}>
                            {log.transactionType === 'stock_in' || log.transactionType === 'transfer_in' ? "+" : log.transactionType === 'stock_out' || log.transactionType === 'transfer_out' ? "-" : "±"}{Math.abs(log.quantity)}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{log.previousStock}</td>
                        <td className="p-4 text-sm text-foreground font-medium">{log.newStock}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {log.sourceLocation && log.destinationLocation ? (
                            <span>{log.sourceLocation} → {log.destinationLocation}</span>
                          ) : (
                            <span>{log.sourceLocation || log.destinationLocation || "-"}</span>
                          )}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          <div>{log.purpose || "-"}</div>
                          {log.reference && <div className="text-xs opacity-70">{log.reference}</div>}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{log.performedByName || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
