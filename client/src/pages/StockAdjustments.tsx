import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Check, X, Clock, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function StockAdjustments() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: adjustments, isLoading } = trpc.stockAdjustments.list.useQuery({ status: statusFilter === "all" ? undefined : statusFilter });
  const { data: inventoryItems } = trpc.inventory.listAll.useQuery();

  const requestMutation = trpc.stockAdjustments.request.useMutation({
    onSuccess: () => { toast.success(isAdmin ? "Adjustment applied" : "Adjustment requested"); setIsCreateOpen(false); utils.stockAdjustments.list.invalidate(); utils.inventory.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const approveMutation = trpc.stockAdjustments.approve.useMutation({
    onSuccess: () => { toast.success("Adjustment approved and applied"); utils.stockAdjustments.list.invalidate(); utils.inventory.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const rejectMutation = trpc.stockAdjustments.reject.useMutation({
    onSuccess: () => { toast.success("Adjustment rejected"); utils.stockAdjustments.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleRequest = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    requestMutation.mutate({
      itemId: parseInt(fd.get("itemId") as string),
      newQuantity: parseInt(fd.get("newQuantity") as string),
      reason: fd.get("reason") as string,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Stock Adjustments</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? "Review and approve stock adjustment requests." : "Request stock corrections (requires admin approval)."}
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> {isAdmin ? "Adjust Stock" : "Request Adjustment"}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">{isAdmin ? "Adjust Stock" : "Request Stock Adjustment"}</DialogTitle></DialogHeader>
              <form onSubmit={handleRequest} className="space-y-4">
                <div>
                  <Label>Item *</Label>
                  <select name="itemId" required className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="">-- Select Item --</option>
                    {inventoryItems?.map((item: any) => (
                      <option key={item.id} value={item.id}>{item.name} ({item.sku}) — Current: {item.stockOnHand}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>New Quantity *</Label>
                  <Input name="newQuantity" type="number" min="0" required className="bg-input border-border" placeholder="Enter corrected quantity" />
                </div>
                <div>
                  <Label>Reason *</Label>
                  <select name="reason" required className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="">-- Select Reason --</option>
                    <option value="Physical Count Discrepancy">Physical Count Discrepancy</option>
                    <option value="Damaged/Defective Items">Damaged/Defective Items</option>
                    <option value="System Error Correction">System Error Correction</option>
                    <option value="Expired/Obsolete Stock">Expired/Obsolete Stock</option>
                    <option value="Theft/Loss">Theft/Loss</option>
                    <option value="Receiving Error">Receiving Error</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea name="notes" className="bg-input border-border" placeholder="Additional details..." />
                </div>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">This request will be submitted for admin approval before stock is updated.</p>
                )}
                {isAdmin && (
                  <p className="text-xs text-amber-400">As admin, this adjustment will be applied immediately.</p>
                )}
                <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={requestMutation.isPending}>
                  {isAdmin ? "Apply Adjustment" : "Submit Request"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-input border-border"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Item</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Previous</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">New</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Change</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Reason</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Requested By</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                    {isAdmin && <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : adjustments?.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No adjustments found.</td></tr>
                  ) : (
                    adjustments?.map((adj: any) => (
                      <tr key={adj.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-foreground">{adj.itemName || `Item #${adj.itemId}`}</div>
                          <div className="text-xs text-muted-foreground">{adj.itemSku}</div>
                        </td>
                        <td className="p-4 text-sm text-foreground">{adj.previousQuantity}</td>
                        <td className="p-4 text-sm text-foreground font-medium">{adj.newQuantity}</td>
                        <td className="p-4 text-sm">
                          <span className={adj.adjustmentQuantity > 0 ? "text-green-400" : adj.adjustmentQuantity < 0 ? "text-red-400" : "text-muted-foreground"}>
                            {adj.adjustmentQuantity > 0 ? "+" : ""}{adj.adjustmentQuantity}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{adj.reason}</td>
                        <td className="p-4 text-sm text-muted-foreground">{adj.requestedByName}</td>
                        <td className="p-4">{statusBadge(adj.status)}</td>
                        <td className="p-4 text-sm text-muted-foreground">{new Date(adj.createdAt).toLocaleDateString()}</td>
                        {isAdmin && (
                          <td className="p-4">
                            {adj.status === "pending" && (
                              <div className="flex gap-2">
                                <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300" onClick={() => approveMutation.mutate({ id: adj.id })} disabled={approveMutation.isPending}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => rejectMutation.mutate({ id: adj.id })} disabled={rejectMutation.isPending}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            {adj.status !== "pending" && (
                              <span className="text-xs text-muted-foreground">{adj.approvedByName}</span>
                            )}
                          </td>
                        )}
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
