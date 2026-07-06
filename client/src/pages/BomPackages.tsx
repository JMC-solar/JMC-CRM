import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2, Package, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";

export default function BomPackages() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedPkg, setExpandedPkg] = useState<number | null>(null);
  const [addItemPkg, setAddItemPkg] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [itemQty, setItemQty] = useState("1");
  const utils = trpc.useUtils();

  const { data: packages, isLoading } = trpc.bom.list.useQuery();
  const { data: inventoryList } = trpc.inventory.listAll.useQuery();
  const { data: bomItems } = trpc.bom.getItems.useQuery(
    { packageId: expandedPkg! },
    { enabled: !!expandedPkg }
  );

  const createMutation = trpc.bom.create.useMutation({
    onSuccess: () => { toast.success("BOM package created"); setIsCreateOpen(false); utils.bom.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const addItemMutation = trpc.bom.addItem.useMutation({
    onSuccess: () => { toast.success("Component added"); setAddItemPkg(null); setSelectedItemId(""); setItemQty("1"); utils.bom.getItems.invalidate(); utils.bom.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const removeItemMutation = trpc.bom.removeItem.useMutation({
    onSuccess: () => { toast.success("Component removed"); utils.bom.getItems.invalidate(); utils.bom.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.bom.delete.useMutation({
    onSuccess: () => { toast.success("Package deleted"); utils.bom.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name") as string,
      description: (fd.get("description") as string) || undefined,
      systemSize: (fd.get("systemSize") as string) || undefined,
      systemType: (fd.get("systemType") as string) || undefined,
    });
  };

  const handleAddItem = () => {
    if (!addItemPkg || !selectedItemId) return;
    addItemMutation.mutate({
      packageId: addItemPkg,
      itemId: parseInt(selectedItemId),
      quantity: parseInt(itemQty) || 1,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">BOM Packages</h1>
            <p className="text-muted-foreground mt-1">Define Bill of Materials for solar system packages.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Create Package</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">Create BOM Package</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div><Label>Package Name *</Label><Input name="name" required placeholder="e.g. 5kW Hybrid System" className="bg-input border-border" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>System Size</Label><Input name="systemSize" placeholder="e.g. 5kW" className="bg-input border-border" /></div>
                  <div><Label>System Type</Label><Input name="systemType" placeholder="Hybrid, On-grid, Off-grid" className="bg-input border-border" /></div>
                </div>
                <div><Label>Description</Label><Textarea name="description" className="bg-input border-border" /></div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>Create Package</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Packages List */}
        <div className="space-y-4">
          {isLoading ? (
            <Card className="bg-card border-border"><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>
          ) : packages?.length === 0 ? (
            <Card className="bg-card border-border"><CardContent className="p-8 text-center text-muted-foreground">No BOM packages. Create one to define system components.</CardContent></Card>
          ) : (
            packages?.map((pkg: any) => (
              <Card key={pkg.id} className="bg-card border-border">
                <CardContent className="p-0">
                  {/* Package Header */}
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedPkg(expandedPkg === pkg.id ? null : pkg.id)}>
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium text-foreground">{pkg.name}</div>
                        <div className="text-sm text-muted-foreground">{pkg.systemSize || ""} {pkg.systemType || ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Total Cost</div>
                        <div className="font-semibold text-foreground">{pkg.totalCost ? `₱${Number(pkg.totalCost).toLocaleString()}` : "₱0"}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={async (e) => { e.stopPropagation(); if (await confirm("Delete this package?")) deleteMutation.mutate({ id: pkg.id }); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      {expandedPkg === pkg.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Expanded: Components */}
                  {expandedPkg === pkg.id && (
                    <div className="border-t border-border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Components</h4>
                        <Button size="sm" variant="outline" onClick={() => setAddItemPkg(addItemPkg === pkg.id ? null : pkg.id)}>
                          <Plus className="h-3 w-3 mr-1" /> Add Component
                        </Button>
                      </div>

                      {/* Add Component Form */}
                      {addItemPkg === pkg.id && (
                        <div className="flex gap-2 items-end bg-muted/30 p-3 rounded-lg">
                          <div className="flex-1">
                            <Label className="text-xs">Item</Label>
                            <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                              <SelectTrigger className="bg-input border-border">
                                <SelectValue placeholder="Select inventory item" />
                              </SelectTrigger>
                              <SelectContent>
                                {inventoryList?.map((item: any) => (
                                  <SelectItem key={item.id} value={String(item.id)}>{item.name} ({item.sku})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-20">
                            <Label className="text-xs">Qty</Label>
                            <Input type="number" min="1" value={itemQty} onChange={(e) => setItemQty(e.target.value)} className="bg-input border-border" />
                          </div>
                          <Button size="sm" onClick={handleAddItem} disabled={!selectedItemId || addItemMutation.isPending}>Add</Button>
                        </div>
                      )}

                      {/* Components Table */}
                      {bomItems && bomItems.length > 0 ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="text-left p-2 text-muted-foreground font-medium">Item</th>
                              <th className="text-left p-2 text-muted-foreground font-medium">SKU</th>
                              <th className="text-center p-2 text-muted-foreground font-medium">Qty</th>
                              <th className="text-right p-2 text-muted-foreground font-medium">Unit Price</th>
                              <th className="text-right p-2 text-muted-foreground font-medium">Line Total</th>
                              <th className="p-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {bomItems.map((item: any) => (
                              <tr key={item.id} className="border-b border-border/30">
                                <td className="p-2 text-foreground">{item.itemName}</td>
                                <td className="p-2 text-muted-foreground">{item.itemSku}</td>
                                <td className="p-2 text-center text-foreground">{item.quantity}</td>
                                <td className="p-2 text-right text-foreground">₱{Number(item.sellingPrice || 0).toLocaleString()}</td>
                                <td className="p-2 text-right text-foreground font-medium">₱{(item.quantity * Number(item.sellingPrice || 0)).toLocaleString()}</td>
                                <td className="p-2">
                                  <Button variant="ghost" size="sm" onClick={() => removeItemMutation.mutate({ id: item.id, packageId: pkg.id })}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No components added yet. Click "Add Component" to build this package.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
