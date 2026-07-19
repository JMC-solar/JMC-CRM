import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";

function OptionManager({ category, title, description }: { category: string; title: string; description: string }) {
  const [newValue, setNewValue] = useState("");
  const utils = trpc.useUtils();

  const { data: options, isLoading } = trpc.config.getOptions.useQuery({ category });
  const addMutation = trpc.config.addOption.useMutation({
    onSuccess: () => { toast.success("Option added"); setNewValue(""); utils.config.getOptions.invalidate({ category }); },
    onError: (err: any) => toast.error(err.message),
  });
  const removeMutation = trpc.config.removeOption.useMutation({
    onSuccess: () => { toast.success("Option removed"); utils.config.getOptions.invalidate({ category }); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Enter new option..."
            className="bg-input border-border"
            onKeyDown={(e) => { if (e.key === "Enter" && newValue.trim()) { e.preventDefault(); addMutation.mutate({ category, value: newValue.trim() }); } }}
          />
          <Button
            onClick={() => { if (newValue.trim()) addMutation.mutate({ category, value: newValue.trim() }); }}
            disabled={!newValue.trim() || addMutation.isPending}
            className="bg-primary text-primary-foreground shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : options?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No options configured yet.</p>
          ) : (
            options?.map((opt: any) => (
              <div key={opt.id} className="flex items-center justify-between p-3 rounded-md border border-border/50 bg-muted/20">
                <span className="text-foreground">{opt.value}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => { if (await confirm(`Remove "${opt.value}"?`)) removeMutation.mutate({ id: opt.id }); }}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage configurable dropdown options for the system.</p>
      </div>

      <Tabs defaultValue="units" className="w-full">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="units">Units of Measurement</TabsTrigger>
          <TabsTrigger value="locations">Storage Locations</TabsTrigger>
          <TabsTrigger value="purposes">Withdrawal Purposes</TabsTrigger>
          <TabsTrigger value="stock_in_purposes">Stock-In Purposes</TabsTrigger>
          <TabsTrigger value="project_types">Project Setup Types</TabsTrigger>
          <TabsTrigger value="labor_desc">Labor Descriptions</TabsTrigger>
          <TabsTrigger value="vat_rates">VAT Rates</TabsTrigger>
          <TabsTrigger value="payment_methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="cash_request_purposes">Cash Request Purposes</TabsTrigger>
        </TabsList>

        <TabsContent value="units" className="mt-4">
          <OptionManager
            category="unit_of_measurement"
            title="Units of Measurement"
            description="Define the available units for inventory items (e.g., piece, set, meter, roll, box, kW)."
          />
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <OptionManager
            category="storage_location"
            title="Storage Locations"
            description="Define warehouse/storage locations for inventory items (e.g., Main Warehouse, Warehouse A – Rack 1, Storefront)."
          />
        </TabsContent>

        <TabsContent value="purposes" className="mt-4">
          <OptionManager
            category="withdrawal_purpose"
            title="Withdrawal Purposes"
            description="Define the available reasons for stock-out/withdrawal transactions (e.g., Project, Customer Order, Retail Sale)."
          />
        </TabsContent>
        <TabsContent value="stock_in_purposes" className="mt-4">
          <OptionManager
            category="stock_in_purpose"
            title="Stock-In Purposes"
            description="Define the available reasons for stock-in transactions (e.g., New Purchase Stock, China Stock, Return from Project)."
          />
        </TabsContent>
        <TabsContent value="project_types" className="mt-4">
          <OptionManager
            category="project_setup_type"
            title="Project Setup Types"
            description="Define the available types of solar installation projects (e.g., Hybrid, On-grid, Off-grid, Solar Pump, Customized, Rehabilitation)."
          />
        </TabsContent>
        <TabsContent value="labor_desc" className="mt-4">
          <OptionManager
            category="labor_description"
            title="Labor Cost Descriptions"
            description="Define the default description labels for labor cost line items in quotations (e.g., Labor Cost, Installation Labor, Electrical Work)."
          />
        </TabsContent>
        <TabsContent value="vat_rates" className="mt-4">
          <OptionManager
            category="vat_rate"
            title="VAT / Tax Rates"
            description="Define the available VAT/tax rate percentages for quotations (e.g., 12, 5, 0). Enter the numeric value only."
          />
        </TabsContent>
        <TabsContent value="payment_methods" className="mt-4">
          <OptionManager
            category="payment_method"
            title="Payment Methods"
            description="Define the available payment methods for purchase order, project, and net metering payments (e.g., Cash, Check, Bank Transfer)."
          />
        </TabsContent>
        <TabsContent value="cash_request_purposes" className="mt-4">
          <OptionManager
            category="cash_request_purpose"
            title="Cash Request Purposes"
            description="Define the available reasons for cash requests (e.g., Truck Gasoline, Office Supplies, Site Materials)."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
