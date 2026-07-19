import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Package, CreditCard, Truck, Plus, Printer, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

const deliveryStatusColors: Record<string, string> = {
  not_delivered: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  partially_delivered: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  fully_delivered: "bg-green-500/20 text-green-400 border-green-500/30",
};
const deliveryStatusLabels: Record<string, string> = {
  not_delivered: "Not Delivered",
  partially_delivered: "Partially Delivered",
  fully_delivered: "Fully Delivered",
};
const paymentStatusColors: Record<string, string> = {
  unpaid: "bg-red-500/20 text-red-400 border-red-500/30",
  partially_paid: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  paid: "bg-green-500/20 text-green-400 border-green-500/30",
};
const paymentStatusLabels: Record<string, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially Paid",
  paid: "Paid",
};
const statusColors: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  sent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  received: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};
const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "PO sent to supplier",
  received: "PO received by supplier",
  cancelled: "PO cancelled by JMC",
};

type DateParts = { y: number; m: number; d: number };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function todayParts(): DateParts {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}
function partsToISO(p: DateParts): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Month / Day / Year dropdown trio. */
function DateSelect({ value, onChange }: { value: DateParts; onChange: (v: DateParts) => void }) {
  const cls = "rounded-md border border-border bg-input px-2 py-2 text-sm text-foreground";
  const cy = new Date().getFullYear();
  const years: number[] = [];
  for (let y = cy - 4; y <= cy + 1; y++) years.push(y);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <div className="flex gap-2">
      <select className={cls} value={value.m} onChange={(e) => onChange({ ...value, m: Number(e.target.value) })}>
        {MONTHS.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
      </select>
      <select className={cls} value={value.d} onChange={(e) => onChange({ ...value, d: Number(e.target.value) })}>
        {days.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select className={cls} value={value.y} onChange={(e) => onChange({ ...value, y: Number(e.target.value) })}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

export default function PurchaseOrderDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const poId = parseInt(params.id || "0");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [statusDate, setStatusDate] = useState<DateParts>(todayParts());
  const [deliveryDate, setDeliveryDate] = useState<DateParts>(todayParts());
  const utils = trpc.useUtils();

  const { data: po, isLoading } = trpc.purchaseOrders.get.useQuery({ id: poId }, { enabled: poId > 0 });
  const { data: paymentMethods } = trpc.config.getOptions.useQuery({ category: "payment_method" });

  const updateMutation = trpc.purchaseOrders.update.useMutation({
    onSuccess: () => { toast.success("PO updated"); utils.purchaseOrders.get.invalidate({ id: poId }); setStatusDialogOpen(false); },
    onError: (err: any) => toast.error(err.message),
  });

  const addPaymentMutation = trpc.purchaseOrders.addPayment.useMutation({
    onSuccess: () => { toast.success("Payment recorded"); utils.purchaseOrders.get.invalidate({ id: poId }); setPaymentDialogOpen(false); setPaymentMethod(""); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAddPayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addPaymentMutation.mutate({
      purchaseOrderId: poId,
      amount: fd.get("amount") as string,
      paymentDate: fd.get("paymentDate") as string,
      paymentMethod: paymentMethod || undefined,
      reference: (fd.get("reference") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const handleStatusUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: poId,
      status: (fd.get("status") as string) || undefined,
      deliveryStatus: (fd.get("deliveryStatus") as string) || undefined,
      statusDate: partsToISO(statusDate),
      deliveryDate: partsToISO(deliveryDate),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
    );
  }

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Purchase order not found.</p>
        <Button variant="outline" onClick={() => navigate("/purchase-orders")}>Back to POs</Button>
      </div>
    );
  }

  const totalPaid = parseFloat(po.paidAmount || "0");
  const totalAmount = parseFloat(po.totalAmount || "0");
  const balance = totalAmount - totalPaid;
  // VAT/Discount calculations for display
  const poSubtotal = po.items?.reduce((sum: number, item: any) => sum + parseFloat(item.lineTotal || "0"), 0) || 0;
  const poVatEnabled = po.vatEnabled === 1 || (po.vatEnabled as any) === true;
  const poVatRate = parseFloat(po.vatRate || "12");
  const poDiscountType = po.discountType || "none";
  const poDiscountValue = parseFloat(po.discountValue || "0");
  const poDiscountAmount = poDiscountType === "percentage" ? poSubtotal * (poDiscountValue / 100) : poDiscountType === "fixed" ? poDiscountValue : 0;
  const poAfterDiscount = poSubtotal - poDiscountAmount;
  const poVatAmount = poVatEnabled ? poAfterDiscount * (poVatRate / 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/purchase-orders")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground font-mono">{po.poNumber}</h1>
            <p className="text-muted-foreground mt-1">Supplier: <span className="text-foreground font-medium">{po.supplier}</span></p>
            {po.createdByName && <p className="text-muted-foreground text-sm mt-0.5">Prepared by: <span className="text-foreground">{po.createdByName}</span></p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border" onClick={() => window.open(`/api/purchase-orders/${po.id}/pdf`, '_blank')}>
            <Printer className="h-4 w-4 mr-2" /> Print / PDF
          </Button>
          <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border"><Truck className="h-4 w-4 mr-2" /> Update Status</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Update PO Status</DialogTitle></DialogHeader>
              <form onSubmit={handleStatusUpdate} className="space-y-4">
                <div>
                  <Label>Order Status</Label>
                  <select name="status" defaultValue={po.status} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="draft">Draft</option>
                    <option value="sent">PO sent to supplier</option>
                    <option value="received">PO received by supplier</option>
                    <option value="cancelled">PO cancelled by JMC</option>
                  </select>
                </div>
                <div>
                  <Label>Status Date</Label>
                  <DateSelect value={statusDate} onChange={setStatusDate} />
                  <p className="text-xs text-muted-foreground mt-1">Recorded only when the order status changes.</p>
                </div>
                <div>
                  <Label>Delivery Status</Label>
                  <select name="deliveryStatus" defaultValue={po.deliveryStatus} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="not_delivered">Not Delivered</option>
                    <option value="partially_delivered">Partially Delivered</option>
                    <option value="fully_delivered">Fully Delivered</option>
                  </select>
                </div>
                <div>
                  <Label>Delivery Date</Label>
                  <DateSelect value={deliveryDate} onChange={setDeliveryDate} />
                  <p className="text-xs text-muted-foreground mt-1">Recorded only when the delivery status changes.</p>
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Updating..." : "Update Status"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><CreditCard className="h-4 w-4 mr-2" /> Record Payment</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Record Payment</DialogTitle></DialogHeader>
              <form onSubmit={handleAddPayment} className="space-y-4">
                <div>
                  <Label>Amount (₱) *</Label>
                  <Input name="amount" type="number" step="0.01" required className="bg-input border-border" placeholder={`Balance: ₱${balance.toLocaleString()}`} />
                </div>
                <div>
                  <Label>Payment Date *</Label>
                  <Input name="paymentDate" type="date" required className="bg-input border-border" defaultValue={new Date().toISOString().split("T")[0]} />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Select method..." /></SelectTrigger>
                    <SelectContent>
                      {paymentMethods?.map((m: any) => (
                        <SelectItem key={m.id} value={m.value}>{m.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference (Check #, Transfer Ref, etc.)</Label>
                  <Input name="reference" className="bg-input border-border" placeholder="e.g. CHK-12345 or BT-2024-001" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea name="notes" className="bg-input border-border" />
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={addPaymentMutation.isPending}>
                  {addPaymentMutation.isPending ? "Recording..." : "Record Payment"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Order Status</p>
            <Badge variant="outline" className={statusColors[po.status]}>{statusLabels[po.status] ?? po.status}</Badge>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Delivery</p>
            <Badge variant="outline" className={deliveryStatusColors[po.deliveryStatus]}>{deliveryStatusLabels[po.deliveryStatus]}</Badge>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Payment</p>
            <Badge variant="outline" className={paymentStatusColors[po.paymentStatus]}>{paymentStatusLabels[po.paymentStatus]}</Badge>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Balance</p>
            <p className="text-lg font-bold text-foreground">₱{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">of ₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status History Timeline */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2"><Truck className="h-5 w-5" /> Status History</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const rows: { label: string; kind: string; date: Date; by?: string }[] = [
              { label: "PO created", kind: "order", date: new Date(po.createdAt), by: po.createdByName },
              ...((po.statusHistory ?? []) as any[]).map((h: any) => ({
                label: h.type === "delivery" ? (deliveryStatusLabels[h.status] ?? h.status) : (statusLabels[h.status] ?? h.status),
                kind: h.type === "delivery" ? "delivery" : "order",
                date: new Date(h.eventDate),
                by: h.changedByName,
              })),
            ].sort((a, b) => a.date.getTime() - b.date.getTime());
            return (
              <ol className="relative ml-2 border-l border-border">
                {rows.map((r, i) => (
                  <li key={i} className="ml-4 pb-5 last:pb-0">
                    <span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-card ${r.kind === "delivery" ? "bg-green-400" : "bg-blue-400"}`} />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-foreground">{r.label}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.kind}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      {r.by ? ` · by ${r.by}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            );
          })()}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2"><Package className="h-5 w-5" /> Line Items ({po.items?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">SKU</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Item</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Description</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Unit</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Qty</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Unit Price</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {po.items?.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="p-4 text-sm font-mono text-muted-foreground">{item.itemSku}</td>
                    <td className="p-4 font-medium text-foreground">{item.itemName}</td>
                    <td className="p-4 text-sm text-muted-foreground">{item.description || "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{item.unit || "pcs"}</td>
                    <td className="p-4 text-sm text-foreground text-right">{item.quantity}</td>
                    <td className="p-4 text-sm text-foreground text-right">₱{Number(item.unitPrice || 0).toLocaleString()}</td>
                    <td className="p-4 text-sm font-medium text-foreground text-right">₱{Number(item.lineTotal || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={6} className="p-4 text-right text-sm text-muted-foreground">Subtotal:</td>
                  <td className="p-4 text-right font-medium text-foreground">₱{poSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
                {poDiscountAmount > 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-right text-sm text-muted-foreground">
                      Discount ({poDiscountType === "percentage" ? `${poDiscountValue}%` : "Fixed"}):
                    </td>
                    <td className="p-4 text-right font-medium text-red-400">-₱{poDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                )}
                {poVatEnabled && (
                  <tr>
                    <td colSpan={6} className="p-4 text-right text-sm text-muted-foreground">VAT ({poVatRate}%):</td>
                    <td className="p-4 text-right font-medium text-foreground">₱{poVatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                )}
                <tr className="border-t border-border">
                  <td colSpan={6} className="p-4 text-right font-medium text-foreground">Grand Total:</td>
                  <td className="p-4 text-right font-bold text-foreground text-lg">₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Records */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2"><CreditCard className="h-5 w-5" /> Payment Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!po.payments || po.payments.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Method</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Reference</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {po.payments.map((payment: any) => (
                    <tr key={payment.id} className="border-b border-border/50">
                      <td className="p-4 text-sm text-foreground">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                      <td className="p-4 font-medium text-foreground">₱{Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-sm text-muted-foreground">{payment.paymentMethod || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{payment.reference || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{payment.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="p-4 font-medium text-foreground">Total Paid:</td>
                    <td className="p-4 font-bold text-green-400">₱{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {po.notes && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-foreground text-lg">Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{po.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
