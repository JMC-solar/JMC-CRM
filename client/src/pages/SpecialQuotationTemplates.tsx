import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Plus, Edit, Trash2, FileText, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { confirm } from "@/lib/confirm";

interface TemplateItem {
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  total: string;
  notes: string;
  warranty: string;
}

const DEFAULT_ITEMS: TemplateItem[] = [
  {
    description: "12KW SOLAR ONGRID; SUPPLY & INSTALLATION\n(Hybrid - Battery ready Solar Power System)",
    qty: "1", unit: "LOT", unitPrice: "348000", total: "348000",
    notes: "", warranty: ""
  },
  {
    description: "SOLAR PANEL; AIKO 660W",
    qty: "21", unit: "PCS", unitPrice: "", total: "",
    notes: "NOTE:\nSubject to availability and installation time. A different panel from a top vendor maybe chosen without affecting system size and performance",
    warranty: "Warranty: 10 Years"
  },
  {
    description: "SOLAR INVERTER; 12 kw Hybrid",
    qty: "1", unit: "PC", unitPrice: "", total: "",
    notes: "NOTE:\nSubject to availability and installation time. A different inverter from a top vendor maybe chosen without affecting system size and performance",
    warranty: "Warranty: 5 Years"
  },
  {
    description: "MOUNTING KITS",
    qty: "1", unit: "LOT", unitPrice: "", total: "",
    notes: "All aluminum parts should be used to prevent corrosion.\n\nNote:\nWill be using special mounting kits for tiled roof\nLabor for Outsource Personnel",
    warranty: ""
  },
  {
    description: "DC WIRINGS AND PROTECTIVE DEVICES",
    qty: "1", unit: "LOT", unitPrice: "", total: "",
    notes: "", warranty: ""
  },
  {
    description: "INSTALLATION LABOR AND DELIVERY OF MATERIALS",
    qty: "1", unit: "LOT", unitPrice: "", total: "",
    notes: "", warranty: ""
  },
];

const DEFAULT_REMARKS = `1. AC-side materials are not included in this package and shall be treated as separate items, subject to actual site verification during installation. The Client may opt to supply all required AC-side materials or authorize the Contractor to procure them on the Client's behalf. Should the Contractor provide any AC-side materials, the corresponding costs shall be separately itemized and included in the final billing for the system installation.`;

const DEFAULT_WARRANTY = `a. 10 Years Warranty for Solar Panels
b. 5 Years Warranty for Solar Hybrid Inverter
c. 5 Years Warranty for Lithium Battery
d. 1 Year Warranty for all minor materials supplied by SECOND PARTY.
e. 1 Year Workmanship Warranty
f. Technical Support (On Call)
g. Damages resulting from unforeseen or fortuitous events, as well as damages caused by unauthorized access, tampering, or modification of the set-up, shall not be covered by the warranty.`;

const DEFAULT_PAYMENT_TERMS = `1. 50% as down payment upon commencement of the installation
2. 50% balance payable upon system acceptance or commissioning`;

const DEFAULT_PAYMENT_DETAILS = `BANK: PNB
BANK ACCOUNT NAME: JOSE ERIK SOLOMON M. CHU
BANK ACCOUNT NO.: 3137 7000 9347`;

const DEFAULT_DELIVERY = `Installation shall commence within two (2) to three (3) weeks upon receipt of the down payment to allow for material procurement and preparation. Available materials may be installed immediately, while remaining items shall be installed upon delivery.`;

