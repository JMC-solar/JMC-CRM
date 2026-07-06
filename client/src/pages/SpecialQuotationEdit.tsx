import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, Trash2, Save, Printer } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useLocation, useParams, useSearch } from "wouter";
import { formatPHP } from "@/lib/utils";

interface QuotationItem {
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  total: string;
  notes: string;
  warranty: string;
}

export default function SpecialQuotationEdit() {
  const params = useParams<{ id?: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const isNew = !params.id || params.id === "new";
  const editId = isNew ? null : parseInt(params.id!);

  // Parse templateId from query string
  const templateId = useMemo(() => {
    const urlParams = new URLSearchParams(search);
    return urlParams.get("templateId") ? parseInt(urlParams.get("templateId")!) : null;
  }, [search]);

  const utils = trpc.useUtils();

  // Load existing quotation for editing
  const { data: existingQuotation } = trpc.specialQuotations.get.useQuery(
    { id: editId! },
    { enabled: !!editId }
  );

  // Load template for new quotation
  const { data: template } = trpc.specialQuotationTemplates.get.useQuery(
    { id: templateId! },
    { enabled: isNew && !!templateId }
  );

  // Load contacts for customer type-ahead
  const { data: contactsData } = trpc.contacts.list.useQuery({ page: 1, limit: 200 });
  const contacts = contactsData?.items || [];

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [systemTitle, setSystemTitle] = useState("");
  const [systemDescription, setSystemDescription] = useState("");
  const [kwRating, setKwRating] = useState("");
  const [setupType, setSetupType] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [subtotal, setSubtotal] = useState("");
  const [vatRate, setVatRate] = useState("12");
  const [vatAmount, setVatAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [total, setTotal] = useState("");
  const [remarks, setRemarks] = useState("");
  const [warrantyClaims, setWarrantyClaims] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loaded, setLoaded] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Load template data into form for new quotation
  useEffect(() => {
    if (isNew && template && !loaded) {
      setSystemTitle(template.systemTitle || "");
      setSystemDescription(template.systemDescription || "");
      setKwRating(template.kwRating || "");
      setSetupType(template.setupType || "");
      setItems((template.items as QuotationItem[]) || []);
      setSubtotal(template.subtotal || "");
      setVatRate(template.vatRate || "12");
      setDiscount(template.discount || "");
      setRemarks(template.remarks || "");
      setWarrantyClaims(template.warrantyClaims || "");
      setPaymentTerms(template.paymentTerms || "");
      setPaymentDetails(template.paymentDetails || "");
      setDeliveryTerms(template.deliveryTerms || "");
      setPreparedBy(template.preparedBy || "");
      setContactInfo(template.contactInfo || "");
      setLoaded(true);
    }
  }, [isNew, template, loaded]);

  // Load existing quotation data for editing
  useEffect(() => {
    if (!isNew && existingQuotation && !loaded) {
      setCustomerName(existingQuotation.customerName || "");
      setCustomerAddress(existingQuotation.customerAddress || "");
      setSystemTitle(existingQuotation.systemTitle || "");
      setSystemDescription(existingQuotation.systemDescription || "");
      setKwRating(existingQuotation.kwRating || "");
      setSetupType(existingQuotation.setupType || "");
      setItems((existingQuotation.items as QuotationItem[]) || []);
      setSubtotal(existingQuotation.subtotal || "");
      setVatRate(existingQuotation.vatRate || "12");
      setVatAmount(existingQuotation.vatAmount || "");
      setDiscount(existingQuotation.discount || "");
      setTotal(existingQuotation.total || "");
      setRemarks(existingQuotation.remarks || "");
      setWarrantyClaims(existingQuotation.warrantyClaims || "");
      setPaymentTerms(existingQuotation.paymentTerms || "");
      setPaymentDetails(existingQuotation.paymentDetails || "");
      setDeliveryTerms(existingQuotation.deliveryTerms || "");
      setPreparedBy(existingQuotation.preparedBy || "");
      setContactInfo(existingQuotation.contactInfo || "");
      setDate(existingQuotation.date ? new Date(existingQuotation.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
      setLoaded(true);
    }
  }, [isNew, existingQuotation, loaded]);

  // Auto-calculate totals
  useEffect(() => {
    const sub = parseFloat(subtotal) || 0;
    const vr = parseFloat(vatRate) || 0;
    const disc = parseFloat(discount) || 0;
    const vat = sub * (vr / 100);
    setVatAmount(vat.toFixed(2));
    setTotal((sub + vat - disc).toFixed(2));
  }, [subtotal, vatRate, discount]);

  const createMutation = trpc.specialQuotations.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Special Quotation ${data.quotationNumber} created`);
      navigate(`/special-quotations/${data.id}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.specialQuotations.update.useMutation({
    onSuccess: () => {
      toast.success("Quotation updated");
      utils.specialQuotations.get.invalidate({ id: editId! });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = () => {
    const payload = {
      templateId: templateId || undefined,
      customerName, customerAddress, systemTitle, systemDescription,
      kwRating, setupType,
      items: items as any,
      subtotal, vatRate, vatAmount, discount, total,
      remarks, warrantyClaims, paymentTerms, paymentDetails, deliveryTerms,
      preparedBy, contactInfo, date,
    };
    if (isNew) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: editId!, ...payload });
    }
  };

  const addItem = () => {
    setItems([...items, { description: "", qty: "1", unit: "LOT", unitPrice: "", total: "", notes: "", warranty: "" }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-calculate line total
    if (field === "qty" || field === "unitPrice") {
      const qty = parseFloat(field === "qty" ? value : updated[index].qty) || 0;
      const price = parseFloat(field === "unitPrice" ? value : updated[index].unitPrice) || 0;
      if (qty && price) updated[index].total = (qty * price).toFixed(2);
    }
    setItems(updated);
  };

  const filteredContacts = contacts.filter((c: any) =>
    `${c.firstName} ${c.lastName || ""}`.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const handlePrint = () => {
    if (editId) {
      window.open(`/api/special-quotations/${editId}/print`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/special-quotations")} className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isNew ? "Create Special Quotation" : `Edit ${existingQuotation?.quotationNumber || ""}`}
            </h1>
            {template && isNew && <p className="text-sm text-muted-foreground">Based on template: {template.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" onClick={handlePrint} className="border-border">
              <Printer className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          )}
          <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="bg-primary text-primary-foreground">
            <Save className="h-4 w-4 mr-1" /> {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Customer & Date */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-foreground text-lg">Customer & Date</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Label>Customer Name</Label>
              <Input
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setContactSearch(e.target.value); setShowContactDropdown(true); }}
                onFocus={() => setShowContactDropdown(true)}
                onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                placeholder="Type customer name..."
                className="bg-input border-border"
              />
              {showContactDropdown && contactSearch && filteredContacts.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {filteredContacts.slice(0, 8).map((c: any) => (
                    <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 text-foreground"
                      onMouseDown={() => { setCustomerName(`${c.firstName} ${c.lastName || ""}`); setCustomerAddress(c.address || ""); setShowContactDropdown(false); }}>
                      {c.firstName} {c.lastName || ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div><Label>Address</Label><Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Customer address" className="bg-input border-border" /></div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-input border-border" /></div>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-foreground text-lg">System Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2"><Label>System Title / Package Name</Label><Input value={systemTitle} onChange={(e) => setSystemTitle(e.target.value)} placeholder="e.g. 12KW SOLAR ONGRID; SUPPLY & INSTALLATION" className="bg-input border-border" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>kW Rating</Label><Input value={kwRating} onChange={(e) => setKwRating(e.target.value)} placeholder="12" className="bg-input border-border" /></div>
              <div><Label>Setup Type</Label><Input value={setupType} onChange={(e) => setSetupType(e.target.value)} placeholder="On-grid" className="bg-input border-border" /></div>
            </div>
          </div>
          <div><Label>System Description</Label><Textarea value={systemDescription} onChange={(e) => setSystemDescription(e.target.value)} rows={2} placeholder="e.g. Hybrid - Battery ready Solar Power System" className="bg-input border-border" /></div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground text-lg">Equipment & Services</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="border-border"><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, idx) => (
            <Card key={idx} className="bg-muted/10 border-border/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground mt-2 w-6 font-mono">{idx + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <div><Label className="text-xs">Description</Label><Textarea value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} rows={2} className="bg-input border-border text-sm" /></div>
                    <div className="grid grid-cols-4 gap-2">
                      <div><Label className="text-xs">Qty</Label><Input value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} className="bg-input border-border text-sm" /></div>
                      <div><Label className="text-xs">Unit</Label><Input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="bg-input border-border text-sm" /></div>
                      <div><Label className="text-xs">Unit Price (₱)</Label><Input value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="bg-input border-border text-sm" /></div>
                      <div><Label className="text-xs">Total (₱)</Label><Input value={item.total} onChange={(e) => updateItem(idx, "total", e.target.value)} className="bg-input border-border text-sm" /></div>
                    </div>
                    <div><Label className="text-xs">Notes / Specifications</Label><Textarea value={item.notes} onChange={(e) => updateItem(idx, "notes", e.target.value)} rows={2} className="bg-input border-border text-sm" placeholder="Additional notes..." /></div>
                    <div><Label className="text-xs">Warranty</Label><Input value={item.warranty} onChange={(e) => updateItem(idx, "warranty", e.target.value)} className="bg-input border-border text-sm" placeholder="e.g. Warranty: 10 Years" /></div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 h-7 w-7 p-0 mt-2">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-foreground text-lg">Pricing Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div><Label>Subtotal (₱)</Label><Input value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" className="bg-input border-border" /></div>
            <div><Label>VAT Rate (%)</Label><Input value={vatRate} onChange={(e) => setVatRate(e.target.value)} placeholder="12" className="bg-input border-border" /></div>
            <div><Label>VAT Amount (₱)</Label><Input value={vatAmount} readOnly className="bg-muted/30 border-border text-muted-foreground" /></div>
            <div><Label>Discount (₱)</Label><Input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="bg-input border-border" /></div>
            <div><Label>Total (₱)</Label><Input value={total} readOnly className="bg-muted/30 border-border font-bold text-green-400" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2"><CardTitle className="text-foreground text-lg">Terms & Conditions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Remarks</Label><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} className="bg-input border-border text-sm" /></div>
          <div><Label>Warranty Claims</Label><Textarea value={warrantyClaims} onChange={(e) => setWarrantyClaims(e.target.value)} rows={5} className="bg-input border-border text-sm" /></div>
          <div><Label>Payment Terms</Label><Textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} rows={3} className="bg-input border-border text-sm" /></div>
          <div><Label>Payment Details (Bank Info)</Label><Textarea value={paymentDetails} onChange={(e) => setPaymentDetails(e.target.value)} rows={3} className="bg-input border-border text-sm" /></div>
          <div><Label>Delivery & Commencement of Installation</Label><Textarea value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} rows={3} className="bg-input border-border text-sm" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Prepared By</Label><Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="bg-input border-border" /></div>
            <div><Label>Contact Info</Label><Input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} className="bg-input border-border" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Save Button */}
      <div className="flex justify-end gap-2">
        {!isNew && (
          <Button variant="outline" onClick={handlePrint} className="border-border">
            <Printer className="h-4 w-4 mr-1" /> Print / PDF
          </Button>
        )}
        <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="bg-primary text-primary-foreground">
          <Save className="h-4 w-4 mr-1" /> {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save Quotation"}
        </Button>
      </div>
    </div>
  );
}
