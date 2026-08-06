import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Edit, Trash2, Info, Printer, Wallet } from "lucide-react";
import DetailDialog from "@/components/DetailDialog";
import ContactCombobox, { ContactOption } from "@/components/ContactCombobox";
import PaginationControls from "@/components/PaginationControls";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { formatPHP } from "@/lib/utils";

// ============ LINE ITEMS EDITOR ============
type LineItemRow = { key: string; itemId: number | null; quantity: string };

function newRow(): LineItemRow {
  return { key: Math.random().toString(36).slice(2), itemId: null, quantity: "1" };
}

/**
 * Pure summary used both for the editor's own inline errors and for the parent
 * dialog's submit-button gating, so the two never disagree about validity.
 */
function summarizeLineItems(rows: LineItemRow[], inventoryList: any[] | undefined) {
  const itemById = new Map((inventoryList ?? []).map((i: any) => [i.id, i]));
  let total = 0;
  let valid = rows.length > 0;
  for (const row of rows) {
    const item = row.itemId != null ? itemById.get(row.itemId) : undefined;
    const qty = parseInt(row.quantity) || 0;
    if (!item || qty <= 0 || qty > item.stockOnHand || item.sellingPrice == null || item.sellingPrice === "") {
      valid = false;
      continue;
    }
    total += qty * Number(item.sellingPrice);
  }
  return { total, valid };
}

/**
 * Multiple inventory-backed line items per sale. Items are always chosen from the
 * Inventory dropdown — there is no free-text path — and quantity is validated against
 * stockOnHand client-side so the user isn't surprised by a server rejection.
 *
 * Duplicate items are blocked rather than merged: picking an item already used on
 * another row is rejected with a toast, and that item is disabled in every other
 * row's dropdown, so a sale only ever has one row per item.
 */