export default function SpecialQuotationTemplates() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const { data: templates, isLoading } = trpc.specialQuotationTemplates.list.useQuery();

  const deleteMutation = trpc.specialQuotationTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.specialQuotationTemplates.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Special Quotation Templates</h1>
          <p className="text-muted-foreground">Manage reusable quotation templates for special projects.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Create Template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading templates...</p>
      ) : !templates?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No templates created yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first special quotation template to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t: any) => (
            <Card key={t.id} className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-foreground text-base">{t.name}</CardTitle>
                  <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-xs">{t.setupType || "General"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.description && <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t.kwRating && <span className="bg-muted/50 px-2 py-0.5 rounded">{t.kwRating} kW</span>}
                  {t.systemTitle && <span className="bg-muted/50 px-2 py-0.5 rounded truncate max-w-[150px]">{t.systemTitle}</span>}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(t.id)} className="text-blue-400 hover:text-blue-300 h-8 px-2">
                    <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/special-quotations/new?templateId=${t.id}`)} className="text-green-400 hover:text-green-300 h-8 px-2">
                    <Copy className="h-3.5 w-3.5 mr-1" /> Use
                  </Button>
                  <Button variant="ghost" size="sm" onClick={async () => { if (await confirm("Delete this template?")) deleteMutation.mutate({ id: t.id }); }} className="text-red-400 hover:text-red-300 h-8 px-2 ml-auto">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      {isCreateOpen && (
        <TemplateFormDialog
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          mode="create"
        />
      )}

      {/* Edit Template Dialog */}
      {editingId && (
        <TemplateFormDialog
          open={!!editingId}
          onClose={() => setEditingId(null)}
          mode="edit"
          templateId={editingId}
        />
      )}
    </div>
  );
}

function TemplateFormDialog({ open, onClose, mode, templateId }: { open: boolean; onClose: () => void; mode: "create" | "edit"; templateId?: number }) {
  const utils = trpc.useUtils();
  const { data: existingTemplate } = trpc.specialQuotationTemplates.get.useQuery(
    { id: templateId! },
    { enabled: mode === "edit" && !!templateId }
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemTitle, setSystemTitle] = useState("");
  const [kwRating, setKwRating] = useState("");
  const [setupType, setSetupType] = useState("");
  const [items, setItems] = useState<TemplateItem[]>(DEFAULT_ITEMS);
  const [subtotal, setSubtotal] = useState("348000");
  const [vatRate, setVatRate] = useState("12");
  const [discount, setDiscount] = useState("");
  const [remarks, setRemarks] = useState(DEFAULT_REMARKS);
  const [warrantyClaims, setWarrantyClaims] = useState(DEFAULT_WARRANTY);
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [paymentDetails, setPaymentDetails] = useState(DEFAULT_PAYMENT_DETAILS);
  const [deliveryTerms, setDeliveryTerms] = useState(DEFAULT_DELIVERY);
  const [preparedBy, setPreparedBy] = useState("DANIELLA MARIE C. BONSAY");
  const [contactInfo, setContactInfo] = useState("Jose Erik Solomon Chu, REE, 09175088220, jmcsolarph@gmail.com");
  const [loaded, setLoaded] = useState(false);

  // Load existing template data
  if (mode === "edit" && existingTemplate && !loaded) {
    setName(existingTemplate.name || "");
    setDescription(existingTemplate.description || "");
    setSystemTitle(existingTemplate.systemTitle || "");
    setKwRating(existingTemplate.kwRating || "");
    setSetupType(existingTemplate.setupType || "");
    setItems((existingTemplate.items as TemplateItem[]) || DEFAULT_ITEMS);
    setSubtotal(existingTemplate.subtotal || "");
    setVatRate(existingTemplate.vatRate || "12");
    setDiscount(existingTemplate.discount || "");
    setRemarks(existingTemplate.remarks || "");
    setWarrantyClaims(existingTemplate.warrantyClaims || "");
    setPaymentTerms(existingTemplate.paymentTerms || "");
    setPaymentDetails(existingTemplate.paymentDetails || "");
    setDeliveryTerms(existingTemplate.deliveryTerms || "");
    setPreparedBy(existingTemplate.preparedBy || "");
    setContactInfo(existingTemplate.contactInfo || "");
    setLoaded(true);
  }

  const createMutation = trpc.specialQuotationTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      utils.specialQuotationTemplates.list.invalidate();
      onClose();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.specialQuotationTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      utils.specialQuotationTemplates.list.invalidate();
      onClose();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const payload = {
      name, description, systemTitle, kwRating, setupType,
      items: items as any,
      subtotal: subtotal || undefined,
      vatRate: vatRate || undefined,
      discount: discount || undefined,
      remarks, warrantyClaims, paymentTerms, paymentDetails, deliveryTerms, preparedBy, contactInfo,
    };
    if (mode === "create") {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: templateId!, ...payload });
    }
  };

  const addItem = () => {
    setItems([...items, { description: "", qty: "1", unit: "LOT", unitPrice: "", total: "", notes: "", warranty: "" }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof TemplateItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{mode === "create" ? "Create Template" : "Edit Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Template Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 12KW On-Grid Package" className="bg-input border-border" /></div>
            <div><Label>Setup Type</Label><Input value={setupType} onChange={(e) => setSetupType(e.target.value)} placeholder="e.g. On-grid, Hybrid" className="bg-input border-border" /></div>
          </div>
          <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this template" className="bg-input border-border" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>System Title (Package Name)</Label><Input value={systemTitle} onChange={(e) => setSystemTitle(e.target.value)} placeholder="e.g. 12KW SOLAR ONGRID; SUPPLY & INSTALLATION" className="bg-input border-border" /></div>
            <div><Label>kW Rating</Label><Input value={kwRating} onChange={(e) => setKwRating(e.target.value)} placeholder="e.g. 12" className="bg-input border-border" /></div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
            </div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <Card key={idx} className="bg-muted/20 border-border/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground mt-2 w-6">{idx + 1}.</span>
                      <div className="flex-1 space-y-2">
                        <div><Label className="text-xs">Description</Label><Textarea value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} rows={2} className="bg-input border-border text-sm" /></div>
                        <div className="grid grid-cols-4 gap-2">
                          <div><Label className="text-xs">Qty</Label><Input value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} className="bg-input border-border text-sm" /></div>
                          <div><Label className="text-xs">Unit</Label><Input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="bg-input border-border text-sm" /></div>
                          <div><Label className="text-xs">Unit Price</Label><Input value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="bg-input border-border text-sm" /></div>
                          <div><Label className="text-xs">Total</Label><Input value={item.total} onChange={(e) => updateItem(idx, "total", e.target.value)} className="bg-input border-border text-sm" /></div>
                        </div>
                        <div><Label className="text-xs">Notes</Label><Textarea value={item.notes} onChange={(e) => updateItem(idx, "notes", e.target.value)} rows={2} className="bg-input border-border text-sm" placeholder="Additional notes, availability info..." /></div>
                        <div><Label className="text-xs">Warranty</Label><Input value={item.warranty} onChange={(e) => updateItem(idx, "warranty", e.target.value)} className="bg-input border-border text-sm" placeholder="e.g. Warranty: 10 Years" /></div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 h-7 w-7 p-0 mt-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Subtotal</Label><Input value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" className="bg-input border-border" /></div>
            <div><Label>VAT Rate (%)</Label><Input value={vatRate} onChange={(e) => setVatRate(e.target.value)} placeholder="12" className="bg-input border-border" /></div>
            <div><Label>Discount</Label><Input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="bg-input border-border" /></div>
          </div>

          {/* Footer Sections */}
          <div><Label>Remarks</Label><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} className="bg-input border-border text-sm" /></div>
          <div><Label>Warranty Claims</Label><Textarea value={warrantyClaims} onChange={(e) => setWarrantyClaims(e.target.value)} rows={5} className="bg-input border-border text-sm" /></div>
          <div><Label>Payment Terms</Label><Textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} rows={3} className="bg-input border-border text-sm" /></div>
          <div><Label>Payment Details (Bank Info)</Label><Textarea value={paymentDetails} onChange={(e) => setPaymentDetails(e.target.value)} rows={3} className="bg-input border-border text-sm" /></div>
          <div><Label>Delivery & Commencement Terms</Label><Textarea value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} rows={3} className="bg-input border-border text-sm" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Prepared By</Label><Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="bg-input border-border" /></div>
            <div><Label>Contact Info</Label><Input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} className="bg-input border-border" /></div>
          </div>

          <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="w-full bg-primary text-primary-foreground">
            {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : mode === "create" ? "Create Template" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
