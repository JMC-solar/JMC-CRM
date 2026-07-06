import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  stock_in: "bg-green-500/20 text-green-400 border-green-500/30",
  stock_out: "bg-red-500/20 text-red-400 border-red-500/30",
  adjustment: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  reserved: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  unreserved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default function StockTransactions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [txType, setTxType] = useState("stock_in");
  const [purpose, setPurpose] = useState("");
  const [purposeRefName, setPurposeRefName] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>();
  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const utils = trpc.useUtils();

  const { data: transactions, isLoading } = trpc.stockTransactions.list.useQuery();
  const { data: items } = trpc.inventory.listAll.useQuery();
  const { data: purposeOptions } = trpc.config.getOptions.useQuery({ category: "withdrawal_purpose" });
  const { data: opportunities } = trpc.opportunities.list.useQuery({ search: "" });
  const { data: contactsData } = trpc.contacts.list.useQuery({ search: "", limit: 500 });
  const contacts = contactsData?.items;
  const { data: accountsList } = trpc.accounts.listAll.useQuery();
  const filteredAccounts = useMemo(() => {
    if (!accountsList || accountSearch.length < 1) return accountsList || [];
    return accountsList.filter((a: any) => a.name.toLowerCase().includes(accountSearch.toLowerCase()));
  }, [accountsList, accountSearch]);

  const createMutation = trpc.stockTransactions.create.useMutation({
    onSuccess: () => { toast.success("Transaction recorded"); setIsCreateOpen(false); setTxType("stock_in"); setPurpose(""); setPurposeRefName(""); utils.stockTransactions.list.invalidate(); utils.inventory.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = fd.get("type") as string;
    const payload: any = {
      itemId: parseInt(fd.get("itemId") as string),
      type,
      quantity: parseInt(fd.get("quantity") as string),
      reference: (fd.get("reference") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    };
    if (type === "stock_out" && purpose) {
      payload.purpose = purpose;
      payload.purposeRefName = purposeRefName || undefined;
      // Link to the actual record ID
      if (purpose === "Project" && purposeRefName) {
        const matchedOpp = opportunities?.find((o: any) => o.title === purposeRefName);
        if (matchedOpp) payload.purposeRefId = matchedOpp.id;
      } else if (purpose === "Customer Order" && purposeRefName) {
        const matchedContact = contacts?.find((c: any) => `${c.firstName} ${c.lastName}` === purposeRefName);
        if (matchedContact) payload.purposeRefId = matchedContact.id;
      }
      // Link to business account if selected
      if (selectedAccountId) {
        payload.accountId = selectedAccountId;
        payload.accountName = selectedAccountName;
      }
    }
    createMutation.mutate(payload);
    setSelectedAccountId(undefined); setSelectedAccountName(""); setAccountSearch("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Stock Transactions</h1>
            <p className="text-muted-foreground mt-1">Track stock-in, stock-out, and adjustments.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setTxType("stock_in"); setPurpose(""); setPurposeRefName(""); } }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Record Transaction</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg bg-card border-border max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-foreground">Record Stock Transaction</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Item *</Label>
                  <select name="itemId" required className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="">Select item...</option>
                    {items?.map((item: any) => (
                      <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Type *</Label>
                    <select name="type" required value={txType} onChange={(e) => setTxType(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                      <option value="stock_in">Stock In</option>
                      <option value="stock_out">Stock Out</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  <div><Label>Quantity *</Label><Input name="quantity" type="number" required min="1" className="bg-input border-border" /></div>
                </div>

                {txType === "stock_out" && (
                  <div className="space-y-4 p-3 rounded-md border border-border/50 bg-muted/20">
                    <div>
                      <Label>Purpose of Withdrawal *</Label>
                      <select value={purpose} onChange={(e) => { setPurpose(e.target.value); setPurposeRefName(""); }} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                        <option value="">Select purpose...</option>
                        {purposeOptions?.map((opt: any) => (
                          <option key={opt.id} value={opt.value}>{opt.value}</option>
                        ))}
                      </select>
                    </div>

                    {(purpose === "Project" || purpose === "Customer Order") && (
                      <div>
                        <Label>{purpose === "Project" ? "Project / Opportunity" : "Customer Name"}</Label>
                        {purpose === "Project" ? (
                          <select value={purposeRefName} onChange={(e) => setPurposeRefName(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                            <option value="">Select project...</option>
                            {opportunities?.map((opp: any) => (
                              <option key={opp.id} value={opp.title}>{opp.title}</option>
                            ))}
                          </select>
                        ) : (
                          <select value={purposeRefName} onChange={(e) => setPurposeRefName(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                            <option value="">Select customer...</option>
                            {contacts?.map((c: any) => (
                              <option key={c.id} value={`${c.firstName} ${c.lastName}`}>{c.firstName} {c.lastName}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {purpose && purpose !== "Project" && purpose !== "Customer Order" && (
                      <div>
                        <Label>Additional Details</Label>
                        <Input value={purposeRefName} onChange={(e) => setPurposeRefName(e.target.value)} placeholder="Optional details..." className="bg-input border-border" />
                      </div>
                    )}

                    {/* Business Account Selection */}
                    <div>
                      <Label>Business Account (optional)</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={accountSearch}
                          onChange={(e) => {
                            setAccountSearch(e.target.value);
                            if (!e.target.value) { setSelectedAccountId(undefined); setSelectedAccountName(""); }
                            setShowAccountDropdown(true);
                          }}
                          onFocus={() => setShowAccountDropdown(true)}
                          onBlur={() => setTimeout(() => setShowAccountDropdown(false), 200)}
                          placeholder="Search business accounts..."
                          className="bg-input border-border pl-9"
                        />
                        {showAccountDropdown && filteredAccounts.length > 0 && (
                          <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                            {filteredAccounts.map((a: any) => (
                              <div
                                key={a.id}
                                className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                                onMouseDown={() => {
                                  setSelectedAccountId(a.id);
                                  setSelectedAccountName(a.name);
                                  setAccountSearch(a.name);
                                  setShowAccountDropdown(false);
                                }}
                              >
                                <div className="font-medium text-foreground">{a.name}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedAccountId && <p className="text-xs text-blue-400 mt-1">Linked to: {selectedAccountName}</p>}
                    </div>
                  </div>
                )}

                <div><Label>Reference</Label><Input name="reference" placeholder="PO number, receipt, etc." className="bg-input border-border" /></div>
                <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" /></div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>Record Transaction</Button>
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
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Qty</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Purpose</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Account</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Performed By</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : transactions?.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No transactions recorded.</td></tr>
                  ) : (
                    transactions?.map((tx: any) => (
                      <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-4 text-sm text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td className="p-4 font-medium text-foreground">{tx.itemName || `Item #${tx.itemId}`}</td>
                        <td className="p-4"><Badge variant="outline" className={typeColors[tx.type]}>{tx.type.replace("_", " ")}</Badge></td>
                        <td className="p-4 text-foreground font-medium">{tx.type === "stock_out" ? `-${tx.quantity}` : `+${tx.quantity}`}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {tx.purpose ? (
                            <span>{tx.purpose}{tx.purposeRefName ? ` – ${tx.purposeRefName}` : ""}</span>
                          ) : "-"}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{tx.accountName || "-"}</td>
                        <td className="p-4 text-sm text-muted-foreground">{tx.createdByName || "-"}</td>
                        <td className="p-4 text-sm text-muted-foreground">{tx.reference || "-"}</td>
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
