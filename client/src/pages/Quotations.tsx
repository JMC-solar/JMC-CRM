import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, FileText, ChevronDown, ChevronUp, Wrench, Package, Edit2, Search, Filter, Receipt, FileCheck } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import ExportButtons from "@/components/ExportButtons";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  pending_approval: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  approved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  sent: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  accepted: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  expired: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

// ============ CUSTOMER SEARCH COMPONENT ============
function CustomerSearch({ value, onChange, onSelect }: {
  value: string;
  onChange: (name: string) => void;
  onSelect: (contact: any) => void;
}) {
  const [search, setSearch] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const { data: contactsData } = trpc.contacts.list.useQuery(
    { search, page: 1, limit: 10 },
    { enabled: search.length >= 2 }
  );

  useEffect(() => { setSearch(value); }, [value]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Search contacts or type new name..."
          className="bg-input border-border pl-9"
        />
      </div>
      {showDropdown && contactsData?.items && contactsData.items.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {contactsData.items.map((c: any) => (
            <div
              key={c.id}
              className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
              onMouseDown={() => {
                onSelect(c);
                setSearch(`${c.firstName} ${c.lastName || ""}`.trim());
                setShowDropdown(false);
              }}
            >
              <div className="font-medium text-foreground">{c.firstName} {c.lastName || ""}</div>
              <div className="text-xs text-muted-foreground">{c.email || ""} {c.company ? `• ${c.company}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ BUSINESS ACCOUNT SEARCH COMPONENT ============
function AccountSearch({ value, onChange, onSelect, onClear, enabled = true }: {
  value: string;
  onChange: (name: string) => void;
  onSelect: (account: { id: number; name: string }) => void;
  onClear: () => void;
  enabled?: boolean;
}) {
  const [search, setSearch] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const { data: accountsList } = trpc.accounts.listAll.useQuery(undefined, { enabled });
  const filtered = useMemo(() => {
    if (!accountsList || search.length < 1) return accountsList || [];
    return accountsList.filter((a: any) => a.name.toLowerCase().includes(search.toLowerCase()));
  }, [accountsList, search]);
  useEffect(() => { setSearch(value); }, [value]);
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange(e.target.value);
            if (!e.target.value) onClear();
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Search business accounts..."
          className="bg-input border-border pl-9"
        />
      </div>
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((a: any) => (
            <div
              key={a.id}
              className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
              onMouseDown={() => {
                onSelect(a);
                setSearch(a.name);
                setShowDropdown(false);
              }}
            >
              <div className="font-medium text-foreground">{a.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ CREATE QUOTATION DIALOG ============
function CreateQuotationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState<number | undefined>();
  const [accountId, setAccountId] = useState<number | undefined>();
  const [accountName, setAccountName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [oppId, setOppId] = useState<string>("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [taxPercent, setTaxPercent] = useState("12");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountManualAmount, setDiscountManualAmount] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [installationFee, setInstallationFee] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: opportunities } = trpc.opportunities.listAll.useQuery(undefined, { enabled: open });
  const { data: vatRates } = trpc.config.getOptions.useQuery({ category: "vat_rate" }, { enabled: open });

  const createMutation = trpc.quotations.create.useMutation({
    onSuccess: () => {
      toast.success("Quotation created");
      onOpenChange(false);
      utils.quotations.list.invalidate();
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setTitle(""); setContactId(undefined); setAccountId(undefined); setAccountName("");
    setCustomerName(""); setCustomerEmail("");
    setCustomerPhone(""); setCustomerAddress(""); setOppId(""); setVatEnabled(false);
    setTaxPercent("12"); setDiscountPercent(""); setLaborCost(""); setInstallationFee("");
    setPaymentTerms(""); setWarrantyTerms(""); setNotes("");
  };

  const handleSelectContact = (contact: any) => {
    setContactId(contact.id);
    setCustomerName(`${contact.firstName} ${contact.lastName || ""}`.trim());
    setCustomerEmail(contact.email || "");
    setCustomerPhone(contact.phone || "");
    setCustomerAddress(contact.city || "");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title,
      contactId: contactId || undefined,
      accountId: accountId || undefined,
      customerName: customerName || undefined,
      customerEmail: customerEmail || undefined,
      customerPhone: customerPhone || undefined,
      customerAddress: customerAddress || undefined,
      opportunityId: oppId && oppId !== "none" ? parseInt(oppId) : undefined,
      vatEnabled,
      taxPercent: vatEnabled ? taxPercent : undefined,
      discountPercent: discountPercent || undefined,
      discountManualAmount: discountManualAmount || undefined,
      laborCost: laborCost || undefined,
      installationFee: installationFee || undefined,
      paymentTerms: paymentTerms || undefined,
      warrantyTerms: warrantyTerms || undefined,
      notes: notes || undefined,
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-foreground">Create Quotation</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. 5kW Solar System - Residential" className="bg-input border-border" /></div>

          <div>
            <Label>Customer (search from contacts or type new)</Label>
            <CustomerSearch
              value={customerName}
              onChange={(name) => { setCustomerName(name); setContactId(undefined); }}
              onSelect={handleSelectContact}
            />
            {contactId && <p className="text-xs text-green-400 mt-1">Linked to contact #{contactId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label>Email</Label><Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" className="bg-input border-border" /></div>
            <div><Label>Phone</Label><Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="bg-input border-border" /></div>
          </div>
          <div><Label>Address</Label><Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="bg-input border-border" /></div>

          <div>
            <Label>Business Account (optional)</Label>
            <AccountSearch
              value={accountName}
              onChange={(name) => { setAccountName(name); }}
              onSelect={(a) => { setAccountId(a.id); setAccountName(a.name); }}
              onClear={() => { setAccountId(undefined); setAccountName(""); }}
              enabled={open}
            />
            {accountId && <p className="text-xs text-blue-400 mt-1">Linked to account: {accountName}</p>}
          </div>

          <div>
            <Label>Link to Opportunity</Label>
            <Select value={oppId} onValueChange={setOppId}>
              <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Select opportunity (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {opportunities?.map((opp: any) => (
                  <SelectItem key={opp.id} value={String(opp.id)}>{opp.title} ({opp.status})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* VAT Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
            <div>
              <Label className="text-sm font-medium">Apply VAT</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable to add VAT/tax to this quotation</p>
            </div>
            <Switch checked={vatEnabled} onCheckedChange={setVatEnabled} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label>Discount %</Label><Input value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
            <div><Label>Manual Discount (₱)</Label><Input value={discountManualAmount} onChange={(e) => setDiscountManualAmount(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {vatEnabled && (
              <div>
                <Label>VAT Rate %</Label>
                <Select value={taxPercent} onValueChange={setTaxPercent}>
                  <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vatRates?.map((r: any) => (
                      <SelectItem key={r.id} value={r.value}>{r.value}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Labor Cost</Label><Input value={laborCost} onChange={(e) => setLaborCost(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
            <div><Label>Installation Fee</Label><Input value={installationFee} onChange={(e) => setInstallationFee(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
          </div>

          <div><Label>Payment Terms</Label><Textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 50% downpayment, 50% upon completion" className="bg-input border-border" rows={2} /></div>
          <div><Label>Warranty Terms</Label><Textarea value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} placeholder="e.g. 25-year panel warranty, 10-year inverter warranty" className="bg-input border-border" rows={2} /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-input border-border" rows={2} /></div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>Create Quotation</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ EDIT QUOTATION DIALOG ============
function EditQuotationDialog({ quotationId, open, onOpenChange }: { quotationId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: quotation } = trpc.quotations.get.useQuery({ id: quotationId }, { enabled: open });
  const { data: opportunities } = trpc.opportunities.listAll.useQuery(undefined, { enabled: open });
  const { data: vatRates } = trpc.config.getOptions.useQuery({ category: "vat_rate" }, { enabled: open });
  const { data: accountsList } = trpc.accounts.listAll.useQuery(undefined, { enabled: open });
  const utils = trpc.useUtils();

  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState<number | undefined>();
  const [accountId, setAccountId] = useState<number | undefined>();
  const [accountName, setAccountName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [oppId, setOppId] = useState<string>("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [taxPercent, setTaxPercent] = useState("12");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountManualAmount, setDiscountManualAmount] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [installationFee, setInstallationFee] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    if (quotation) {
      setTitle(quotation.title || "");
      setContactId(quotation.contactId || undefined);
      setAccountId(quotation.accountId || undefined);
      // Look up account name from the list
      const acct = accountsList?.find((a: any) => a.id === quotation.accountId);
      setAccountName(acct?.name || "");
      setCustomerName(quotation.customerName || "");
      setCustomerEmail(quotation.customerEmail || "");
      setCustomerPhone(quotation.customerPhone || "");
      setCustomerAddress(quotation.customerAddress || "");
      setOppId(quotation.opportunityId ? String(quotation.opportunityId) : "");
      setVatEnabled(!!quotation.vatEnabled);
      setTaxPercent(quotation.taxPercent || "12");
      setDiscountPercent(quotation.discountPercent || "");
      setDiscountManualAmount(quotation.discountManualAmount || "");
      setLaborCost(quotation.laborCost || "");
      setInstallationFee(quotation.installationFee || "");
      setPaymentTerms(quotation.paymentTerms || "");
      setWarrantyTerms(quotation.warrantyTerms || "");
      setNotes(quotation.notes || "");
      setStatus(quotation.status);
    }
  }, [quotation, accountsList]);

  const updateMutation = trpc.quotations.update.useMutation({
    onSuccess: () => {
      toast.success("Quotation updated");
      onOpenChange(false);
      utils.quotations.list.invalidate();
      utils.quotations.get.invalidate({ id: quotationId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSelectContact = (contact: any) => {
    setContactId(contact.id);
    setCustomerName(`${contact.firstName} ${contact.lastName || ""}`.trim());
    setCustomerEmail(contact.email || "");
    setCustomerPhone(contact.phone || "");
    setCustomerAddress(contact.city || "");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      id: quotationId,
      title,
      contactId: contactId || null,
      accountId: accountId || null,
      customerName: customerName || undefined,
      customerEmail: customerEmail || undefined,
      customerPhone: customerPhone || undefined,
      customerAddress: customerAddress || undefined,
      opportunityId: oppId && oppId !== "none" ? parseInt(oppId) : null,
      vatEnabled,
      taxPercent: vatEnabled ? taxPercent : undefined,
      discountPercent: discountPercent || undefined,
      discountManualAmount: discountManualAmount || undefined,
      laborCost: laborCost || undefined,
      installationFee: installationFee || undefined,
      paymentTerms: paymentTerms || undefined,
      warrantyTerms: warrantyTerms || undefined,
      notes: notes || undefined,
      status: status as any,
    });
  };

  if (!quotation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-foreground">Edit Quotation – {quotation.quoteNumber}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required className="bg-input border-border" /></div>

          <div>
            <Label>Customer (search from contacts or type new)</Label>
            <CustomerSearch
              value={customerName}
              onChange={(name) => { setCustomerName(name); setContactId(undefined); }}
              onSelect={handleSelectContact}
            />
            {contactId && <p className="text-xs text-green-400 mt-1">Linked to contact #{contactId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label>Email</Label><Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" className="bg-input border-border" /></div>
            <div><Label>Phone</Label><Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="bg-input border-border" /></div>
          </div>
          <div><Label>Address</Label><Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="bg-input border-border" /></div>

          <div>
            <Label>Business Account (optional)</Label>
            <AccountSearch
              value={accountName}
              onChange={(name) => { setAccountName(name); }}
              onSelect={(a) => { setAccountId(a.id); setAccountName(a.name); }}
              onClear={() => { setAccountId(undefined); setAccountName(""); }}
              enabled={open}
            />
            {accountId && <p className="text-xs text-blue-400 mt-1">Linked to account: {accountName}</p>}
          </div>

          <div>
            <Label>Link to Opportunity</Label>
            <Select value={oppId} onValueChange={setOppId}>
              <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Select opportunity (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {opportunities?.map((opp: any) => (
                  <SelectItem key={opp.id} value={String(opp.id)}>{opp.title} ({opp.status})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

                    {/* VAT Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
            <div>
              <Label className="text-sm font-medium">Apply VAT</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable to add VAT/tax to this quotation</p>
            </div>
            <Switch checked={vatEnabled} onCheckedChange={setVatEnabled} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Discount %</Label><Input value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
            <div><Label>Manual Discount (₱)</Label><Input value={discountManualAmount} onChange={(e) => setDiscountManualAmount(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {vatEnabled && (
              <div>
                <Label>VAT Rate %</Label>
                <Select value={taxPercent} onValueChange={setTaxPercent}>
                  <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vatRates?.map((r: any) => (
                      <SelectItem key={r.id} value={r.value}>{r.value}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Labor Cost</Label><Input value={laborCost} onChange={(e) => setLaborCost(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
            <div><Label>Installation Fee</Label><Input value={installationFee} onChange={(e) => setInstallationFee(e.target.value)} type="number" step="0.01" placeholder="0" className="bg-input border-border" /></div>
          </div>
          <div><Label>Payment Terms</Label><Textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="bg-input border-border" rows={2} /></div>
          <div><Label>Warranty Terms</Label><Textarea value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} className="bg-input border-border" rows={2} /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-input border-border" rows={2} /></div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>Save Changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ MAIN QUOTATIONS PAGE ============
export default function Quotations() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [expandedQuote, setExpandedQuote] = useState<number | null>(null);
  const [addingItem, setAddingItem] = useState<number | null>(null);
  const [addingLabor, setAddingLabor] = useState<number | null>(null);
  const [addingCustom, setAddingCustom] = useState<number | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<string>("");
  const [lineDesc, setLineDesc] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [linePrice, setLinePrice] = useState("");
  const [laborDesc, setLaborDesc] = useState("");
  const [laborAmount, setLaborAmount] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  // Filter state
  const [searchFilter, setSearchFilter] = useState("");
  const [addressFilter, setAddressFilter] = useState("");
  const [kwFilter, setKwFilter] = useState("");
  const [setupTypeFilter, setSetupTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();

  const { data: quotationsList, isLoading } = trpc.quotations.list.useQuery({
    search: searchFilter || undefined,
    address: addressFilter || undefined,
    kwRating: kwFilter || undefined,
    setupType: setupTypeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: 20,
  });
  const { data: inventoryList } = trpc.inventory.listAll.useQuery(undefined, { enabled: !!expandedQuote || !!addingItem });
  const { data: quoteItems } = trpc.quotations.getItems.useQuery(
    { quotationId: expandedQuote! },
    { enabled: !!expandedQuote }
  );
  const { data: deliveryReceipts } = trpc.quotations.getDeliveryReceipts.useQuery(
    { quotationId: expandedQuote! },
    { enabled: !!expandedQuote }
  );
  const { data: ackReceipts } = trpc.quotations.getAcknowledgements.useQuery(
    { quotationId: expandedQuote! },
    { enabled: !!expandedQuote }
  );
  const { data: laborDescOptions } = trpc.config.getOptions.useQuery({ category: "labor_description" }, { enabled: !!expandedQuote || !!addingLabor });

  const addItemMutation = trpc.quotations.addItem.useMutation({
    onSuccess: () => { toast.success("Line item added"); setAddingItem(null); setLineDesc(""); setLineQty("1"); setLinePrice(""); setSelectedInventoryItem(""); utils.quotations.getItems.invalidate(); utils.quotations.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const addLaborMutation = trpc.quotations.addItem.useMutation({
    onSuccess: () => { toast.success("Labor cost added"); setAddingLabor(null); setLaborDesc(""); setLaborAmount(""); utils.quotations.getItems.invalidate(); utils.quotations.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const addCustomMutation = trpc.quotations.addItem.useMutation({
    onSuccess: () => { toast.success("Custom item added"); setAddingCustom(null); setCustomDesc(""); setCustomAmount(""); utils.quotations.getItems.invalidate(); utils.quotations.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const removeItemMutation = trpc.quotations.removeItem.useMutation({
    onSuccess: () => { toast.success("Item removed"); utils.quotations.getItems.invalidate(); utils.quotations.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.quotations.delete.useMutation({
    onSuccess: () => { toast.success("Quotation deleted"); utils.quotations.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSelectInventoryItem = (itemId: string) => {
    setSelectedInventoryItem(itemId);
    const item = inventoryList?.find((i: any) => i.id === parseInt(itemId));
    if (item) {
      setLineDesc(item.name);
      setLinePrice(item.sellingPrice || "0");
    }
  };

  const handleAddLineItem = (quotationId: number) => {
    if (!lineDesc || !linePrice) return;
    addItemMutation.mutate({
      quotationId,
      itemId: selectedInventoryItem ? parseInt(selectedInventoryItem) : undefined,
      itemType: "inventory",
      description: lineDesc,
      quantity: parseInt(lineQty) || 1,
      unitPrice: linePrice,
    });
  };

  const handleAddLaborCost = (quotationId: number) => {
    if (!laborDesc || !laborAmount) return;
    addLaborMutation.mutate({
      quotationId,
      itemType: "labor",
      description: laborDesc,
      quantity: 1,
      unitPrice: laborAmount,
    });
  };

  const handleAddCustomItem = (quotationId: number) => {
    if (!customDesc || !customAmount) return;
    addCustomMutation.mutate({
      quotationId,
      itemType: "custom",
      description: customDesc,
      quantity: 1,
      unitPrice: customAmount,
    });
  };

  const createDRMutation = trpc.quotations.createDeliveryReceipt.useMutation({
    onError: (err: any) => toast.error(err.message),
  });
  const createAckMutation = trpc.quotations.createAcknowledgement.useMutation({
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreateDR = async (quotationId: number) => {
    const deliveryDate = prompt("Enter delivery date (YYYY-MM-DD):", new Date().toISOString().split("T")[0]);
    if (!deliveryDate) return;
    const notes = prompt("Notes (optional):") || undefined;
    // Open window synchronously (user gesture context) to avoid popup blocker
    const printWindow = window.open('about:blank', '_blank');
    try {
      const data = await createDRMutation.mutateAsync({ quotationId, deliveryDate, notes });
      toast.success(`Delivery Receipt created: ${data.receiptNumber}`);
      if (printWindow && data.id) {
        printWindow.location.href = `/api/delivery-receipts/${data.id}/print`;
      }
    } catch {
      if (printWindow) printWindow.close();
    }
  };

  const handleCreateAck = async (quotationId: number) => {
    if (!(await confirm("Create an Acknowledgement Receipt for this quotation?"))) return;
    const notes = prompt("Notes (optional):") || undefined;
    // Open window synchronously (user gesture context) to avoid popup blocker
    const printWindow = window.open('about:blank', '_blank');
    try {
      const data = await createAckMutation.mutateAsync({ quotationId, notes });
      toast.success(`Acknowledgement created: ${data.receiptNumber}`);
      if (printWindow && data.id) {
        printWindow.location.href = `/api/acknowledgement-receipts/${data.id}/print`;
      }
    } catch {
      if (printWindow) printWindow.close();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
            <p className="text-muted-foreground mt-1">Create and manage project quotations and proposals.</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButtons module="quotations" params={{ search: searchFilter || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }} />
            <Button className="bg-primary text-primary-foreground" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Quotation
            </Button>
          </div>
        </div>

        <CreateQuotationDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        {editingQuoteId && (
          <EditQuotationDialog quotationId={editingQuoteId} open={!!editingQuoteId} onOpenChange={(o) => { if (!o) setEditingQuoteId(null); }} />
        )}

        {/* Search & Filters */}
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={searchFilter} onChange={(e) => { setSearchFilter(e.target.value); setPage(1); }} placeholder="Search by customer, title, quote#, address, notes, date..." className="pl-10 bg-input border-border" />
              </div>
              <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="border-border">
                <Filter className="h-4 w-4 mr-2" /> Filters {showFilters ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
              </Button>
            </div>
            {showFilters && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-border/50">
                <div><Label className="text-xs">Address</Label><Input value={addressFilter} onChange={(e) => { setAddressFilter(e.target.value); setPage(1); }} placeholder="Filter by address" className="bg-input border-border" /></div>
                <div><Label className="text-xs">kW Rating</Label><Input value={kwFilter} onChange={(e) => { setKwFilter(e.target.value); setPage(1); }} placeholder="e.g. 5kW" className="bg-input border-border" /></div>
                <div><Label className="text-xs">Setup Type</Label><Input value={setupTypeFilter} onChange={(e) => { setSetupTypeFilter(e.target.value); setPage(1); }} placeholder="e.g. On-Grid" className="bg-input border-border" /></div>
                <div><Label className="text-xs">Date From</Label><Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="bg-input border-border" /></div>
                <div><Label className="text-xs">Date To</Label><Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="bg-input border-border" /></div>
                <div className="col-span-full flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setSearchFilter(""); setAddressFilter(""); setKwFilter(""); setSetupTypeFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }} className="text-muted-foreground">Clear Filters</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quotations List */}
        <div className="space-y-4">
          {isLoading ? (
            <Card className="bg-card border-border"><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>
          ) : !quotationsList?.items?.length ? (
            <Card className="bg-card border-border"><CardContent className="p-8 text-center text-muted-foreground">No quotations yet. Create your first quotation.</CardContent></Card>
          ) : (
            quotationsList?.items?.map((q: any) => (
              <Card key={q.id} className="bg-card border-border">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedQuote(expandedQuote === q.id ? null : q.id)}>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium text-foreground">{q.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {q.quoteNumber} {q.customerName ? `• ${q.customerName}` : ""}
                          {(q as any).accountId ? <Badge variant="outline" className="ml-2 bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">Business Acct</Badge> : null}
                          {q.vatEnabled ? <Badge variant="outline" className="ml-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">VAT</Badge> : null}
                          {(q as any).createdByName && <span className="ml-2 text-xs text-muted-foreground">by {(q as any).createdByName}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className={statusColors[q.status]}>{q.status.replace("_", " ")}</Badge>
                      <div className="text-right">
                        <div className="font-semibold text-foreground">{q.totalAmount ? `₱${Number(q.totalAmount).toLocaleString()}` : "-"}</div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingQuoteId(q.id); }} title="Edit">
                          <Edit2 className="h-4 w-4 text-blue-400" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); window.open(`/api/quotations/${q.id}/pdf`, '_blank'); }} title="Download PDF">
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleCreateDR(q.id); }} title="Delivery Receipt">
                          <Receipt className="h-4 w-4 text-amber-400" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleCreateAck(q.id); }} title="Acknowledgement">
                          <FileCheck className="h-4 w-4 text-green-400" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={async (e) => { e.stopPropagation(); if (await confirm("Delete?")) deleteMutation.mutate({ id: q.id }); }} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      {expandedQuote === q.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {expandedQuote === q.id && (
                    <div className="border-t border-border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Line Items</h4>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setAddingCustom(addingCustom === q.id ? null : q.id); setAddingItem(null); setAddingLabor(null); }}>
                            <Package className="h-3 w-3 mr-1" /> Add Custom
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setAddingLabor(addingLabor === q.id ? null : q.id); setAddingItem(null); setAddingCustom(null); }}>
                            <Wrench className="h-3 w-3 mr-1" /> Add Labor
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setAddingItem(addingItem === q.id ? null : q.id); setAddingLabor(null); setAddingCustom(null); }}>
                            <Plus className="h-3 w-3 mr-1" /> Add Item
                          </Button>
                        </div>
                      </div>

                      {/* Add Inventory Item Form */}
                      {addingItem === q.id && (
                        <div className="bg-muted/30 p-3 rounded-lg space-y-3">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add Inventory Item</div>
                          <div>
                            <Label className="text-xs">Select from Inventory (optional)</Label>
                            <Select value={selectedInventoryItem} onValueChange={handleSelectInventoryItem}>
                              <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Pick from inventory or enter manually below" /></SelectTrigger>
                              <SelectContent>
                                {inventoryList?.map((item: any) => (
                                  <SelectItem key={item.id} value={String(item.id)}>{item.name} ({item.sku}) - ₱{Number(item.sellingPrice || 0).toLocaleString()}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1"><Label className="text-xs">Description</Label><Input value={lineDesc} onChange={(e) => setLineDesc(e.target.value)} placeholder="Item description" className="bg-input border-border" /></div>
                            <div className="w-20"><Label className="text-xs">Qty</Label><Input type="number" min="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} className="bg-input border-border" /></div>
                            <div className="w-32"><Label className="text-xs">Unit Price</Label><Input type="number" step="0.01" value={linePrice} onChange={(e) => setLinePrice(e.target.value)} className="bg-input border-border" /></div>
                            <Button size="sm" onClick={() => handleAddLineItem(q.id)} disabled={!lineDesc || !linePrice || addItemMutation.isPending}>Add</Button>
                          </div>
                        </div>
                      )}

                      {/* Add Labor Cost Form */}
                      {addingLabor === q.id && (
                        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg space-y-3">
                          <div className="text-xs font-medium text-amber-400 uppercase tracking-wide">Add Labor Cost</div>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <Label className="text-xs">Description</Label>
                              <div className="flex gap-2">
                                <Select onValueChange={(v) => setLaborDesc(v)}>
                                  <SelectTrigger className="bg-input border-border w-48"><SelectValue placeholder="Select preset..." /></SelectTrigger>
                                  <SelectContent>
                                    {laborDescOptions?.map((opt: any) => (
                                      <SelectItem key={opt.id} value={opt.value}>{opt.value}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} placeholder="Or type custom..." className="bg-input border-border flex-1" />
                              </div>
                            </div>
                            <div className="w-40"><Label className="text-xs">Amount (₱)</Label><Input type="number" step="0.01" min="0" value={laborAmount} onChange={(e) => setLaborAmount(e.target.value)} placeholder="Enter amount" className="bg-input border-border" /></div>
                            <Button size="sm" onClick={() => handleAddLaborCost(q.id)} disabled={!laborDesc || !laborAmount || addLaborMutation.isPending}>Add</Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Labor costs are not tied to inventory.</p>
                        </div>
                      )}

                      {/* Add Custom Item Form */}
                      {addingCustom === q.id && (
                        <div className="bg-purple-500/10 border border-purple-500/20 p-3 rounded-lg space-y-3">
                          <div className="text-xs font-medium text-purple-400 uppercase tracking-wide">Add Custom / Miscellaneous Item</div>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1"><Label className="text-xs">Description</Label><Input value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="e.g. Permit Fees, Transportation, Documentation..." className="bg-input border-border" /></div>
                            <div className="w-40"><Label className="text-xs">Amount (₱)</Label><Input type="number" step="0.01" min="0" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="Enter amount" className="bg-input border-border" /></div>
                            <Button size="sm" onClick={() => handleAddCustomItem(q.id)} disabled={!customDesc || !customAmount || addCustomMutation.isPending}>Add</Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Miscellaneous charges not tied to inventory or labor (permits, transport, etc.).</p>
                        </div>
                      )}

                      {quoteItems && quoteItems.length > 0 ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="text-left p-2 text-muted-foreground font-medium">Type</th>
                              <th className="text-left p-2 text-muted-foreground font-medium">Description</th>
                              <th className="text-center p-2 text-muted-foreground font-medium">Qty</th>
                              <th className="text-right p-2 text-muted-foreground font-medium">Unit Price</th>
                              <th className="text-right p-2 text-muted-foreground font-medium">Total</th>
                              <th className="p-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {quoteItems.map((item: any) => (
                              <tr key={item.id} className="border-b border-border/30">
                                <td className="p-2">
                                  {item.itemType === "labor" ? (
                                    <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Labor</Badge>
                                  ) : item.itemType === "custom" ? (
                                    <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">Custom</Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">Item</Badge>
                                  )}
                                </td>
                                <td className="p-2 text-foreground">{item.description}</td>
                                <td className="p-2 text-center text-foreground">{item.itemType === "inventory" ? item.quantity : "-"}</td>
                                <td className="p-2 text-right text-foreground">₱{Number(item.unitPrice).toLocaleString()}</td>
                                <td className="p-2 text-right text-foreground font-medium">₱{Number(item.totalPrice).toLocaleString()}</td>
                                <td className="p-2">
                                  <Button variant="ghost" size="sm" onClick={() => removeItemMutation.mutate({ id: item.id, quotationId: q.id })}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No line items. Add products, labor costs, or custom items.</p>
                      )}

                      {/* Receipt History */}
                      {((deliveryReceipts && deliveryReceipts.length > 0) || (ackReceipts && ackReceipts.length > 0)) && (
                        <div className="mt-4 border-t border-border/50 pt-4">
                          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Receipt History</h4>
                          <div className="space-y-2">
                            {deliveryReceipts?.map((dr: any) => (
                              <div key={`dr-${dr.id}`} className="flex items-center justify-between bg-blue-500/5 border border-blue-500/20 rounded-md px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">DR</Badge>
                                  <span className="text-sm font-medium text-foreground">{dr.receiptNumber}</span>
                                  <span className="text-xs text-muted-foreground">{new Date(dr.createdAt).toLocaleDateString()}</span>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => window.open(`/api/delivery-receipts/${dr.id}/print`, '_blank')} className="text-blue-400 hover:text-blue-300">
                                  <FileText className="h-3 w-3 mr-1" /> Re-print
                                </Button>
                              </div>
                            ))}
                            {ackReceipts?.map((ack: any) => (
                              <div key={`ack-${ack.id}`} className="flex items-center justify-between bg-green-500/5 border border-green-500/20 rounded-md px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">ACK</Badge>
                                  <span className="text-sm font-medium text-foreground">{ack.receiptNumber}</span>
                                  <span className="text-xs text-muted-foreground">{new Date(ack.createdAt).toLocaleDateString()}</span>
                                  {ack.amount && <span className="text-xs text-muted-foreground">₱{Number(ack.amount).toLocaleString()}</span>}
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => window.open(`/api/acknowledgement-receipts/${ack.id}/print`, '_blank')} className="text-green-400 hover:text-green-300">
                                  <FileText className="h-3 w-3 mr-1" /> Re-print
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Totals Summary */}
                      {q.subtotal && (
                        <div className="flex justify-end">
                          <div className="w-64 space-y-1 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="text-foreground">₱{Number(q.subtotal).toLocaleString()}</span></div>
                            {Number(q.discountPercent) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount ({q.discountPercent}%)</span><span className="text-destructive">-₱{(Number(q.subtotal) * Number(q.discountPercent) / 100).toLocaleString()}</span></div>}
                            {Number(q.discountManualAmount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Manual Discount</span><span className="text-destructive">-₱{Number(q.discountManualAmount).toLocaleString()}</span></div>}
                            {Number(q.discountAmount) > 0 && !Number(q.discountPercent) && !Number(q.discountManualAmount) && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-₱{Number(q.discountAmount).toLocaleString()}</span></div>}
                            {q.vatEnabled && Number(q.taxAmount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">VAT ({q.taxPercent}%)</span><span className="text-foreground">₱{Number(q.taxAmount).toLocaleString()}</span></div>}
                            {Number(q.laborCost) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Labor</span><span className="text-foreground">₱{Number(q.laborCost).toLocaleString()}</span></div>}
                            {Number(q.installationFee) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Installation</span><span className="text-foreground">₱{Number(q.installationFee).toLocaleString()}</span></div>}
                            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span className="text-foreground">Total</span><span className="text-foreground">₱{Number(q.totalAmount).toLocaleString()}</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {quotationsList && quotationsList.total > 20 && (
          <PaginationControls
            page={page}
            totalPages={Math.ceil(quotationsList.total / 20)}
            total={quotationsList.total}
            limit={20}
            onPageChange={setPage}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
