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
import PaginationControls from "@/components/PaginationControls";
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

const statusLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export default function Leads() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [viewingLead, setViewingLead] = useState<any>(null);

  const { data, isLoading } = trpc.leads.list.useQuery({ search, status: statusFilter === "all" ? undefined : statusFilter, page, limit: 20 });
  const leads = data?.items;

  // Clamp page if it exceeds totalPages after data changes
  if (data && data.totalPages > 0 && page > data.totalPages) {
    setPage(data.totalPages);
  }
  const createMutation = trpc.leads.create.useMutation({
    onSuccess: () => {
      toast.success("Lead created successfully");
      setIsCreateOpen(false);
      utils.leads.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.leads.update.useMutation({
    onSuccess: () => {
      toast.success("Lead updated successfully");
      setEditingLead(null);
      utils.leads.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.leads.delete.useMutation({
    onSuccess: () => {
      toast.success("Lead deleted");
      setViewingLead(null);
      utils.leads.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const utils = trpc.useUtils();

  const handleDelete = async (lead: any) => {
    if (await confirm("Delete this lead?")) deleteMutation.mutate({ id: lead.id });
  };

  // Reset page when search or filter changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      firstName: fd.get("firstName") as string,
      lastName: (fd.get("lastName") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      company: (fd.get("company") as string) || undefined,
      source: (fd.get("source") as string) || undefined,
      status: (fd.get("status") as string) || "new",
      systemSize: (fd.get("systemSize") as string) || undefined,
      estimatedValue: (fd.get("estimatedValue") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingLead.id,
      firstName: fd.get("firstName") as string,
      lastName: (fd.get("lastName") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      company: (fd.get("company") as string) || undefined,
      source: (fd.get("source") as string) || undefined,
      status: (fd.get("status") as string) || "new",
      systemSize: (fd.get("systemSize") as string) || undefined,
      estimatedValue: (fd.get("estimatedValue") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground mt-1">Manage your sales leads and pipeline.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-2" /> Add Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create New Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>First Name *</Label><Input name="firstName" required className="bg-input border-border" /></div>
                <div><Label>Last Name</Label><Input name="lastName" className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input name="email" type="email" className="bg-input border-border" /></div>
                <div><Label>Phone</Label><Input name="phone" className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Company</Label><Input name="company" className="bg-input border-border" /></div>
                <div><Label>Source</Label><Input name="source" placeholder="Website, Referral, etc." className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>System Size</Label><Input name="systemSize" placeholder="e.g. 5kW" className="bg-input border-border" /></div>
                <div><Label>Estimated Value (₱)</Label><Input name="estimatedValue" type="number" className="bg-input border-border" /></div>
              </div>
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
              <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Lead"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, company, email, phone, source..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 bg-input border-border" />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-40 bg-input border-border">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
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
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Company</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">System Size</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Value</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : !leads || leads.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No leads found. Create your first lead to get started.</td></tr>
                ) : (
                  leads.map((lead: any) => (
                    <tr
                      key={lead.id}
                      onClick={() => setViewingLead(lead)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4">
                        <div className="font-medium text-foreground">{lead.firstName} {lead.lastName}</div>
                        <div className="text-xs text-muted-foreground">{lead.email}</div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{lead.company || "-"}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={statusColors[lead.status]}>
                          {statusLabels[lead.status]}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{lead.systemSize || "-"}</td>
                      <td className="p-4 text-sm text-foreground">{lead.estimatedValue ? `₱${Number(lead.estimatedValue).toLocaleString()}` : "-"}</td>
                      <td className="p-4">
                        {/* Stop row-level view clicks from firing behind the action buttons */}
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditingLead(lead)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDelete(lead)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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

      <DetailDialog
        open={!!viewingLead}
        onOpenChange={(open) => !open && setViewingLead(null)}
        title={viewingLead ? `${viewingLead.firstName} ${viewingLead.lastName || ""}`.trim() : ""}
        subtitle={viewingLead?.company || undefined}
        headerRight={viewingLead ? (
          <Badge variant="outline" className={statusColors[viewingLead.status]}>
            {statusLabels[viewingLead.status]}
          </Badge>
        ) : undefined}
        sections={[
          {
            title: "Lead Details",
            fields: [
              { label: "First Name", value: viewingLead?.firstName },
              { label: "Last Name", value: viewingLead?.lastName },
              { label: "Email", value: viewingLead?.email },
              { label: "Phone", value: viewingLead?.phone },
              { label: "Company", value: viewingLead?.company },
              { label: "Source", value: viewingLead?.source },
              { label: "System Size", value: viewingLead?.systemSize },
              { label: "Estimated Value", value: viewingLead ? formatPHP(viewingLead.estimatedValue, true) : undefined },
            ],
          },
          {
            title: "Relations",
            fields: [
              { label: "Contact", value: viewingLead?.contactName ?? (viewingLead?.contactId ? `#${viewingLead.contactId}` : undefined) },
              { label: "Account", value: viewingLead?.accountName ?? (viewingLead?.accountId ? `#${viewingLead.accountId}` : undefined) },
              { label: "Assigned To", value: viewingLead?.assignedToName ?? (viewingLead?.assignedTo ? `#${viewingLead.assignedTo}` : undefined) },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingLead?.notes, full: true }],
          },
        ]}
        onEdit={() => {
          const lead = viewingLead;
          setViewingLead(null);
          setEditingLead(lead);
        }}
        onDelete={() => handleDelete(viewingLead)}
        isDeleting={deleteMutation.isPending}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Lead</DialogTitle>
          </DialogHeader>
          {editingLead && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>First Name *</Label><Input name="firstName" defaultValue={editingLead.firstName} required className="bg-input border-border" /></div>
                <div><Label>Last Name</Label><Input name="lastName" defaultValue={editingLead.lastName || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input name="email" type="email" defaultValue={editingLead.email || ""} className="bg-input border-border" /></div>
                <div><Label>Phone</Label><Input name="phone" defaultValue={editingLead.phone || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Company</Label><Input name="company" defaultValue={editingLead.company || ""} className="bg-input border-border" /></div>
                <div><Label>Source</Label><Input name="source" defaultValue={editingLead.source || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>System Size</Label><Input name="systemSize" defaultValue={editingLead.systemSize || ""} className="bg-input border-border" /></div>
                <div><Label>Estimated Value (₱)</Label><Input name="estimatedValue" type="number" defaultValue={editingLead.estimatedValue || ""} className="bg-input border-border" /></div>
              </div>
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue={editingLead.status} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div><Label>Notes</Label><Textarea name="notes" defaultValue={editingLead.notes || ""} className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Updating..." : "Update Lead"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
