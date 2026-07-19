import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import DetailDialog from "@/components/DetailDialog";
import { useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { formatPHP } from "@/lib/utils";

const statusColors: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  contacted: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  qualified: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  proposal: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  won: "bg-green-500/20 text-green-400 border-green-500/30",
  lost: "bg-red-500/20 text-red-400 border-red-500/30",
};
const statusLabels: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" };

export default function Opportunities() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<any>(null);
  const [viewingOpp, setViewingOpp] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: opportunities, isLoading } = trpc.opportunities.list.useQuery({ search, status: statusFilter === "all" ? undefined : statusFilter });
  const createMutation = trpc.opportunities.create.useMutation({
    onSuccess: () => { toast.success("Opportunity created"); setIsCreateOpen(false); utils.opportunities.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.opportunities.update.useMutation({
    onSuccess: () => { toast.success("Opportunity updated"); setEditingOpp(null); utils.opportunities.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.opportunities.delete.useMutation({
    onSuccess: () => { toast.success("Opportunity deleted"); setViewingOpp(null); utils.opportunities.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (opp: any) => {
    if (await confirm("Delete this opportunity?")) deleteMutation.mutate({ id: opp.id });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      title: fd.get("title") as string,
      status: (fd.get("status") as string) || "new",
      value: (fd.get("value") as string) || undefined,
      systemSize: (fd.get("systemSize") as string) || undefined,
      systemType: (fd.get("systemType") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingOpp.id,
      title: fd.get("title") as string,
      status: (fd.get("status") as string) || "new",
      value: (fd.get("value") as string) || undefined,
      systemSize: (fd.get("systemSize") as string) || undefined,
      systemType: (fd.get("systemType") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Opportunities</h1>
          <p className="text-muted-foreground mt-1">Track deals and solar project opportunities.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Add Opportunity</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Create Opportunity</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Title *</Label><Input name="title" required className="bg-input border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Value (₱)</Label><Input name="value" type="number" className="bg-input border-border" /></div>
                <div><Label>System Size</Label><Input name="systemSize" placeholder="e.g. 10kW" className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>System Type</Label><Input name="systemType" placeholder="On-grid, Off-grid, Hybrid" className="bg-input border-border" /></div>
                <div>
                  <Label>Status</Label>
                  <select name="status" defaultValue="new" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>
              <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>Create Opportunity</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by title, system size, type, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-input border-border" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-input border-border"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="proposal">Proposal</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Title</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Value</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">System</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : opportunities?.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No opportunities found.</td></tr>
                ) : (
                  opportunities?.map((opp: any) => (
                    <tr
                      key={opp.id}
                      onClick={() => setViewingOpp(opp)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4 font-medium text-foreground">{opp.title}</td>
                      <td className="p-4"><Badge variant="outline" className={statusColors[opp.status]}>{statusLabels[opp.status]}</Badge></td>
                      <td className="p-4 text-sm text-foreground">{opp.value ? `₱${Number(opp.value).toLocaleString()}` : "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{opp.systemSize || "-"} {opp.systemType || ""}</td>
                      <td className="p-4">
                        {/* Stop row-level view clicks from firing behind the action buttons */}
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditingOpp(opp)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDelete(opp)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DetailDialog
        open={!!viewingOpp}
        onOpenChange={(open) => !open && setViewingOpp(null)}
        title={viewingOpp?.title || ""}
        subtitle={viewingOpp ? [viewingOpp.systemSize, viewingOpp.systemType].filter(Boolean).join(" ") || undefined : undefined}
        headerRight={viewingOpp ? <Badge variant="outline" className={statusColors[viewingOpp.status]}>{statusLabels[viewingOpp.status]}</Badge> : null}
        sections={[
          {
            title: "Opportunity Details",
            fields: [
              { label: "Title", value: viewingOpp?.title },
              { label: "Value", value: viewingOpp?.value ? formatPHP(viewingOpp.value) : undefined },
              { label: "System Size", value: viewingOpp?.systemSize },
              { label: "System Type", value: viewingOpp?.systemType },
              { label: "Expected Close Date", value: viewingOpp?.expectedCloseDate ? new Date(viewingOpp.expectedCloseDate).toLocaleDateString() : undefined },
              { label: "Contact", value: viewingOpp?.contactName ?? (viewingOpp?.contactId ? `#${viewingOpp.contactId}` : undefined) },
              { label: "Account", value: viewingOpp?.accountName ?? (viewingOpp?.accountId ? `#${viewingOpp.accountId}` : undefined) },
              { label: "Lead", value: viewingOpp?.leadName ?? (viewingOpp?.leadId ? `#${viewingOpp.leadId}` : undefined) },
              { label: "Assigned To", value: viewingOpp?.assignedToName ?? (viewingOpp?.assignedTo ? `#${viewingOpp.assignedTo}` : undefined) },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingOpp?.notes, full: true }],
          },
        ]}
        onEdit={() => {
          const opp = viewingOpp;
          setViewingOpp(null);
          setEditingOpp(opp);
        }}
        onDelete={() => handleDelete(viewingOpp)}
        isDeleting={deleteMutation.isPending}
      />

      <Dialog open={!!editingOpp} onOpenChange={(open) => !open && setEditingOpp(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Edit Opportunity</DialogTitle></DialogHeader>
          {editingOpp && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div><Label>Title *</Label><Input name="title" defaultValue={editingOpp.title} required className="bg-input border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Value (₱)</Label><Input name="value" type="number" defaultValue={editingOpp.value || ""} className="bg-input border-border" /></div>
                <div><Label>System Size</Label><Input name="systemSize" defaultValue={editingOpp.systemSize || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>System Type</Label><Input name="systemType" defaultValue={editingOpp.systemType || ""} className="bg-input border-border" /></div>
                <div>
                  <Label>Status</Label>
                  <select name="status" defaultValue={editingOpp.status} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>
              <div><Label>Notes</Label><Textarea name="notes" defaultValue={editingOpp.notes || ""} className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>Update Opportunity</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
