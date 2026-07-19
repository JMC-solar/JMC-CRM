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
import QuickAddAccountDialog from "@/components/QuickAddAccountDialog";
import QuickAddContactDialog from "@/components/QuickAddContactDialog";
import DetailDialog from "@/components/DetailDialog";

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
  // Keyed on the config_options row id, never its label — admins can rename or
  // delete a purpose in Settings without silently breaking this form.
  const [purposeOptionId, setPurposeOptionId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [purposeRefName, setPurposeRefName] = useState("");
  // Stock-out may be attributed to either a business account OR a contact (exclusive), or neither.
  const [attributeType, setAttributeType] = useState<"" | "account" | "contact">("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>();
  const [selectedAccountName, setSelectedAccountName] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<number | undefined>();
  const [selectedContactName, setSelectedContactName] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [viewingTx, setViewingTx] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: transactions, isLoading } = trpc.stockTransactions.list.useQuery();
  const { data: items } = trpc.inventory.listAll.useQuery();
  const { data: withdrawalPurposeOptions } = trpc.config.getOptions.useQuery({ category: "withdrawal_purpose" });
  const { data: stockInPurposeOptions } = trpc.config.getOptions.useQuery({ category: "stock_in_purpose" });
  // Stock-in and stock-out each pull their purpose list from a different admin-managed category.
  const purposeOptions = txType === "stock_in" ? stockInPurposeOptions : withdrawalPurposeOptions;
  const { data: opportunities } = trpc.opportunities.list.useQuery({ search: "" });
  const { data: accountsList } = trpc.accounts.listAll.useQuery();
  const filteredAccounts = useMemo(() => {
    if (!accountsList || accountSearch.length < 1) return accountsList || [];
    return accountsList.filter((a: any) => a.name.toLowerCase().includes(accountSearch.toLowerCase()));
  }, [accountsList, accountSearch]);
  // Contacts can be numerous, so filter server-side rather than loading all.
  const { data: contactsPage } = trpc.contacts.list.useQuery(
    { search: contactSearch, page: 1, limit: 20 },
    { enabled: attributeType === "contact" }
  );
  const filteredContacts = contactsPage?.items || [];
  const contactLabel = (c: any) => `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`;

  const clearAccount = () => { setSelectedAccountId(undefined); setSelectedAccountName(""); setAccountSearch(""); };
  const clearContact = () => { setSelectedContactId(undefined); setSelectedContactName(""); setContactSearch(""); };

  const resetStockOutFields = () => {
    setPurposeOptionId("");
    setOpportunityId("");
    setPurposeRefName("");
    setAttributeType("");
    clearAccount();
    clearContact();
  };

  const createMutation = trpc.stockTransactions.create.useMutation({
    onSuccess: () => { toast.success("Transaction recorded"); setIsCreateOpen(false); setTxType("stock_in"); resetStockOutFields(); utils.stockTransactions.list.invalidate(); utils.inventory.list.invalidate(); },
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
    if (type === "stock_out" || type === "stock_in") {
      if (!purposeOptionId) { toast.error("Please select a purpose"); return; }
      const option = purposeOptions?.find((o: any) => String(o.id) === purposeOptionId);
      payload.purposeOptionId = parseInt(purposeOptionId);
      payload.purpose = option?.value;

      // An opportunity link wins over free-text details — both would write purposeRefName.
      const linkedOpp = opportunities?.find((o: any) => String(o.id) === opportunityId);
      if (linkedOpp) {
        payload.purposeRefId = linkedOpp.id;
        payload.purposeRefName = linkedOpp.title;
      } else if (purposeRefName) {
        payload.purposeRefName = purposeRefName;
      }

      if (attributeType === "account" && selectedAccountId) {
        payload.accountId = selectedAccountId;
        payload.accountName = selectedAccountName;
      } else if (attributeType === "contact" && selectedContactId) {
        payload.contactId = selectedContactId;
        payload.contactName = selectedContactName;
      }
    }
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stock Transactions</h1>
          <p className="text-muted-foreground mt-1">Track stock-in, stock-out, and adjustments.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setTxType("stock_in"); resetStockOutFields(); } }}>
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
                  <select name="type" required value={txType} onChange={(e) => { setTxType(e.target.value); resetStockOutFields(); }} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="stock_in">Stock In</option>
                    <option value="stock_out">Stock Out</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div><Label>Quantity *</Label><Input name="quantity" type="number" required min="1" className="bg-input border-border" /></div>
              </div>

              {(txType === "stock_out" || txType === "stock_in") && (
                <div className="space-y-4 p-3 rounded-md border border-border/50 bg-muted/20">
                  <div>
                    <Label>{txType === "stock_in" ? "Purpose of Stock-In *" : "Purpose of Withdrawal *"}</Label>
                    <select value={purposeOptionId} onChange={(e) => setPurposeOptionId(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                      <option value="">Select purpose...</option>
                      {purposeOptions?.map((opt: any) => (
                        <option key={opt.id} value={String(opt.id)}>{opt.value}</option>
                      ))}
                    </select>
                  </div>

                  {purposeOptionId && (
                    <>
                      <div>
                        <Label>Link to Project / Opportunity (optional)</Label>
                        <select value={opportunityId} onChange={(e) => { setOpportunityId(e.target.value); if (e.target.value) setPurposeRefName(""); }} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                          <option value="">-- None --</option>
                          {opportunities?.map((opp: any) => (
                            <option key={opp.id} value={String(opp.id)}>{opp.title}</option>
                          ))}
                        </select>
                      </div>

                      {!opportunityId && (
                        <div>
                          <Label>Additional Details</Label>
                          <Input value={purposeRefName} onChange={(e) => setPurposeRefName(e.target.value)} placeholder="Optional details..." className="bg-input border-border" />
                        </div>
                      )}
                    </>
                  )}

                  {/* Attribution — stock-out may be linked to a business account OR a contact (exclusive), or neither */}
                  <div>
                    <Label>Attribute To (optional)</Label>
                    <select
                      value={attributeType}
                      onChange={(e) => {
                        const v = e.target.value as "" | "account" | "contact";
                        setAttributeType(v);
                        clearAccount();
                        clearContact();
                      }}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">-- None --</option>
                      <option value="account">Business Account</option>
                      <option value="contact">Contact</option>
                    </select>
                  </div>

                  {attributeType === "account" && (
                    <div>
                      <Label>Business Account</Label>
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
                        {showAccountDropdown && (
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
                            <div
                              className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm text-blue-400 border-t border-border flex items-center gap-1"
                              onMouseDown={() => { setShowAccountDropdown(false); setAddAccountOpen(true); }}
                            >
                              <Plus className="h-3 w-3" /> Add new business account
                            </div>
                          </div>
                        )}
                      </div>
                      {selectedAccountId && <p className="text-xs text-blue-400 mt-1">Linked to: {selectedAccountName}</p>}
                    </div>
                  )}

                  {attributeType === "contact" && (
                    <div>
                      <Label>Contact</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={contactSearch}
                          onChange={(e) => {
                            setContactSearch(e.target.value);
                            if (!e.target.value) { setSelectedContactId(undefined); setSelectedContactName(""); }
                            setShowContactDropdown(true);
                          }}
                          onFocus={() => setShowContactDropdown(true)}
                          onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                          placeholder="Search contacts..."
                          className="bg-input border-border pl-9"
                        />
                        {showContactDropdown && (
                          <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                            {filteredContacts.map((c: any) => (
                              <div
                                key={c.id}
                                className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                                onMouseDown={() => {
                                  setSelectedContactId(c.id);
                                  setSelectedContactName(contactLabel(c));
                                  setContactSearch(contactLabel(c));
                                  setShowContactDropdown(false);
                                }}
                              >
                                <div className="font-medium text-foreground">{contactLabel(c)}</div>
                                {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
                              </div>
                            ))}
                            <div
                              className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm text-blue-400 border-t border-border flex items-center gap-1"
                              onMouseDown={() => { setShowContactDropdown(false); setAddContactOpen(true); }}
                            >
                              <Plus className="h-3 w-3" /> Add new contact
                            </div>
                          </div>
                        )}
                      </div>
                      {selectedContactId && <p className="text-xs text-blue-400 mt-1">Linked to: {selectedContactName}</p>}
                    </div>
                  )}
                </div>
              )}

              <div><Label>Reference</Label><Input name="reference" placeholder="PO number, receipt, etc." className="bg-input border-border" /></div>
              <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>Record Transaction</Button>
            </form>

            <QuickAddAccountDialog
              open={addAccountOpen}
              onOpenChange={setAddAccountOpen}
              defaultName={accountSearch}
              onCreated={(acc) => {
                setSelectedAccountId(acc.id);
                setSelectedAccountName(acc.name);
                setAccountSearch(acc.name);
                utils.accounts.listAll.invalidate();
              }}
            />
            <QuickAddContactDialog
              open={addContactOpen}
              onOpenChange={setAddContactOpen}
              defaultFirstName={contactSearch}
              onCreated={(c) => {
                setSelectedContactId(c.id);
                setSelectedContactName(c.name);
                setContactSearch(c.name);
                utils.contacts.list.invalidate();
              }}
            />
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
                    <tr key={tx.id} onClick={() => setViewingTx(tx)} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer">
                      <td className="p-4 text-sm text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</td>
                      <td className="p-4 font-medium text-foreground">{tx.itemName || `Item #${tx.itemId}`}</td>
                      <td className="p-4"><Badge variant="outline" className={typeColors[tx.type]}>{tx.type.replace("_", " ")}</Badge></td>
                      <td className="p-4 text-foreground font-medium">{tx.type === "stock_out" ? `-${tx.quantity}` : `+${tx.quantity}`}</td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {tx.purpose ? (
                          <span>{tx.purpose}{tx.purposeRefName ? ` – ${tx.purposeRefName}` : ""}</span>
                        ) : "-"}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{tx.accountName || tx.contactName || "-"}</td>
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

      <DetailDialog
        open={!!viewingTx}
        onOpenChange={(open) => !open && setViewingTx(null)}
        title={viewingTx?.itemName || (viewingTx ? `Item #${viewingTx.itemId}` : "")}
        subtitle={viewingTx?.reference ? `Ref: ${viewingTx.reference}` : undefined}
        headerRight={
          viewingTx ? (
            <Badge variant="outline" className={typeColors[viewingTx.type]}>
              {viewingTx.type.replace("_", " ")}
            </Badge>
          ) : undefined
        }
        sections={[
          {
            title: "Transaction Details",
            fields: [
              { label: "Item", value: viewingTx?.itemName || (viewingTx ? `Item #${viewingTx.itemId}` : undefined) },
              {
                label: "Quantity",
                value: viewingTx
                  ? (viewingTx.type === "stock_out" ? `-${viewingTx.quantity}` : `+${viewingTx.quantity}`)
                  : undefined,
              },
              { label: "Date", value: viewingTx ? new Date(viewingTx.createdAt).toLocaleDateString() : undefined },
              { label: "Reference", value: viewingTx?.reference },
              { label: "Recorded By", value: viewingTx?.createdByName },
            ],
          },
          {
            title: "Purpose & Attribution",
            fields: [
              { label: "Purpose", value: viewingTx?.purpose },
              { label: "Linked To", value: viewingTx?.purposeRefName },
              { label: "Business Account", value: viewingTx?.accountName, hidden: !viewingTx?.accountName },
              { label: "Contact", value: viewingTx?.contactName, hidden: !viewingTx?.contactName },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingTx?.notes, full: true }],
          },
        ]}
      />
    </div>
  );
}
