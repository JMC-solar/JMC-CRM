import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Eye, Printer } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import PaginationControls from "@/components/PaginationControls";

const deliveryStatusColors: Record<string, string> = {
  not_delivered: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  partially_delivered: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  fully_delivered: "bg-green-500/20 text-green-400 border-green-500/30",
};

const deliveryStatusLabels: Record<string, string> = {
  not_delivered: "Not Delivered",
  partially_delivered: "Partial",
  fully_delivered: "Delivered",
};

const paymentStatusColors: Record<string, string> = {
  unpaid: "bg-red-500/20 text-red-400 border-red-500/30",
  partially_paid: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  paid: "bg-green-500/20 text-green-400 border-green-500/30",
};

const paymentStatusLabels: Record<string, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partial",
  paid: "Paid",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  sent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  received: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function PurchaseOrders() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.purchaseOrders.list.useQuery({
    search: search || undefined,
    deliveryStatus: deliveryFilter === "all" ? undefined : deliveryFilter,
    paymentStatus: paymentFilter === "all" ? undefined : paymentFilter,
    page,
    limit: 20,
  });
  const orders = data?.items;

  // Clamp page
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const handleSearchChange = (value: string) => { setSearch(value); setPage(1); };
  const handleDeliveryChange = (value: string) => { setDeliveryFilter(value); setPage(1); };
  const handlePaymentChange = (value: string) => { setPaymentFilter(value); setPage(1); };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
            <p className="text-muted-foreground mt-1">Manage supplier purchase orders, deliveries, and payments.</p>
          </div>
          <Button className="bg-primary text-primary-foreground" onClick={() => navigate("/purchase-orders/new")}>
            <Plus className="h-4 w-4 mr-2" /> Create PO
          </Button>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search PO#, supplier, items, notes, dates..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 bg-input border-border" />
          </div>
          <Select value={deliveryFilter} onValueChange={handleDeliveryChange}>
            <SelectTrigger className="w-44 bg-input border-border"><SelectValue placeholder="Delivery Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Delivery</SelectItem>
              <SelectItem value="not_delivered">Not Delivered</SelectItem>
              <SelectItem value="partially_delivered">Partially Delivered</SelectItem>
              <SelectItem value="fully_delivered">Fully Delivered</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={handlePaymentChange}>
            <SelectTrigger className="w-44 bg-input border-border"><SelectValue placeholder="Payment Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payment</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partially_paid">Partially Paid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">PO Number</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Supplier</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Delivery</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Payment</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : !orders || orders.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No purchase orders found.</td></tr>
                  ) : (
                    orders.map((po: any) => (
                      <tr key={po.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                        <td className="p-4 font-mono text-sm text-foreground">{po.poNumber}</td>
                        <td className="p-4 font-medium text-foreground">{po.supplier}</td>
                        <td className="p-4"><Badge variant="outline" className={statusColors[po.status]}>{po.status}</Badge></td>
                        <td className="p-4"><Badge variant="outline" className={deliveryStatusColors[po.deliveryStatus]}>{deliveryStatusLabels[po.deliveryStatus]}</Badge></td>
                        <td className="p-4"><Badge variant="outline" className={paymentStatusColors[po.paymentStatus]}>{paymentStatusLabels[po.paymentStatus]}</Badge></td>
                        <td className="p-4 text-foreground">{po.totalAmount ? `₱${Number(po.totalAmount).toLocaleString()}` : "-"}</td>
                        <td className="p-4 text-sm text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/purchase-orders/${po.id}`); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); window.open(`/api/purchase-orders/${po.id}/pdf`, '_blank'); }} title="Print PO">
                            <Printer className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data && (
              <PaginationControls
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                limit={data.limit}
                onPageChange={setPage}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
