import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ContactCombobox, { contactFullName, type ContactOption } from "@/components/ContactCombobox";
import { trpc } from "@/lib/trpc";
import { Plus, Search, FolderKanban, Filter, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import ExportButtons from "@/components/ExportButtons";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { confirm } from "@/lib/confirm";

const STAGES = [
  { value: "procurement", label: "Procurement", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "implementation", label: "Implementation", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "ongoing", label: "On-going", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "completed", label: "Project Completed", color: "bg-green-500/20 text-green-400 border-green-500/30" },
];

function StageBadge({ stage }: { stage: string }) {
  const s = STAGES.find((st) => st.value === stage);
  return <Badge className={`${s?.color || "bg-muted text-muted-foreground"} border text-xs`}>{s?.label || stage}</Badge>;
}

export default function Projects() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [startDateFrom, setStartDateFrom] = useState("");
  const [startDateTo, setStartDateTo] = useState("");
  const [createdDateFrom, setCreatedDateFrom] = useState("");
  const [createdDateTo, setCreatedDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [address, setAddress] = useState("");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: projectList, isLoading } = trpc.projects.list.useQuery({
    search: search || undefined,
    stage: stageFilter || undefined,
    typeOfSetup: typeFilter || undefined,
    sizeOfSetup: sizeFilter || undefined,
    startDateFrom: startDateFrom || undefined,
    startDateTo: startDateTo || undefined,
    createdDateFrom: createdDateFrom || undefined,
    createdDateTo: createdDateTo || undefined,
  });
  const { data: stats } = trpc.projects.stats.useQuery();
  const { data: setupTypes } = trpc.config.getOptions.useQuery({ category: "project_setup_type" });
  const { data: opportunitiesList } = trpc.opportunities.list.useQuery({ search: undefined, status: undefined });
  const { data: quotationsList } = trpc.quotations.list.useQuery();

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: (data) => { toast.success("Project created"); setIsCreateOpen(false); resetCreateForm(); utils.projects.list.invalidate(); utils.projects.stats.invalidate(); navigate(`/projects/${data.id}`); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => { toast.success("Project deleted"); utils.projects.list.invalidate(); utils.projects.stats.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  /** Picking a contact locks the customer name and prefills the site address, which stays editable. */
  const handleContactChange = (contact: ContactOption | null) => {
    setSelectedContact(contact);
    setAddress(contact ? contact.address || contact.city || "" : "");
  };

  const resetCreateForm = () => {
    setSelectedContact(null);
    setAddress("");
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name") as string,
      description: (fd.get("description") as string) || undefined,
      sizeOfSetup: (fd.get("sizeOfSetup") as string) || undefined,
      typeOfSetup: (fd.get("typeOfSetup") as string) || undefined,
      contactId: selectedContact?.id,
      customerName: selectedContact ? contactFullName(selectedContact) : undefined,
      address: address || undefined,
      stage: (fd.get("stage") as string) || "procurement",
      startDate: (fd.get("startDate") as string) || undefined,
      targetCompletionDate: (fd.get("targetCompletionDate") as string) || undefined,
      opportunityId: fd.get("opportunityId") ? parseInt(fd.get("opportunityId") as string) : undefined,
      quotationId: fd.get("quotationId") ? parseInt(fd.get("quotationId") as string) : undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const clearFilters = () => {
    setStageFilter("");
    setTypeFilter("");
    setSizeFilter("");
    setStartDateFrom("");
    setStartDateTo("");
    setCreatedDateFrom("");
    setCreatedDateTo("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Monitoring</h1>
          <p className="text-muted-foreground mt-1">Track and manage all solar installation projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons module="projects" params={{ search: search || undefined, stage: stageFilter || undefined, typeOfSetup: typeFilter || undefined }} />
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> New Project</Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-foreground">Create New Project</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>Project Name *</Label><Input name="name" required className="bg-input border-border" /></div>
              </div>
              <div><Label>Description</Label><Textarea name="description" className="bg-input border-border" rows={2} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Size of Setup</Label>
                  <Input name="sizeOfSetup" placeholder="e.g., 5 kW, 10 kW, 100 kW" className="bg-input border-border" />
                </div>
                <div>
                  <Label>Type of Setup</Label>
                  <select name="typeOfSetup" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="">-- Select Type --</option>
                    {setupTypes?.map((opt: any) => (
                      <option key={opt.id} value={opt.value}>{opt.value}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer Name</Label>
                  <ContactCombobox value={selectedContact} onChange={handleContactChange} placeholder="Search contacts..." />
                </div>
                <div>
                  <Label>Address / Location</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={selectedContact ? "No address on contact" : "Select a customer first"}
                    className="bg-input border-border"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Initial Stage</Label>
                  <select name="stage" defaultValue="procurement" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Linked Opportunity</Label>
                  <select name="opportunityId" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="">-- None --</option>
                    {opportunitiesList?.map((opp: any) => (
                      <option key={opp.id} value={opp.id}>{opp.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label>Linked Quotation</Label>
                <select name="quotationId" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- None --</option>
                  {quotationsList?.items?.map((q: any) => (
                    <option key={q.id} value={q.id}>{q.quoteNumber} - {q.customerName || "Unnamed"}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Start Date</Label><Input name="startDate" type="date" className="bg-input border-border" /></div>
                <div><Label>Target Completion Date</Label><Input name="targetCompletionDate" type="date" className="bg-input border-border" /></div>
              </div>
              <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" rows={2} /></div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full bg-primary text-primary-foreground">
                {createMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats?.total ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Projects</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{stats?.procurement ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Procurement</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{stats?.implementation ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">Implementation</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-400">{stats?.ongoing ?? "..."}</p>
            <p className="text-xs text-muted-foreground mt-1">On-going</p>
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
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by project, customer, address, type, size, date..."
                className="pl-10 bg-input border-border"
              />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="border-border">
              <Filter className="h-4 w-4 mr-2" /> Filters {showFilters ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-border/50">
              <div>
                <Label className="text-xs">Stage</Label>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">All Stages</option>
                  {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                <Label className="text-xs">Start From</Label>
                <Input type="date" value={startDateFrom} onChange={(e) => setStartDateFrom(e.target.value)} className="bg-input border-border" />
              </div>
              <div>
                <Label className="text-xs">Start To</Label>
                <Input type="date" value={startDateTo} onChange={(e) => setStartDateTo(e.target.value)} className="bg-input border-border" />
              </div>
              <div>
                <Label className="text-xs">Created From</Label>
                <Input type="date" value={createdDateFrom} onChange={(e) => setCreatedDateFrom(e.target.value)} className="bg-input border-border" />
              </div>
              <div>
                <Label className="text-xs">Created To</Label>
                <Input type="date" value={createdDateTo} onChange={(e) => setCreatedDateTo(e.target.value)} className="bg-input border-border" />
              </div>
              <div className="col-span-full flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">Clear Filters</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading projects...</div>
          ) : !projectList?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No projects found. Create your first project to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Project Name</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Customer</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Size</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Stage</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Payment</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Location</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Start Date</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projectList.map((project: any) => (
                    <tr key={project.id} className="border-b border-border/30 hover:bg-muted/10 cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
                      <td className="p-4">
                        <span className="text-foreground font-medium">{project.name}</span>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{project.customerName || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{project.typeOfSetup || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{project.sizeOfSetup || "-"}</td>
                      <td className="p-4"><StageBadge stage={project.stage} /></td>
                      <td className="p-4">
                        {project.paymentStatus === "fully_paid" ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 border text-xs">Paid</Badge>
                        ) : project.paymentStatus === "partially_paid" ? (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border text-xs">Partial</Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 border text-xs">Unpaid</Badge>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground max-w-[150px] truncate">{project.address || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "-"}</td>
                      <td className="p-4">
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={async () => { if (await confirm("Delete this project?")) deleteMutation.mutate({ id: project.id }); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
