import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronsUpDown, Check, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface LineItem {
  itemId: number;
  itemName: string;
  itemSku: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  masterPrice: string; // item master's current purchase price
  supplierPrice: string | null; // supplier-specific price (if exists)
  priceEdited: boolean; // tracks if user manually changed the price
}

interface PriceUpdateItem {
  itemId: number;
  itemName: string;
  itemSku: string;
  newPrice: string;
  currentMasterPrice: string;
  updateMaster: boolean;
}

export default function PurchaseOrderCreate() {
  const [, navigate] = useLocation();
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: number; name: string; code?: string | null } | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [orderedAt, setOrderedAt] = useState("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState("12");
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [priceUpdateDialog, setPriceUpdateDialog] = useState(false);
  const [priceUpdateItems, setPriceUpdateItems] = useState<PriceUpdateItem[]>([]);
  const [createdPOData, setCreatedPOData] = useState<{ poId: number; poNumber: string } | null>(null);
  const utils = trpc.useUtils();

  const { data: suppliersList } = trpc.suppliers.listAll.useQuery();
  const { data: inventoryList } = trpc.inventory.listAll.useQuery();

  // Fetch supplier-specific prices when supplier is selected
  const { data: supplierPrices } = trpc.purchaseOrders.getSupplierPrices.useQuery(
    { supplierId: selectedSupplier?.id || 0 },
    { enabled: !!selectedSupplier }
  );

  // Build a map of itemId -> supplier price for quick lookup
  const supplierPriceMap = useMemo(() => {
    const map = new Map<number, string>();
    if (supplierPrices) {
      for (const sp of supplierPrices) {
        map.set(sp.inventoryItemId, sp.unitPrice);
      }
    }
    return map;
  }, [supplierPrices]);

  const createMutation = trpc.purchaseOrders.create.useMutation({
    onSuccess: (data) => {
      // Check if any line items have prices different from item master
      const itemsWithDifferentPrices: PriceUpdateItem[] = [];
      for (const li of lineItems) {
        const usedPrice = li.unitPrice;
        const masterPrice = li.masterPrice;
        if (usedPrice && masterPrice && parseFloat(usedPrice) !== parseFloat(masterPrice) && parseFloat(usedPrice) > 0) {
          itemsWithDifferentPrices.push({
            itemId: li.itemId,
            itemName: li.itemName,
            itemSku: li.itemSku,
            newPrice: usedPrice,
            currentMasterPrice: masterPrice,
            updateMaster: false,
          });
        }
      }

      setCreatedPOData(data);

      if (itemsWithDifferentPrices.length > 0) {
        setPriceUpdateItems(itemsWithDifferentPrices);
        setPriceUpdateDialog(true);
      } else {
        // Auto-update supplier-item prices silently
        updateSupplierPricesAfterCreate(data.poId);
        toast.success(`Purchase order ${data.poNumber} created successfully`);
        utils.purchaseOrders.list.invalidate();
        navigate("/purchase-orders");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateSupplierPriceMutation = trpc.purchaseOrders.updateSupplierItemPrice.useMutation();
  const updateItemPriceMutation = trpc.purchaseOrders.updateItemPurchasePrice.useMutation();

  const updateSupplierPricesAfterCreate = async (poId: number) => {
    if (!selectedSupplier) return;
    // Update supplier-item prices for all line items
    for (const li of lineItems) {
      if (parseFloat(li.unitPrice) > 0) {
        updateSupplierPriceMutation.mutate({
          supplierId: selectedSupplier.id,
          inventoryItemId: li.itemId,
          unitPrice: li.unitPrice,
          purchaseOrderId: poId,
        });
      }
    }
  };

  const handlePriceUpdateConfirm = async () => {
    if (!createdPOData || !selectedSupplier) return;

    // Update supplier-item prices for all line items
    updateSupplierPricesAfterCreate(createdPOData.poId);

    // Update item master prices for items the user opted in
    for (const item of priceUpdateItems) {
      if (item.updateMaster) {
        updateItemPriceMutation.mutate({
          itemId: item.itemId,
          purchasePrice: item.newPrice,
        });
      }
    }

    toast.success(`Purchase order ${createdPOData.poNumber} created successfully`);
    setPriceUpdateDialog(false);
    utils.purchaseOrders.list.invalidate();
    utils.inventory.listAll.invalidate();
    navigate("/purchase-orders");
  };

  const handlePriceUpdateSkip = () => {
    if (!createdPOData) return;
    // Still update supplier-item prices
    updateSupplierPricesAfterCreate(createdPOData.poId);
    toast.success(`Purchase order ${createdPOData.poNumber} created successfully`);
    setPriceUpdateDialog(false);
    utils.purchaseOrders.list.invalidate();
    navigate("/purchase-orders");
  };

  const addLineItem = (item: any) => {
    if (lineItems.find(li => li.itemId === item.id)) {
      toast.error("Item already added to this PO");
      return;
    }

    // Priority: supplier-specific price > item master purchase price > 0
    const supplierSpecificPrice = supplierPriceMap.get(item.id);
    const masterPrice = item.purchasePrice || "0";
    const defaultPrice = supplierSpecificPrice || masterPrice;

    setLineItems([...lineItems, {
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      description: item.name + (item.brand ? ` - ${item.brand}` : "") + (item.model ? ` ${item.model}` : ""),
      unit: item.unit || "pcs",
      quantity: 1,
      unitPrice: defaultPrice,
      masterPrice: masterPrice,
      supplierPrice: supplierSpecificPrice || null,
      priceEdited: false,
    }]);
    setItemSearchOpen(false);
  };

  // When supplier changes, update existing line items with supplier-specific prices
  // Only auto-fill price if user hasn't manually edited it
  useEffect(() => {
    if (lineItems.length > 0 && supplierPrices) {
      setLineItems(prev => prev.map(li => {
        const supplierSpecificPrice = supplierPriceMap.get(li.itemId);
        return {
          ...li,
          supplierPrice: supplierSpecificPrice || null,
          // Only auto-update price if user hasn't manually changed it
          unitPrice: li.priceEdited ? li.unitPrice : (supplierSpecificPrice || li.masterPrice || li.unitPrice),
        };
      }));
    }
  }, [supplierPrices]);

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    (updated[index] as any)[field] = value;
    // Mark price as manually edited if user changes unitPrice
    if (field === "unitPrice") {
      updated[index].priceEdited = true;
    }
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * parseFloat(item.unitPrice || "0")), 0);
  const discountAmount = discountType === "percentage" ? subtotal * (parseFloat(discountValue || "0") / 100) : discountType === "fixed" ? parseFloat(discountValue || "0") : 0;
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = vatEnabled ? afterDiscount * (parseFloat(vatRate || "12") / 100) : 0;
  const totalAmount = afterDiscount + vatAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) {
      toast.error("Please select a supplier");
      return;
    }
    if (lineItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }
    createMutation.mutate({
      supplier: selectedSupplier.name,
      supplierId: selectedSupplier.id,
      notes: notes || undefined,
      orderedAt: orderedAt || undefined,
      vatEnabled,
      vatRate: vatRate || "12",
      discountType,
      discountValue: discountValue || "0",
      items: lineItems.map(li => ({
        itemId: li.itemId,
        itemName: li.itemName,
        itemSku: li.itemSku,
        description: li.description,
        unit: li.unit,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/purchase-orders")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Create Purchase Order</h1>
            <p className="text-muted-foreground mt-1">Add items from inventory and link to a supplier. Prices auto-fill from supplier history.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Supplier Selection */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-foreground text-lg">Supplier</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Supplier *</Label>
                  <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={supplierOpen} className="w-full justify-between bg-input border-border text-foreground font-normal">
                        {selectedSupplier ? (
                          <span>{selectedSupplier.name}{selectedSupplier.code ? ` (${selectedSupplier.code})` : ""}</span>
                        ) : (
                          <span className="text-muted-foreground">Search and select supplier...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 bg-card border-border" align="start">
                      <Command className="bg-card">
                        <CommandInput placeholder="Type to search suppliers..." className="text-foreground" />
                        <CommandList>
                          <CommandEmpty className="text-muted-foreground p-4 text-sm">No suppliers found.</CommandEmpty>
                          <CommandGroup>
                            {suppliersList?.map((s: any) => (
                              <CommandItem
                                key={s.id}
                                value={`${s.name} ${s.code || ""}`}
                                onSelect={() => { setSelectedSupplier(s); setSupplierOpen(false); }}
                                className="text-foreground"
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedSupplier?.id === s.id ? "opacity-100" : "opacity-0")} />
                                <span>{s.name}</span>
                                {s.code && <span className="ml-2 text-xs text-muted-foreground font-mono">{s.code}</span>}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Order Date</Label>
                  <Input type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} className="bg-input border-border" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-foreground text-lg">Line Items</CardTitle>
              <Popover open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="border-border">
                    <Plus className="h-4 w-4 mr-2" /> Add Item
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 bg-card border-border" align="end">
                  <Command className="bg-card">
                    <CommandInput placeholder="Search by name, SKU, or category..." className="text-foreground" />
                    <CommandList>
                      <CommandEmpty className="text-muted-foreground p-4 text-sm">No items found.</CommandEmpty>
                      <CommandGroup>
                        {inventoryList?.map((item: any) => {
                          const supplierPrice = supplierPriceMap.get(item.id);
                          const displayPrice = supplierPrice || item.purchasePrice;
                          return (
                            <CommandItem
                              key={item.id}
                              value={`${item.name} ${item.sku} ${item.category} ${item.brand || ""}`}
                              onSelect={() => addLineItem(item)}
                              className="text-foreground"
                            >
                              <div className="flex flex-col w-full">
                                <span className="font-medium">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{item.sku} • {item.category} • {item.unit || "pcs"}</span>
                                  {displayPrice && (
                                    <span className="ml-auto">
                                      ₱{Number(displayPrice).toLocaleString()}
                                      {supplierPrice && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-blue-500/50 text-blue-400">Supplier</Badge>}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No items added yet. Click "Add Item" to search and add inventory items.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Item</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Description</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground w-20">Unit</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground w-24">Qty</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground w-36">Unit Price</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground w-32">Line Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, index) => (
                        <tr key={item.itemId} className="border-b border-border/50">
                          <td className="p-3">
                            <div className="font-medium text-foreground text-sm">{item.itemName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{item.itemSku}</div>
                          </td>
                          <td className="p-3">
                            <Input
                              value={item.description}
                              onChange={(e) => updateLineItem(index, "description", e.target.value)}
                              className="bg-input border-border text-sm h-8"
                            />
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">{item.unit}</td>
                          <td className="p-3">
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 1)}
                              className="bg-input border-border text-sm h-8 w-20"
                            />
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)}
                                className="bg-input border-border text-sm h-8 w-28"
                              />
                              {item.supplierPrice && (
                                <div className="text-[10px] text-blue-400">Supplier: ₱{Number(item.supplierPrice).toLocaleString()}</div>
                              )}
                              {!item.supplierPrice && item.masterPrice !== "0" && (
                                <div className="text-[10px] text-muted-foreground">Master: ₱{Number(item.masterPrice).toLocaleString()}</div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-sm font-medium text-foreground">
                            ₱{(item.quantity * parseFloat(item.unitPrice || "0")).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3">
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={5} className="p-3 text-right text-sm text-muted-foreground">Subtotal:</td>
                        <td className="p-3 font-medium text-foreground">₱{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                      {discountAmount > 0 && (
                        <tr>
                          <td colSpan={5} className="p-3 text-right text-sm text-muted-foreground">
                            Discount ({discountType === "percentage" ? `${discountValue}%` : "Fixed"}):
                          </td>
                          <td className="p-3 font-medium text-red-400">-₱{discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td></td>
                        </tr>
                      )}
                      {vatEnabled && (
                        <tr>
                          <td colSpan={5} className="p-3 text-right text-sm text-muted-foreground">VAT ({vatRate}%):</td>
                          <td className="p-3 font-medium text-foreground">₱{vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td></td>
                        </tr>
                      )}
                      <tr className="border-t border-border">
                        <td colSpan={5} className="p-3 text-right font-medium text-foreground">Grand Total:</td>
                        <td className="p-3 font-bold text-foreground text-lg">₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* VAT & Discount */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-foreground text-lg">VAT & Discount</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* VAT Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox id="vat-enabled" checked={vatEnabled} onCheckedChange={(checked) => setVatEnabled(!!checked)} />
                    <Label htmlFor="vat-enabled" className="cursor-pointer">Apply VAT</Label>
                  </div>
                  {vatEnabled && (
                    <div>
                      <Label className="text-sm">VAT Rate (%)</Label>
                      <Input type="number" step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="bg-input border-border w-32 mt-1" placeholder="12" />
                    </div>
                  )}
                </div>
                {/* Discount Section */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Discount Type</Label>
                    <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                      <option value="none">No Discount</option>
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (₱)</option>
                    </select>
                  </div>
                  {discountType !== "none" && (
                    <div>
                      <Label className="text-sm">{discountType === "percentage" ? "Discount %" : "Discount Amount (₱)"}</Label>
                      <Input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="bg-input border-border w-40 mt-1" placeholder={discountType === "percentage" ? "e.g. 5" : "e.g. 500"} />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-foreground text-lg">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes for this purchase order..." className="bg-input border-border" />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/purchase-orders")} className="border-border">Cancel</Button>
            <Button type="submit" className="bg-primary text-primary-foreground" disabled={createMutation.isPending || !selectedSupplier || lineItems.length === 0}>
              {createMutation.isPending ? "Creating..." : "Create Purchase Order"}
            </Button>
          </div>
        </form>
      </div>

      {/* Price Update Prompt Dialog */}
      <Dialog open={priceUpdateDialog} onOpenChange={setPriceUpdateDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Update Default Purchase Prices?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              The following items were ordered at prices different from their current default purchase price.
              Would you like to update the Item Master price to reflect the new cost?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {priceUpdateItems.map((item, idx) => (
              <div key={item.itemId} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <Checkbox
                  id={`update-price-${item.itemId}`}
                  checked={item.updateMaster}
                  onCheckedChange={(checked) => {
                    const updated = [...priceUpdateItems];
                    updated[idx].updateMaster = !!checked;
                    setPriceUpdateItems(updated);
                  }}
                />
                <label htmlFor={`update-price-${item.itemId}`} className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm text-foreground">{item.itemName}</div>
                  <div className="text-xs text-muted-foreground font-mono">{item.itemSku}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className="text-muted-foreground">Current: ₱{Number(item.currentMasterPrice).toLocaleString()}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-foreground font-medium">New: ₱{Number(item.newPrice).toLocaleString()}</span>
                  </div>
                </label>
              </div>
            ))}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handlePriceUpdateSkip} className="border-border">
              Skip (Keep Current Prices)
            </Button>
            <Button onClick={handlePriceUpdateConfirm} className="bg-primary text-primary-foreground">
              Update Selected Prices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