function LineItemsEditor({
  rows,
  onChange,
  inventoryList,
  onSummaryChange,
}: {
  rows: LineItemRow[];
  onChange: (rows: LineItemRow[]) => void;
  inventoryList: any[] | undefined;
  onSummaryChange: (summary: { total: number; valid: boolean }) => void;
}) {
  const itemById = new Map((inventoryList ?? []).map((i: any) => [i.id, i]));
  const usedItemIds = new Set(rows.map((r) => r.itemId).filter((id): id is number => id != null));

  useEffect(() => {
    onSummaryChange(summarizeLineItems(rows, inventoryList));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, inventoryList]);

  const updateRow = (key: string, patch: Partial<LineItemRow>) => {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => onChange(rows.filter((r) => r.key !== key));
  const addRow = () => onChange([...rows, newRow()]);

  const handleSelectItem = (key: string, itemIdStr: string) => {
    const itemId = itemIdStr ? parseInt(itemIdStr) : null;
    if (itemId != null && usedItemIds.has(itemId) && rows.find((r) => r.key === key)?.itemId !== itemId) {
      toast.error("That item is already on this sale. Adjust its quantity on the existing row instead.");
      return;
    }
    updateRow(key, { itemId });
  };

  let runningTotal = 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Items Purchased *</Label>
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          <Plus className="h-3 w-3 mr-1" /> Add Item
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No items added. Add at least one item to record this sale.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const item = row.itemId != null ? itemById.get(row.itemId) : undefined;
            const qty = parseInt(row.quantity) || 0;
            const hasPrice = item && item.sellingPrice != null && item.sellingPrice !== "";
            const lineTotal = item && hasPrice ? qty * Number(item.sellingPrice) : 0;
            const overStock = item && qty > item.stockOnHand;
            const invalidQty = row.quantity !== "" && qty <= 0;
            if (item && hasPrice && !overStock && !invalidQty) runningTotal += lineTotal;

            return (
              <div key={row.key} className="p-3 rounded-md border border-border/50 bg-muted/20 space-y-2">
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <select
                      value={row.itemId ?? ""}
                      onChange={(e) => handleSelectItem(row.key, e.target.value)}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">Select inventory item...</option>
                      {inventoryList?.map((it: any) => (
                        <option key={it.id} value={it.id} disabled={usedItemIds.has(it.id) && it.id !== row.itemId}>
                          {it.name} ({it.sku}) — {it.stockOnHand} in stock
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                      className="bg-input border-border"
                    />
                  </div>
                  <div className="w-28 text-right text-sm font-medium text-foreground pt-2">
                    {item ? (hasPrice ? formatPHP(lineTotal) : "—") : "—"}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {item && !hasPrice && (
                  <p className="text-xs text-destructive">This item has no selling price set in Inventory — it cannot be sold until one is set.</p>
                )}
                {item && overStock && (
                  <p className="text-xs text-destructive">Only {item.stockOnHand} in stock — requested {qty}.</p>
                )}
                {invalidQty && <p className="text-xs text-destructive">Quantity must be at least 1.</p>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end text-sm font-semibold text-foreground">Total: {formatPHP(runningTotal)}</div>
    </div>
  );
}

// ============ CREATE RETAIL SALE DIALOG ============
function CreateRetailSaleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [contact, setContact] = useState<ContactOption | null>(null);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineItemRow[]>([newRow()]);
  const [summary, setSummary] = useState({ total: 0, valid: false });
  const utils = trpc.useUtils();

  const { data: inventoryList } = trpc.inventory.listAll.useQuery(undefined, { enabled: open });

  const resetForm = () => {
    setContact(null);
    setSaleDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setRows([newRow()]);
  };

  const createMutation = trpc.retail.create.useMutation({
    onSuccess: () => {
      toast.success("Retail sale recorded");
      onOpenChange(false);
      utils.retail.list.invalidate();
      utils.inventory.listAll.invalidate();
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) { toast.error("Select a customer"); return; }
    if (!summary.valid) { toast.error("Fix the item rows before submitting"); return; }
    createMutation.mutate({
      contactId: contact.id,
      saleDate: new Date(saleDate).toISOString(),
      notes: notes || undefined,
      items: rows
        .filter((r) => r.itemId != null)
        .map((r) => ({ itemId: r.itemId as number, quantity: parseInt(r.quantity) || 0 })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-foreground">Add Retail Sale</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Customer *</Label>
            <ContactCombobox value={contact} onChange={setContact} placeholder="Search and select customer..." />
          </div>
          <div><Label>Sale Date</Label><Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="bg-input border-border" /></div>

          <LineItemsEditor rows={rows} onChange={setRows} inventoryList={inventoryList} onSummaryChange={setSummary} />

          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-input border-border" rows={2} /></div>

          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending || !contact || !summary.valid}>
            {createMutation.isPending ? "Recording..." : "Record Sale"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ EDIT RETAIL SALE DIALOG ============
// Line items are immutable server-side after creation — the server rejects any
// attempt to change them on update. This dialog therefore shows the purchased
// items read-only with a clear callout, rather than editable rows that would be
// silently discarded on save.
function EditRetailSaleDialog({ saleId, open, onOpenChange }: { saleId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: sale } = trpc.retail.get.useQuery({ id: saleId }, { enabled: open });
  const utils = trpc.useUtils();

  const [contact, setContact] = useState<ContactOption | null>(null);
  const [saleDate, setSaleDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (sale) {
      // retail.get only returns contactId + the resolved display name, not a full
      // Contact row — that's enough to populate the combobox's button label.
      setContact({ id: sale.contactId, firstName: sale.customerName || `Customer #${sale.contactId}`, lastName: null });
      setSaleDate(new Date(sale.saleDate).toISOString().slice(0, 10));
      setNotes(sale.notes || "");
    }
  }, [sale]);

  const updateMutation = trpc.retail.update.useMutation({
    onSuccess: () => {
      toast.success("Retail sale updated");
      onOpenChange(false);
      utils.retail.list.invalidate();
      utils.retail.get.invalidate({ id: saleId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) { toast.error("Select a customer"); return; }
    updateMutation.mutate({
      id: saleId,
      contactId: contact.id,
      saleDate: new Date(saleDate).toISOString(),
      notes: notes || undefined,
    });
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-foreground">Edit Retail Sale #{saleId}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Customer *</Label>
            <ContactCombobox value={contact} onChange={setContact} placeholder="Search and select customer..." />
          </div>
          <div><Label>Sale Date</Label><Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="bg-input border-border" /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-input border-border" rows={2} /></div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Items Purchased</Label>
              <Badge variant="outline" className="text-[10px]">Read-only</Badge>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-400">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>What was sold can't be changed after the sale is recorded. To change items, delete this sale and create a new one.</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-muted-foreground font-medium">Item</th>
                  <th className="text-center p-2 text-muted-foreground font-medium">Qty</th>
                  <th className="text-right p-2 text-muted-foreground font-medium">Unit Price</th>
                  <th className="text-right p-2 text-muted-foreground font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/30">
                    <td className="p-2 text-foreground">{item.itemName}{item.itemSku ? ` (${item.itemSku})` : ""}</td>
                    <td className="p-2 text-center text-foreground">{item.quantity}{item.unit ? ` ${item.unit}` : ""}</td>
                    <td className="p-2 text-right text-foreground">{formatPHP(item.unitPrice)}</td>
                    <td className="p-2 text-right text-foreground font-medium">{formatPHP(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ PAYMENT REMITTANCE DIALOG ============
function RemittanceDialog({ sale, open, onOpenChange }: { sale: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const saleId = sale?.id ?? 0;
  const { data: existing } = trpc.retailRemittances.get.useQuery({ retailSaleId: saleId }, { enabled: open && !!saleId });
  const { data: paymentMethods } = trpc.config.getOptions.useQuery({ category: "payment_method" });
  const { data: depositAccounts } = trpc.config.getOptions.useQuery({ category: "deposit_account" });

  const [paymentMethod, setPaymentMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [deposited, setDeposited] = useState(false);
  const [depositAccount, setDepositAccount] = useState("");
  const [depositDate, setDepositDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // Populate when opening / when the existing remittance loads.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setPaymentMethod(existing.paymentMethod ?? "");
      setAmount(String(existing.amount ?? ""));
      setDeposited(!!existing.deposited);
      setDepositAccount(existing.depositAccount ?? "");
      setDepositDate(existing.depositDate ? new Date(existing.depositDate).toISOString().slice(0, 10) : "");
      setReference(existing.reference ?? "");
      setNotes(existing.notes ?? "");
    } else {
      setPaymentMethod("");
      setAmount(sale?.totalAmount != null ? String(sale.totalAmount) : "");
      setDeposited(false);
      setDepositAccount("");
      setDepositDate("");
      setReference("");
      setNotes("");
    }
  }, [open, existing, sale]);

  const saveMutation = trpc.retailRemittances.save.useMutation({
    onSuccess: () => {
      toast.success("Remittance saved");
      utils.retailRemittances.get.invalidate({ retailSaleId: saleId });
      utils.retail.list.invalidate();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) { toast.error("Enter a valid amount"); return; }
    if (deposited && !depositAccount) { toast.error("Select where it was deposited"); return; }
    saveMutation.mutate({
      retailSaleId: saleId,
      paymentMethod: paymentMethod || undefined,
      amount: amt,
      deposited,
      depositAccount: depositAccount || undefined,
      depositDate: depositDate || undefined,
      reference: reference || undefined,
      notes: notes || undefined,
    });
  };

  const selCls = "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Payment Remittance — {sale?.customerName || `Sale #${saleId}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Payment Type</Label>
            <select className={selCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">-- How did the customer pay? --</option>
              {paymentMethods?.map((o: any) => <option key={o.id} value={o.value}>{o.value}</option>)}
            </select>
          </div>
          <div>
            <Label>Amount (₱)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-input border-border" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={deposited} onChange={(e) => setDeposited(e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="text-sm text-foreground">Amount has been deposited</span>
          </label>
          {deposited && (
            <>
              <div>
                <Label>Deposited To</Label>
                <select className={selCls} value={depositAccount} onChange={(e) => setDepositAccount(e.target.value)}>
                  <option value="">-- Select account --</option>
                  {depositAccounts?.map((o: any) => <option key={o.id} value={o.value}>{o.value}</option>)}
                </select>
                {(!depositAccounts || depositAccounts.length === 0) && (
                  <p className="text-xs text-muted-foreground mt-1">No deposit accounts yet — add them in Settings → Deposit Accounts.</p>
                )}
              </div>
              <div>
                <Label>Deposit Date</Label>
                <Input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className="bg-input border-border" />
              </div>
              <div>
                <Label>Reference / Slip No.</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Deposit slip number" className="bg-input border-border" />
              </div>
            </>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-input border-border" placeholder="Optional" />
          </div>
          {existing?.recordedByName && (
            <p className="text-xs text-muted-foreground">
              Last recorded by {existing.recordedByName}
              {existing.updatedAt ? ` · ${new Date(existing.updatedAt).toLocaleDateString()}` : ""}
            </p>
          )}
          <Button className="w-full bg-primary text-primary-foreground" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Remittance"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const remittanceBadge = (status: string) => {
  if (status === "deposited") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Deposited</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Not deposited</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">No remittance</Badge>;
};

// ============ MAIN RETAIL PAGE ============
export default function Retail() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [viewingSale, setViewingSale] = useState<any>(null);
  const [remittanceSale, setRemittanceSale] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.retail.list.useQuery({ search, page, limit: 20 });
  const sales = data?.items;

  // Clamp page if it exceeds totalPages after data changes
  if (data && data.totalPages > 0 && page > data.totalPages) {
    setPage(data.totalPages);
  }

  const { data: viewingSaleDetail } = trpc.retail.get.useQuery(
    { id: viewingSale?.id! },
    { enabled: !!viewingSale }
  );

  const deleteMutation = trpc.retail.delete.useMutation({
    onSuccess: () => {
      toast.success("Retail sale deleted");
      setViewingSale(null);
      utils.retail.list.invalidate();
      utils.inventory.listAll.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (sale: any) => {
    if (await confirm(`Delete retail sale #${sale.id} for ${sale.customerName ?? "this customer"}? This restores the stock that was sold.`)) {
      deleteMutation.mutate({ id: sale.id });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Retail</h1>
          <p className="text-muted-foreground mt-1">Record walk-in product sales and the items customers purchased.</p>
        </div>
        <Button className="bg-primary text-primary-foreground" onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Retail Sale
        </Button>
      </div>

      <CreateRetailSaleDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {/* Remittance summary — undeposited collections at a glance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Retail Sales</p>
            <p className="text-xl font-bold text-foreground">{formatPHP(data?.summary?.totalSales ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deposited</p>
            <p className="text-xl font-bold text-green-400">{formatPHP(data?.summary?.totalDeposited ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Not Yet Deposited</p>
            <p className="text-xl font-bold text-red-400">{formatPHP(data?.summary?.undeposited ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by customer name..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 bg-input border-border" />
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Customer</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Sale Date</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Items</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Total</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Remittance</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : !sales || sales.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No retail sales recorded yet.</td></tr>
                ) : (
                  sales.map((sale: any, idx: number) => (
                    <tr
                      key={sale.id}
                      onClick={() => setViewingSale(sale)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4 font-medium text-foreground">{sale.customerName || `Customer #${sale.contactId}`}</td>
                      <td className="p-4 text-sm text-muted-foreground">{new Date(sale.saleDate).toLocaleDateString()}</td>
                      <td className="p-4 text-sm text-center text-muted-foreground">{sale.itemCount}</td>
                      <td className="p-4 text-sm text-right font-medium text-foreground">{formatPHP(sale.totalAmount)}</td>
                      <td className="p-4">{remittanceBadge(sale.remittanceStatus)}</td>
                      <td className="p-4">
                        {/* Stop row-level view clicks from firing behind the action buttons */}
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" title="Payment Remittance" onClick={() => setRemittanceSale(sale)}><Wallet className="h-4 w-4 text-primary" /></Button>
                          <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditingSaleId(sale.id)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDelete(sale)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPageChange={setPage} />
          )}
        </CardContent>
      </Card>

      <DetailDialog
        open={!!viewingSale}
        onOpenChange={(open) => !open && setViewingSale(null)}
        title={viewingSale?.customerName || (viewingSale ? `Customer #${viewingSale.contactId}` : "")}
        subtitle={viewingSale ? `Sale #${viewingSale.id} • ${new Date(viewingSale.saleDate).toLocaleDateString()}` : undefined}
        sections={[
          {
            title: "Sale Summary",
            fields: [
              { label: "Subtotal", value: viewingSale ? formatPHP(viewingSale.subtotal) : undefined },
              { label: "Total Amount", value: viewingSale ? formatPHP(viewingSale.totalAmount) : undefined },
              { label: "Notes", value: viewingSale?.notes, full: true },
            ],
          },
          {
            title: "Record Info",
            fields: [
              { label: "Recorded By", value: viewingSale?.createdByName },
              { label: "Recorded At", value: viewingSale?.createdAt ? new Date(viewingSale.createdAt).toLocaleString() : null },
              { label: "Last Updated", value: viewingSale?.updatedAt ? new Date(viewingSale.updatedAt).toLocaleString() : null },
            ],
          },
        ]}
        onEdit={() => {
          const sale = viewingSale;
          setViewingSale(null);
          setEditingSaleId(sale.id);
        }}
        onDelete={() => handleDelete(viewingSale)}
        isDeleting={deleteMutation.isPending}
        footerLeft={
          viewingSale && (
            <Button
              variant="outline"
              className="border-border"
              onClick={() => window.open(`/api/retail-sales/${viewingSale.id}/pdf`, "_blank")}
            >
              <Printer className="h-4 w-4 mr-2" /> Print Receipt
            </Button>
          )
        }
      >
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-3">Items Purchased</h3>
          {viewingSaleDetail?.items && viewingSaleDetail.items.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-muted-foreground font-medium">Item</th>
                  <th className="text-center p-2 text-muted-foreground font-medium">Qty</th>
                  <th className="text-right p-2 text-muted-foreground font-medium">Unit Price</th>
                  <th className="text-right p-2 text-muted-foreground font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {viewingSaleDetail.items.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/30">
                    <td className="p-2 text-foreground">{item.itemName}{item.itemSku ? ` (${item.itemSku})` : ""}</td>
                    <td className="p-2 text-center text-foreground">{item.quantity}{item.unit ? ` ${item.unit}` : ""}</td>
                    <td className="p-2 text-right text-foreground">{formatPHP(item.unitPrice)}</td>
                    <td className="p-2 text-right text-foreground font-medium">{formatPHP(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="p-2 text-right font-semibold text-foreground">Total</td>
                  <td className="p-2 text-right font-semibold text-foreground">{formatPHP(viewingSale?.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground italic">No line items.</p>
          )}
        </div>
      </DetailDialog>

      {editingSaleId && (
        <EditRetailSaleDialog saleId={editingSaleId} open={!!editingSaleId} onOpenChange={(o) => { if (!o) setEditingSaleId(null); }} />
      )}

      <RemittanceDialog sale={remittanceSale} open={!!remittanceSale} onOpenChange={(o) => { if (!o) setRemittanceSale(null); }} />
    </div>
  );
}
