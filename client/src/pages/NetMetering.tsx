import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Filter, Pencil, Trash2, Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { confirm } from "@/lib/confirm";
import DetailDialog from "@/components/DetailDialog";

const STATUSES = [
  { value: "plan_drawings", label: "Plan Drawings", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  { value: "submitted_lgu", label: "Submitted to LGU", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "submitted_fire", label: "Submitted to Fire Dept", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "submitted_electric", label: "Submitted to Electric Co.", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "approved", label: "Approved", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "completed_energized", label: "Completed/Energized", color: "bg-green-500/20 text-green-400 border-green-500/30" },
];

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find((st) => st.value === status);
  return (
    <Badge variant="outline" className={`text-xs border ${s?.color || "bg-muted text-muted-foreground border-border"}`}>
      {s?.label || status}
    </Badge>
  );
}

export default function NetMetering() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [electricCompanyFilter, setElectricCompanyFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [viewingRecord, setViewingRecord] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: records, isLoading } = trpc.netMetering.list.useQuery({
    search: search || undefined,
    status: statusFilter || undefined,
    typeOfSetup: typeFilter || undefined,
    sizeOfSetup: sizeFilter || undefined,
    electricCompany: electricCompanyFilter || undefined,
  });
  const { data: stats } = trpc.netMetering.stats.useQuery();
  const { data: setupTypes } = trpc.config.getOptions.useQuery({ category: "project_setup_type" });
  const { data: projectsList } = trpc.projects.list.useQuery({
    search: undefined, stage: undefined, typeOfSetup: undefined,
    sizeOfSetup: undefined, startDateFrom: undefined, startDateTo: undefined,
    createdDateFrom: undefined, createdDateTo: undefined,
  });

  const createMutation = trpc.netMetering.create.useMutation({
    onSuccess: () => { toast.success("Net metering record created"); setIsCreateOpen(false); utils.netMetering.list.invalidate(); utils.netMetering.stats.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.netMetering.update.useMutation({
    onSuccess: () => { toast.success("Record updated"); setEditRecord(null); utils.netMetering.list.invalidate(); utils.netMetering.stats.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.netMetering.delete.useMutation({
    onSuccess: () => { toast.success("Record deleted"); setViewingRecord(null); utils.netMetering.list.invalidate(); utils.netMetering.stats.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (record: any) => {
    if (await confirm("Delete this record?")) deleteMutation.mutate({ id: record.id });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      projectId: fd.get("projectId") ? parseInt(fd.get("projectId") as string) : undefined,
      clientName: fd.get("clientName") as string,
      projectName: (fd.get("projectName") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      sizeOfSetup: (fd.get("sizeOfSetup") as string) || undefined,
      typeOfSetup: (fd.get("typeOfSetup") as string) || undefined,
      status: (fd.get("status") as string) || "plan_drawings",
      electricCompany: (fd.get("electricCompany") as string) || undefined,
      applicationNumber: (fd.get("applicationNumber") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
      submittedDate: (fd.get("submittedDate") as string) || undefined,
    });
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editRecord.id,
      clientName: fd.get("clientName") as string,
      projectName: (fd.get("projectName") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      sizeOfSetup: (fd.get("sizeOfSetup") as string) || undefined,
      typeOfSetup: (fd.get("typeOfSetup") as string) || undefined,
      status: (fd.get("status") as string) || undefined,
      electricCompany: (fd.get("electricCompany") as string) || undefined,
      applicationNumber: (fd.get("applicationNumber") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
      submittedDate: (fd.get("submittedDate") as string) || undefined,
      approvedDate: (fd.get("approvedDate") as string) || undefined,
      completedDate: (fd.get("completedDate") as string) || undefined,
    });
  };

  const clearFilters = () => {
    setStatusFilter("");
    setTypeFilter("");
    setSizeFilter("");
    setElectricCompanyFilter("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Net Metering</h1>
          <p className="text-muted-foreground text-sm mt-1">Track all net metering applications and their current status.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> New Record
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats?.total ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Records</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-400">{stats?.planDrawings ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Plan Drawings</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{stats?.submitted ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Submitted</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{stats?.approved ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Approved</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{stats?.completed ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by client, project, address, electric co., date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-input border-border"
              />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="border-border text-foreground">
              <Filter className="h-4 w-4 mr-2" /> Filters <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </Button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border">
              <div>
                <Label className="text-xs">Status</Label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">All Statuses</option>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Type of Setup</Label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">All Types</option>
                  {setupTypes?.map((opt: any) => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Size</Label>
                <Input value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)} placeholder="e.g., 5 kW" className="bg-input border-border" />
              </div>
              <div>
                <Label className="text-xs">Electric Company</Label>
                <Input value={electricCompanyFilter} onChange={(e) => setElectricCompanyFilter(e.target.value)} placeholder="e.g., Meralco" className="bg-input border-border" />
              </div>
              <div className="col-span-full flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">Clear Filters</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : !records?.length ? (
            <div className="p-12 text-center">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No net metering records found. Create your first record to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Client Name</TableHead>
                  <TableHead className="text-muted-foreground">Project</TableHead>
                  <TableHead className="text-muted-foreground">Address</TableHead>
                  <TableHead className="text-muted-foreground">Size</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Electric Co.</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record: any) => (
                  <TableRow key={record.id} onClick={() => setViewingRecord(record)} className="border-border hover:bg-muted/10 cursor-pointer">
                    <TableCell className="font-medium text-foreground">{record.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">{record.projectName || "-"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate">{record.address || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{record.sizeOfSetup || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{record.typeOfSetup || "-"}</TableCell>
                    <TableCell><StatusBadge status={record.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{record.electricCompany || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setEditRecord(record)} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(record)} className="text-muted-foreground hover:text-destructive h-8 w-8 p-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">New Net Metering Record</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Client Name *</Label><Input name="clientName" required className="bg-input border-border" /></div>
              <div><Label>Project Name</Label><Input name="projectName" className="bg-input border-border" /></div>
            </div>
            <div>
              <Label>Linked Project</Label>
              <select name="projectId" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                <option value="">-- None --</option>
                {projectsList?.map((p: any) => <option key={p.id} value={p.id}>{p.name} - {p.customerName || ""}</option>)}
              </select>
            </div>
            <div><Label>Address / Location</Label><Input name="address" className="bg-input border-border" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Size of Setup</Label><Input name="sizeOfSetup" placeholder="e.g., 5 kW" className="bg-input border-border" /></div>
              <div>
                <Label>Type of Setup</Label>
                <select name="typeOfSetup" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- Select Type --</option>
                  {setupTypes?.map((opt: any) => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Net Metering Status</Label>
                <select name="status" defaultValue="plan_drawings" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div><Label>Electric Company</Label><Input name="electricCompany" placeholder="e.g., Meralco" className="bg-input border-border" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Application Number</Label><Input name="applicationNumber" className="bg-input border-border" /></div>
              <div><Label>Submitted Date</Label><Input name="submittedDate" type="date" className="bg-input border-border" /></div>
            </div>
            <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" rows={2} /></div>
            <Button type="submit" disabled={createMutation.isPending} className="w-full bg-primary text-primary-foreground">
              {createMutation.isPending ? "Creating..." : "Create Record"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <DetailDialog
        open={!!viewingRecord}
        onOpenChange={(open) => !open && setViewingRecord(null)}
        title={viewingRecord?.clientName}
        subtitle={viewingRecord?.projectName || undefined}
        headerRight={viewingRecord ? <StatusBadge status={viewingRecord.status} /> : undefined}
        sections={[
          {
            title: "Application Details",
            fields: [
              { label: "Client Name", value: viewingRecord?.clientName },
              { label: "Project Name", value: viewingRecord?.projectName },
              { label: "Linked Project ID", value: viewingRecord?.projectId },
              { label: "Address", value: viewingRecord?.address, full: true },
              { label: "Size of Setup", value: viewingRecord?.sizeOfSetup },
              { label: "Type of Setup", value: viewingRecord?.typeOfSetup },
              { label: "Electric Company", value: viewingRecord?.electricCompany },
              { label: "Application Number", value: viewingRecord?.applicationNumber },
            ],
          },
          {
            title: "Dates",
            fields: [
              { label: "Submitted Date", value: viewingRecord?.submittedDate ? new Date(viewingRecord.submittedDate).toLocaleDateString() : null },
              { label: "Approved Date", value: viewingRecord?.approvedDate ? new Date(viewingRecord.approvedDate).toLocaleDateString() : null },
              { label: "Completed Date", value: viewingRecord?.completedDate ? new Date(viewingRecord.completedDate).toLocaleDateString() : null },
              { label: "Created At", value: viewingRecord?.createdAt ? new Date(viewingRecord.createdAt).toLocaleDateString() : null },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingRecord?.notes, full: true }],
          },
        ]}
        onEdit={() => {
          const record = viewingRecord;
          setViewingRecord(null);
          setEditRecord(record);
        }}
        onDelete={() => handleDelete(viewingRecord)}
        isDeleting={deleteMutation.isPending}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) setEditRecord(null); }}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Edit Net Metering Record</DialogTitle></DialogHeader>
          {editRecord && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Client Name *</Label><Input name="clientName" defaultValue={editRecord.clientName} required className="bg-input border-border" /></div>
                <div><Label>Project Name</Label><Input name="projectName" defaultValue={editRecord.projectName || ""} className="bg-input border-border" /></div>
              </div>
              <div><Label>Address / Location</Label><Input name="address" defaultValue={editRecord.address || ""} className="bg-input border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Size of Setup</Label><Input name="sizeOfSetup" defaultValue={editRecord.sizeOfSetup || ""} className="bg-input border-border" /></div>
                <div>
                  <Label>Type of Setup</Label>
                  <select name="typeOfSetup" defaultValue={editRecord.typeOfSetup || ""} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="">-- Select Type --</option>
                    {setupTypes?.map((opt: any) => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Net Metering Status</Label>
                  <select name="status" defaultValue={editRecord.status} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div><Label>Electric Company</Label><Input name="electricCompany" defaultValue={editRecord.electricCompany || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Application Number</Label><Input name="applicationNumber" defaultValue={editRecord.applicationNumber || ""} className="bg-input border-border" /></div>
                <div><Label>Submitted Date</Label><Input name="submittedDate" type="date" defaultValue={editRecord.submittedDate ? new Date(editRecord.submittedDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Approved Date</Label><Input name="approvedDate" type="date" defaultValue={editRecord.approvedDate ? new Date(editRecord.approvedDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
                <div><Label>Completed Date</Label><Input name="completedDate" type="date" defaultValue={editRecord.completedDate ? new Date(editRecord.completedDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
              </div>
              <div><Label>Notes</Label><Textarea name="notes" defaultValue={editRecord.notes || ""} className="bg-input border-border" rows={2} /></div>
              <Button type="submit" disabled={updateMutation.isPending} className="w-full bg-primary text-primary-foreground">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
