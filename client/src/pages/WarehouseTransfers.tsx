import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowRightLeft, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import DetailDialog from "@/components/DetailDialog";

export default function WarehouseTransfers() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: inventoryItems } = trpc.inventory.listAll.useQuery();
  const { data: locationOptions } = trpc.config.getOptions.useQuery({ category: "storage_location" });
  const { data: auditLogs, isLoading } = trpc.inventoryAudit.list.useQuery({ transactionType: "transfer_out" });

  const transferMutation = trpc.stockTransactions.transfer.useMutation({
    onSuccess: () => { toast.success("Transfer completed"); setIsCreateOpen(false); utils.inventoryAudit.list.invalidate(); utils.inventory.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleTransfer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const source = fd.get("sourceLocation") as string;
    const dest = fd.get("destinationLocation") as string;
    if (source === dest) {
      toast.error("Source and destination must be different");
      return;
    }
    transferMutation.mutate({
      itemId: parseInt(fd.get("itemId") as string),
      quantity: parseInt(fd.get("quantity") as string),
      sourceLocation: source,
      destinationLocation: dest,
      reference: (fd.get("reference") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Warehouse Transfers</h1>
          <p className="text-muted-foreground mt-1">Transfer stock between storage locations.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> New Transfer</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Create Warehouse Transfer</DialogTitle></DialogHeader>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <Label>Item *</Label>
                <select name="itemId" required className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- Select Item --</option>
                  {inventoryItems?.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.sku}) — Stock: {item.stockOnHand}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Quantity *</Label>
                <Input name="quantity" type="number" min="1" required className="bg-input border-border" />
              </div>
              <div>
                <Label>Source Location *</Label>
                <select name="sourceLocation" required className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- Select Source --</option>
                  {locationOptions?.map((opt: any) => (
                    <option key={opt.id} value={opt.value}>{opt.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Destination Location *</Label>
                <select name="destinationLocation" required className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- Select Destination --</option>
                  {locationOptions?.map((opt: any) => (
                    <option key={opt.id} value={opt.value}>{opt.value}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Reference</Label>
                <Input name="reference" className="bg-input border-border" placeholder="e.g., Transfer Request #001" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" className="bg-input border-border" placeholder="Additional details..." />
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={transferMutation.isPending}>
                <ArrowRightLeft className="h-4 w-4 mr-2" /> Complete Transfer
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Item</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Quantity</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">From</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">To</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Reference</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">By</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : auditLogs?.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No transfers found.</td></tr>
                ) : (
                  auditLogs?.map((log: any) => (
                    <tr
                      key={log.id}
                      onClick={() => setViewingTransfer(log)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-4">
                        <div className="font-medium text-foreground">{log.itemName || `Item #${log.itemId}`}</div>
                        <div className="text-xs text-muted-foreground">{log.itemSku}</div>
                      </td>
                      <td className="p-4 text-sm text-foreground font-medium">{log.quantity}</td>
                      <td className="p-4 text-sm text-muted-foreground">{log.sourceLocation || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{log.destinationLocation || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{log.reference || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{log.performedByName || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DetailDialog
        open={!!viewingTransfer}
        onOpenChange={(open) => !open && setViewingTransfer(null)}
        title={viewingTransfer?.itemName || (viewingTransfer ? `Item #${viewingTransfer.itemId}` : "")}
        subtitle={viewingTransfer?.itemSku || undefined}
        sections={[
          {
            title: "Transfer Details",
            fields: [
              { label: "Quantity", value: viewingTransfer?.quantity },
              { label: "Previous Stock", value: viewingTransfer?.previousStock },
              { label: "New Stock", value: viewingTransfer?.newStock },
              { label: "Source Location", value: viewingTransfer?.sourceLocation },
              { label: "Destination Location", value: viewingTransfer?.destinationLocation },
              { label: "Reference", value: viewingTransfer?.reference },
              { label: "Performed By", value: viewingTransfer?.performedByName },
              { label: "Date", value: viewingTransfer ? new Date(viewingTransfer.createdAt).toLocaleString() : undefined },
            ],
          },
          {
            title: "Notes",
            fields: [
              { label: "Purpose", value: viewingTransfer?.purpose },
              { label: "Notes", value: viewingTransfer?.notes, full: true },
            ],
          },
        ]}
      />
    </div>
  );
}
