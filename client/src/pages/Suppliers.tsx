import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Edit, Trash2, Building, Phone, Mail, DollarSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { confirm } from "@/lib/confirm";
import DetailDialog from "@/components/DetailDialog";

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [viewingPrices, setViewingPrices] = useState<any>(null);
  const [viewingSupplier, setViewingSupplier] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: suppliersList, isLoading } = trpc.suppliers.list.useQuery({ search });
  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => { toast.success("Supplier created"); setIsCreateOpen(false); utils.suppliers.list.invalidate(); utils.suppliers.listAll.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => { toast.success("Supplier updated"); setEditingSupplier(null); utils.suppliers.list.invalidate(); utils.suppliers.listAll.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => { toast.success("Supplier deleted"); setViewingSupplier(null); utils.suppliers.list.invalidate(); utils.suppliers.listAll.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (supplier: any) => {
    if (await confirm("Delete this supplier?")) deleteMutation.mutate({ id: supplier.id });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name") as string,
      code: (fd.get("code") as string) || undefined,
      contactPerson: (fd.get("contactPerson") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      city: (fd.get("city") as string) || undefined,
      paymentTerms: (fd.get("paymentTerms") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingSupplier.id,
      name: fd.get("name") as string,
      code: (fd.get("code") as string) || undefined,
      contactPerson: (fd.get("contactPerson") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      city: (fd.get("city") as string) || undefined,
      paymentTerms: (fd.get("paymentTerms") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const SupplierForm = ({ defaults, onSubmit, submitLabel, isPending }: { defaults?: any; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; submitLabel: string; isPending: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Supplier Name *</Label><Input name="name" defaultValue={defaults?.name || ""} required className="bg-input border-border" /></div>
        <div><Label>Supplier Code</Label><Input name="code" defaultValue={defaults?.code || ""} placeholder="e.g., SUP-001" className="bg-input border-border" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Contact Person</Label><Input name="contactPerson" defaultValue={defaults?.contactPerson || ""} className="bg-input border-border" /></div>
        <div><Label>Phone</Label><Input name="phone" defaultValue={defaults?.phone || ""} className="bg-input border-border" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Email</Label><Input name="email" type="email" defaultValue={defaults?.email || ""} className="bg-input border-border" /></div>
        <div><Label>City</Label><Input name="city" defaultValue={defaults?.city || ""} className="bg-input border-border" /></div>
      </div>
      <div><Label>Address</Label><Textarea name="address" defaultValue={defaults?.address || ""} className="bg-input border-border" rows={2} /></div>
      <div><Label>Payment Terms</Label><Input name="paymentTerms" defaultValue={defaults?.paymentTerms || ""} placeholder="e.g., Net 30, COD" className="bg-input border-border" /></div>
      <div><Label>Notes</Label><Textarea name="notes" defaultValue={defaults?.notes || ""} className="bg-input border-border" rows={2} /></div>
      <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={isPending}>{submitLabel}</Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-muted-foreground mt-1">Manage your supplier directory.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Add Supplier</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card border-border max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-foreground">Add Supplier</DialogTitle></DialogHeader>
            <SupplierForm onSubmit={handleCreate} submitLabel="Add Supplier" isPending={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, code, contact, phone, email, city..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-input border-border" />
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <Card className="bg-card border-border"><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>
        ) : suppliersList?.length === 0 ? (
          <Card className="bg-card border-border"><CardContent className="p-8 text-center text-muted-foreground">No suppliers found. Add your first supplier above.</CardContent></Card>
        ) : (
          suppliersList?.map((supplier: any) => (
            <Card
              key={supplier.id}
              onClick={() => setViewingSupplier(supplier)}
              className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{supplier.name}</h3>
                        {supplier.code && <p className="text-xs text-muted-foreground font-mono">{supplier.code}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground ml-13">
                      {supplier.contactPerson && <span>{supplier.contactPerson}</span>}
                      {supplier.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{supplier.phone}</span>}
                      {supplier.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{supplier.email}</span>}
                      {supplier.city && <span>{supplier.city}</span>}
                      {supplier.paymentTerms && <span className="text-primary/80">Terms: {supplier.paymentTerms}</span>}
                    </div>
                  </div>
                  {/* Stop row-level view clicks from firing behind the action buttons */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setViewingPrices(supplier)} title="View item prices"><DollarSign className="h-4 w-4 text-green-400" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingSupplier(supplier)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(supplier)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <DetailDialog
        open={!!viewingSupplier}
        onOpenChange={(open) => !open && setViewingSupplier(null)}
        title={viewingSupplier?.name}
        subtitle={viewingSupplier?.code || undefined}
        sections={[
          {
            title: "Supplier Details",
            fields: [
              { label: "Name", value: viewingSupplier?.name },
              { label: "Code", value: viewingSupplier?.code },
              { label: "Contact Person", value: viewingSupplier?.contactPerson },
              { label: "Phone", value: viewingSupplier?.phone },
              { label: "Email", value: viewingSupplier?.email },
              { label: "City", value: viewingSupplier?.city },
              { label: "Payment Terms", value: viewingSupplier?.paymentTerms },
              { label: "Address", value: viewingSupplier?.address, full: true },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingSupplier?.notes, full: true }],
          },
        ]}
        onEdit={() => {
          const supplier = viewingSupplier;
          setViewingSupplier(null);
          setEditingSupplier(supplier);
        }}
        onDelete={() => handleDelete(viewingSupplier)}
        isDeleting={deleteMutation.isPending}
      />

      <Dialog open={!!editingSupplier} onOpenChange={(open) => !open && setEditingSupplier(null)}>
        <DialogContent className="max-w-lg bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Edit Supplier</DialogTitle></DialogHeader>
          {editingSupplier && (
            <SupplierForm defaults={editingSupplier} onSubmit={handleUpdate} submitLabel="Update Supplier" isPending={updateMutation.isPending} />
          )}
        </DialogContent>
      </Dialog>

      {/* Supplier Item Prices Dialog */}
      <Dialog open={!!viewingPrices} onOpenChange={(open) => !open && setViewingPrices(null)}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              Supplier Item Prices — {viewingPrices?.name}
            </DialogTitle>
          </DialogHeader>
          {viewingPrices && <SupplierPricesList supplierId={viewingPrices.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupplierPricesList({ supplierId }: { supplierId: number }) {
  const { data: prices, isLoading } = trpc.suppliers.getItemPrices.useQuery({ supplierId });

  if (isLoading) return <p className="text-muted-foreground text-center py-4">Loading prices...</p>;
  if (!prices || prices.length === 0) return <p className="text-muted-foreground text-center py-4">No item prices recorded for this supplier yet. Prices are automatically tracked when you create purchase orders.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Item</th>
            <th className="text-left p-3 text-sm font-medium text-muted-foreground">SKU</th>
            <th className="text-right p-3 text-sm font-medium text-muted-foreground">Supplier Price</th>
            <th className="text-right p-3 text-sm font-medium text-muted-foreground">Master Price</th>
            <th className="text-right p-3 text-sm font-medium text-muted-foreground">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((p: any) => {
            const masterPrice = p.item?.purchasePrice ? parseFloat(p.item.purchasePrice) : 0;
            const supplierPrice = parseFloat(p.unitPrice);
            const diff = masterPrice > 0 ? ((supplierPrice - masterPrice) / masterPrice * 100).toFixed(1) : null;
            return (
              <tr key={p.id} className="border-b border-border/50">
                <td className="p-3 text-sm text-foreground font-medium">{p.item?.name || "Unknown"}</td>
                <td className="p-3 text-sm text-muted-foreground font-mono">{p.item?.sku || "-"}</td>
                <td className="p-3 text-sm text-right font-medium text-foreground">₱{supplierPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="p-3 text-sm text-right text-muted-foreground">
                  {masterPrice > 0 ? `₱${masterPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                  {diff && (
                    <Badge variant="outline" className={cn("ml-2 text-[10px] px-1", parseFloat(diff) > 0 ? "border-red-500/50 text-red-400" : "border-green-500/50 text-green-400")}>
                      {parseFloat(diff) > 0 ? "+" : ""}{diff}%
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-sm text-right text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
