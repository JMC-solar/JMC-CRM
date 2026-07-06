import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Search, Edit, Trash2, AlertTriangle, Lock, History } from "lucide-react";
import ExportButtons from "@/components/ExportButtons";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import PaginationControls from "@/components/PaginationControls";
import { confirm } from "@/lib/confirm";

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.inventory.list.useQuery({ search, category: categoryFilter === "all" ? undefined : categoryFilter, page, limit: 20 });
  const items = data?.items;

  // Clamp page if it exceeds totalPages after data changes
  if (data && data.totalPages > 0 && page > data.totalPages) {
    setPage(data.totalPages);
  }
  const { data: unitOptions } = trpc.config.getOptions.useQuery({ category: "unit_of_measurement" });
  const { data: locationOptions } = trpc.config.getOptions.useQuery({ category: "storage_location" });

  const createMutation = trpc.inventory.create.useMutation({
    onSuccess: () => { toast.success("Item created"); setIsCreateOpen(false); utils.inventory.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.inventory.update.useMutation({
    onSuccess: () => { toast.success("Item updated"); setEditingItem(null); utils.inventory.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.inventory.delete.useMutation({
    onSuccess: () => { toast.success("Item deleted"); utils.inventory.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      sku: fd.get("sku") as string,
      name: fd.get("name") as string,
      category: fd.get("category") as string,
      brand: (fd.get("brand") as string) || undefined,
      model: (fd.get("model") as string) || undefined,
      description: (fd.get("description") as string) || undefined,
      purchasePrice: (fd.get("purchasePrice") as string) || undefined,
      sellingPrice: (fd.get("sellingPrice") as string) || undefined,
      stockOnHand: isAdmin ? (parseInt(fd.get("stockOnHand") as string) || 0) : 0,
      reorderLevel: parseInt(fd.get("reorderLevel") as string) || 5,
      unit: (fd.get("unit") as string) || undefined,
      warehouseLocation: (fd.get("warehouseLocation") as string) || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingItem.id,
      sku: fd.get("sku") as string,
      name: fd.get("name") as string,
      category: fd.get("category") as string,
      brand: (fd.get("brand") as string) || undefined,
      model: (fd.get("model") as string) || undefined,
      description: (fd.get("description") as string) || undefined,
      purchasePrice: (fd.get("purchasePrice") as string) || undefined,
      sellingPrice: (fd.get("sellingPrice") as string) || undefined,
      stockOnHand: isAdmin ? (parseInt(fd.get("stockOnHand") as string) || 0) : undefined,
      reorderLevel: parseInt(fd.get("reorderLevel") as string) || 5,
      unit: (fd.get("unit") as string) || undefined,
      warehouseLocation: (fd.get("warehouseLocation") as string) || undefined,
      priceChangeNotes: (fd.get("priceChangeNotes") as string) || undefined,
    });
  };

  const ItemForm = ({ defaults, onSubmit, submitLabel, isPending }: { defaults?: any; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; submitLabel: string; isPending: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>SKU *</Label><Input name="sku" defaultValue={defaults?.sku || ""} required className="bg-input border-border" /></div>
        <div><Label>Name *</Label><Input name="name" defaultValue={defaults?.name || ""} required className="bg-input border-border" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Category *</Label>
          <select name="category" defaultValue={defaults?.category || "panels"} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
            <option value="panels">Panels</option>
            <option value="inverters">Inverters</option>
            <option value="batteries">Batteries</option>
            <option value="accessories">Accessories</option>
            <option value="mounting">Mounting</option>
            <option value="cabling">Cabling</option>
            <option value="breakers">Breakers</option>
          </select>
        </div>
        <div><Label>Brand</Label><Input name="brand" defaultValue={defaults?.brand || ""} className="bg-input border-border" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Model</Label><Input name="model" defaultValue={defaults?.model || ""} className="bg-input border-border" /></div>
        <div>
          <Label>Unit of Measurement</Label>
          <select name="unit" defaultValue={defaults?.unit || "piece"} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
            {unitOptions?.map((opt: any) => (
              <option key={opt.id} value={opt.value}>{opt.value}</option>
            ))}
            {(!unitOptions || unitOptions.length === 0) && (
              <>
                <option value="piece">piece</option>
                <option value="set">set</option>
                <option value="meter">meter</option>
                <option value="roll">roll</option>
                <option value="box">box</option>
                <option value="kW">kW</option>
              </>
            )}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Storage Location</Label>
          <select name="warehouseLocation" defaultValue={defaults?.warehouseLocation || ""} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
            <option value="">-- Select Location --</option>
            {locationOptions?.map((opt: any) => (
              <option key={opt.id} value={opt.value}>{opt.value}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="flex items-center gap-1">
            Stock On Hand
            {!isAdmin && <Lock className="h-3 w-3 text-muted-foreground" />}
          </Label>
          {isAdmin ? (
            <Input name="stockOnHand" type="number" defaultValue={defaults?.stockOnHand ?? 0} className="bg-input border-border" />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Input name="stockOnHand" type="number" value={defaults?.stockOnHand ?? 0} readOnly disabled className="bg-muted border-border cursor-not-allowed opacity-70" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Stock can only be modified via Stock Transactions or Admin Adjustments</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Purchase Price (₱)</Label><Input name="purchasePrice" type="number" step="0.01" defaultValue={defaults?.purchasePrice || ""} className="bg-input border-border" /></div>
        <div><Label>Selling Price (₱)</Label><Input name="sellingPrice" type="number" step="0.01" defaultValue={defaults?.sellingPrice || ""} className="bg-input border-border" /></div>
      </div>
      <div><Label>Reorder Level</Label><Input name="reorderLevel" type="number" defaultValue={defaults?.reorderLevel ?? 5} className="bg-input border-border" /></div>
      <div><Label>Description</Label><Textarea name="description" defaultValue={defaults?.description || ""} className="bg-input border-border" /></div>
      {!isAdmin && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" /> Stock On Hand is read-only. Use Stock Transactions to record stock in/out.
        </p>
      )}
      <div><Label>Notes for Price Change (optional)</Label><Input name="priceChangeNotes" placeholder="Reason for price adjustment..." className="bg-input border-border" /></div>
      <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={isPending}>{submitLabel}</Button>
    </form>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
            <p className="text-muted-foreground mt-1">Manage solar products and components.</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButtons module="inventory" params={{ search: search || undefined, category: categoryFilter === "all" ? undefined : categoryFilter }} />
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg bg-card border-border max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="text-foreground">Add Inventory Item</DialogTitle></DialogHeader>
                <ItemForm onSubmit={handleCreate} submitLabel="Add Item" isPending={createMutation.isPending} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, SKU, brand, model, description, location..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 bg-input border-border" />
          </div>
          <Select value={categoryFilter} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-40 bg-input border-border"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="panels">Panels</SelectItem>
              <SelectItem value="inverters">Inverters</SelectItem>
              <SelectItem value="batteries">Batteries</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="mounting">Mounting</SelectItem>
              <SelectItem value="cabling">Cabling</SelectItem>
              <SelectItem value="breakers">Breakers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">SKU</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Category</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Unit</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Location</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Stock</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Price</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : !items || items.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No items found.</td></tr>
                  ) : (
                    items.map((item: any) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-4 text-sm font-mono text-muted-foreground">{item.sku}</td>
                        <td className="p-4">
                          <div className="font-medium text-foreground">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.brand} {item.model}</div>
                        </td>
                        <td className="p-4"><Badge variant="outline" className="capitalize">{item.category}</Badge></td>
                        <td className="p-4 text-sm text-muted-foreground">{item.unit || "pcs"}</td>
                        <td className="p-4 text-sm text-muted-foreground">{item.warehouseLocation || "-"}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground font-medium">{item.stockOnHand}</span>
                            {item.stockOnHand <= (item.reorderLevel || 5) && (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-sm text-foreground">{item.sellingPrice ? `₱${Number(item.sellingPrice).toLocaleString()}` : "-"}</td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditingItem(item)}><Edit className="h-4 w-4" /></Button>
                            {isAdmin && (
                              <Button variant="ghost" size="sm" onClick={async () => { if (await confirm("Delete?")) deleteMutation.mutate({ id: item.id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data && (
              <PaginationControls
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                limit={data.limit}
                onPageChange={setPage}
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-foreground">Edit Item</DialogTitle></DialogHeader>
            {editingItem && (
              <>
                <ItemForm defaults={editingItem} onSubmit={handleUpdate} submitLabel="Update Item" isPending={updateMutation.isPending} />
                <PriceHistorySection itemId={editingItem.id} />
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function PriceHistorySection({ itemId }: { itemId: number }) {
  const stableInput = useMemo(() => ({ itemId }), [itemId]);
  const { data: history, isLoading } = trpc.inventory.priceHistory.useQuery(stableInput);

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Price Adjustment History</h3>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading history...</p>
      ) : !history || history.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No price changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-xs font-medium text-muted-foreground">Date & Time</th>
                <th className="text-left p-2 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-right p-2 text-xs font-medium text-muted-foreground">Old Price</th>
                <th className="text-right p-2 text-xs font-medium text-muted-foreground">New Price</th>
                <th className="text-left p-2 text-xs font-medium text-muted-foreground">Changed By</th>
                <th className="text-left p-2 text-xs font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry: any) => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-2">
                    <Badge variant="outline" className={entry.priceType === 'purchase' ? 'border-blue-500/50 text-blue-400' : 'border-green-500/50 text-green-400'}>
                      {entry.priceType === 'purchase' ? 'Purchase' : 'Selling'}
                    </Badge>
                  </td>
                  <td className="p-2 text-right text-xs text-muted-foreground">₱{Number(entry.oldPrice || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right text-xs font-medium text-foreground">₱{Number(entry.newPrice || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 text-xs text-muted-foreground">{entry.changedByName || '-'}</td>
                  <td className="p-2 text-xs text-muted-foreground italic max-w-[120px] truncate" title={entry.notes || ''}>{entry.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
