import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContactCombobox, { contactFullName, type ContactOption } from "@/components/ContactCombobox";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Edit, CheckCircle2, Clock, Wrench, Package, Play, Zap, Plus, DollarSign, Trash2, FileText } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

const STAGES = [
  { value: "procurement", label: "Procurement", icon: Package, color: "text-yellow-400", bgColor: "bg-yellow-500" },
  { value: "implementation", label: "Implementation", icon: Wrench, color: "text-blue-400", bgColor: "bg-blue-500" },
  { value: "ongoing", label: "On-going", icon: Play, color: "text-purple-400", bgColor: "bg-purple-500" },
  { value: "completed", label: "Project Completed", icon: CheckCircle2, color: "text-green-400", bgColor: "bg-green-500" },
];

function ProgressStepper({ currentStage }: { currentStage: string }) {
  const currentIndex = STAGES.findIndex((s) => s.value === currentStage);

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        {/* Background line */}
        <div className="absolute top-6 left-0 right-0 h-1 bg-border/50 mx-12" />
        {/* Progress line */}
        <div
          className="absolute top-6 left-0 h-1 bg-primary mx-12 transition-all duration-500"
          style={{ width: `${(currentIndex / (STAGES.length - 1)) * (100 - 12)}%` }}
        />

        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isFuture = idx > currentIndex;

          return (
            <div key={stage.value} className="flex flex-col items-center z-10 relative">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary border-primary"
                    : isCurrent
                    ? `${stage.bgColor} border-primary ring-4 ring-primary/20`
                    : "bg-muted/30 border-border"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-6 w-6 text-primary-foreground" />
                ) : (
                  <Icon className={`h-5 w-5 ${isCurrent ? "text-white" : "text-muted-foreground"}`} />
                )}
              </div>
              <span className={`mt-3 text-sm font-medium ${isCurrent ? stage.color : isFuture ? "text-muted-foreground" : "text-foreground"}`}>
                {stage.label}
              </span>
              {isCurrent && (
                <span className="mt-1 text-xs text-primary font-semibold">Current</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const [, navigate] = useLocation();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [stageNotes, setStageNotes] = useState("");
  const [newStage, setNewStage] = useState("");
  const [editContact, setEditContact] = useState<ContactOption | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const utils = trpc.useUtils();

  const { data: project, isLoading } = trpc.projects.getById.useQuery({ id: projectId });
  // Same query key as ContactCombobox uses, so tRPC serves it from cache.
  const { data: contactsData } = trpc.contacts.list.useQuery({ search: "", page: 1, limit: 500 });
  const contactOptions = (contactsData?.items ?? []) as unknown as ContactOption[];
  const { data: history } = trpc.projects.getHistory.useQuery({ projectId });
  const { data: setupTypes } = trpc.config.getOptions.useQuery({ category: "project_setup_type" });
  const { data: opportunitiesList } = trpc.opportunities.list.useQuery({ search: undefined, status: undefined });
  const { data: quotationsList } = trpc.quotations.list.useQuery();

  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => { toast.success("Project updated"); setIsEditOpen(false); utils.projects.getById.invalidate({ id: projectId }); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateStageMutation = trpc.projects.updateStage.useMutation({
    onSuccess: () => {
      toast.success("Stage updated");
      setIsStageDialogOpen(false);
      setStageNotes("");
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.getHistory.invalidate({ projectId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  /** Seed the dialog from the project: resolve its linked contact, prefill the address. */
  const openEditDialog = () => {
    const linked = project?.contactId ? contactOptions.find((c) => c.id === project.contactId) ?? null : null;
    setEditContact(linked);
    setEditAddress(project?.address || "");
    setIsEditOpen(true);
  };

  const handleContactChange = (contact: ContactOption | null) => {
    setEditContact(contact);
    if (contact) setEditAddress(contact.address || contact.city || "");
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: projectId,
      name: fd.get("name") as string,
      description: (fd.get("description") as string) || undefined,
      sizeOfSetup: (fd.get("sizeOfSetup") as string) || undefined,
      typeOfSetup: (fd.get("typeOfSetup") as string) || undefined,
      contactId: editContact?.id,
      // No contact picked? Keep whatever free-text name the project already had —
      // legacy projects predate contactId and must not be blanked on save.
      customerName: editContact ? contactFullName(editContact) : (project?.customerName || undefined),
      address: editAddress || undefined,
      startDate: (fd.get("startDate") as string) || undefined,
      targetCompletionDate: (fd.get("targetCompletionDate") as string) || undefined,
      opportunityId: fd.get("opportunityId") ? parseInt(fd.get("opportunityId") as string) : undefined,
      quotationId: fd.get("quotationId") ? parseInt(fd.get("quotationId") as string) : undefined,
      notes: (fd.get("notes") as string) || undefined,
      totalProjectAmount: (fd.get("totalProjectAmount") as string) || undefined,
    });
  };

  const handleStageUpdate = () => {
    if (!newStage) return;
    updateStageMutation.mutate({ id: projectId, stage: newStage, notes: stageNotes || undefined });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading project...</div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-muted-foreground">Project not found.</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{project.customerName || "No customer assigned"} {project.sizeOfSetup ? `• ${project.sizeOfSetup}` : ""} {project.typeOfSetup ? `• ${project.typeOfSetup}` : ""}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEditDialog} className="border-border">
            <Edit className="h-4 w-4 mr-2" /> Edit
          </Button>
          <Button onClick={() => { setNewStage(""); setIsStageDialogOpen(true); }} className="bg-primary text-primary-foreground">
            Update Stage
          </Button>
        </div>
      </div>

      {/* Progress Stepper */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <ProgressStepper currentStage={project.stage} />
        </CardContent>
      </Card>

      {/* Tabs: Details / History */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="details">Project Details</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="net-metering">Net Metering</TabsTrigger>
          <TabsTrigger value="nm-payments">NM Payments</TabsTrigger>
          <TabsTrigger value="history">Status History</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-foreground text-lg">Project Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Project Name</p>
                    <p className="text-foreground font-medium">{project.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type of Setup</p>
                    <p className="text-foreground">{project.typeOfSetup || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Size of Setup</p>
                    <p className="text-foreground">{project.sizeOfSetup || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current Stage</p>
                    <Badge className={`${STAGES.find(s => s.value === project.stage)?.bgColor || "bg-muted"} text-white text-xs mt-1`}>
                      {STAGES.find(s => s.value === project.stage)?.label || project.stage}
                    </Badge>
                  </div>
                </div>
                {project.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-foreground text-sm mt-1">{project.description}</p>
                  </div>
                )}
                {project.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-foreground text-sm mt-1">{project.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-foreground text-lg">Customer & Schedule</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer Name</p>
                    <p className="text-foreground">{project.customerName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Address / Location</p>
                    <p className="text-foreground">{project.address || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <p className="text-foreground">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Target Completion</p>
                    <p className="text-foreground">{project.targetCompletionDate ? new Date(project.targetCompletionDate).toLocaleDateString() : "-"}</p>
                  </div>
                  {project.completedDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Completed Date</p>
                      <p className="text-green-400">{new Date(project.completedDate).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
                {project.opportunityId && (
                  <div>
                    <p className="text-xs text-muted-foreground">Linked Opportunity</p>
                    <p className="text-primary cursor-pointer hover:underline" onClick={() => navigate("/opportunities")}>Opportunity #{project.opportunityId}</p>
                  </div>
                )}
                {project.quotationId && (
                  <div>
                    <p className="text-xs text-muted-foreground">Linked Quotation</p>
                    <p className="text-primary cursor-pointer hover:underline" onClick={() => navigate("/quotations")}>Quotation #{project.quotationId}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-foreground text-lg">Status Change History</CardTitle></CardHeader>
            <CardContent>
              {!history?.length ? (
                <p className="text-muted-foreground text-sm">No status changes recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {history.map((entry: any) => (
                    <div key={entry.id} className="flex items-start gap-4 p-3 rounded-md border border-border/30 bg-muted/10">
                      <div className="mt-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {entry.fromStage && (
                            <>
                              <Badge variant="outline" className="text-xs border-border">{STAGES.find(s => s.value === entry.fromStage)?.label || entry.fromStage}</Badge>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <Badge className={`${STAGES.find(s => s.value === entry.toStage)?.bgColor || "bg-muted"} text-white text-xs`}>
                            {STAGES.find(s => s.value === entry.toStage)?.label || entry.toStage}
                          </Badge>
                        </div>
                        {entry.notes && <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>}
                        <p className="text-xs text-muted-foreground mt-2">
                          by {entry.changedByName || "Unknown"} • {new Date(entry.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <PaymentsSection projectId={projectId} />
        </TabsContent>

        <TabsContent value="net-metering" className="mt-4">
          <NetMeteringSection projectId={projectId} project={project} />
        </TabsContent>

        <TabsContent value="nm-payments" className="mt-4">
          <NetMeteringPaymentsSection projectId={projectId} />
        </TabsContent>

        <TabsContent value="receipts" className="mt-4">
          <ReceiptHistorySection projectId={projectId} />
        </TabsContent>
      </Tabs>

      {/* Update Stage Dialog */}
      <Dialog open={isStageDialogOpen} onOpenChange={setIsStageDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Update Project Stage</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Stage</Label>
              <Badge className={`${STAGES.find(s => s.value === project.stage)?.bgColor || "bg-muted"} text-white text-xs mt-1 block w-fit`}>
                {STAGES.find(s => s.value === project.stage)?.label || project.stage}
              </Badge>
            </div>
            <div>
              <Label>Move to Stage *</Label>
              <select value={newStage} onChange={(e) => setNewStage(e.target.value)} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                <option value="">Select new stage...</option>
                {STAGES.filter(s => s.value !== project.stage).map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={stageNotes} onChange={(e) => setStageNotes(e.target.value)} placeholder="Reason for stage change..." className="bg-input border-border" rows={3} />
            </div>
            <Button onClick={handleStageUpdate} disabled={!newStage || updateStageMutation.isPending} className="w-full bg-primary text-primary-foreground">
              {updateStageMutation.isPending ? "Updating..." : "Update Stage"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Edit Project</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div><Label>Project Name *</Label><Input name="name" defaultValue={project.name} required className="bg-input border-border" /></div>
            <div><Label>Description</Label><Textarea name="description" defaultValue={project.description || ""} className="bg-input border-border" rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Size of Setup</Label><Input name="sizeOfSetup" defaultValue={project.sizeOfSetup || ""} className="bg-input border-border" /></div>
              <div>
                <Label>Type of Setup</Label>
                <select name="typeOfSetup" defaultValue={project.typeOfSetup || ""} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- Select Type --</option>
                  {setupTypes?.map((opt: any) => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Customer Name</Label>
                <ContactCombobox
                  value={editContact}
                  onChange={handleContactChange}
                  fallbackLabel={project.customerName}
                  placeholder="Search contacts..."
                />
              </div>
              <div>
                <Label>Address / Location</Label>
                <Input
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Total Project Amount</Label><Input name="totalProjectAmount" type="number" step="0.01" defaultValue={project.totalProjectAmount || ""} placeholder="0.00" className="bg-input border-border" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start Date</Label><Input name="startDate" type="date" defaultValue={project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
              <div><Label>Target Completion</Label><Input name="targetCompletionDate" type="date" defaultValue={project.targetCompletionDate ? new Date(project.targetCompletionDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Linked Opportunity</Label>
                <select name="opportunityId" defaultValue={project.opportunityId || ""} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- None --</option>
                  {opportunitiesList?.map((opp: any) => <option key={opp.id} value={opp.id}>{opp.title}</option>)}
                </select>
              </div>
              <div>
                <Label>Linked Quotation</Label>
                <select name="quotationId" defaultValue={project.quotationId || ""} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- None --</option>
                  {quotationsList?.items?.map((q: any) => <option key={q.id} value={q.id}>{q.quoteNumber} - {q.customerName || "Unnamed"}</option>)}
                </select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea name="notes" defaultValue={project.notes || ""} className="bg-input border-border" rows={2} /></div>
            <Button type="submit" disabled={updateMutation.isPending} className="w-full bg-primary text-primary-foreground">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentsSection({ projectId }: { projectId: number }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const utils = trpc.useUtils();

  const { data: payments } = trpc.projects.getPayments.useQuery({ projectId });
  const { data: summary } = trpc.projects.paymentSummary.useQuery({ projectId });
  const { data: paymentMethods } = trpc.config.getOptions.useQuery({ category: "payment_method" });

  const addMutation = trpc.projects.addPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded");
      setIsAddOpen(false);
      setPaymentMethod("");
      utils.projects.getPayments.invalidate({ projectId });
      utils.projects.paymentSummary.invalidate({ projectId });
    },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.projects.deletePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment deleted");
      utils.projects.getPayments.invalidate({ projectId });
      utils.projects.paymentSummary.invalidate({ projectId });
    },
    onError: (err: any) => toast.error(err.message),
  });
  const ackMutationRaw = trpc.acknowledgements.createForProjectPayment.useMutation({
    onError: (err: any) => toast.error(err.message),
  });
  const handleAck = async (paymentId: number) => {
    const printWindow = window.open('about:blank', '_blank');
    try {
      const data = await ackMutationRaw.mutateAsync({ paymentId });
      toast.success(`Acknowledgement Receipt ${data.receiptNumber} generated`);
      if (printWindow && data.id) {
        printWindow.location.href = `/api/acknowledgement-receipts/${data.id}/print`;
      }
    } catch {
      if (printWindow) printWindow.close();
    }
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addMutation.mutate({
      projectId,
      paymentDate: fd.get("paymentDate") as string,
      amount: fd.get("amount") as string,
      paymentMethod: paymentMethod || undefined,
      paymentReference: (fd.get("paymentReference") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const statusColor = summary?.status === "fully_paid" ? "bg-green-500/20 text-green-400" : summary?.status === "partially_paid" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400";
  const statusLabel = summary?.status === "fully_paid" ? "Fully Paid" : summary?.status === "partially_paid" ? "Partially Paid" : "Unpaid";

  return (
    <div className="space-y-4">
      {/* Payment Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Project Amount</p>
            <p className="text-xl font-bold text-foreground">{summary?.totalProjectAmount ? formatPHP(summary.totalProjectAmount) : "Not set"}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="text-xl font-bold text-green-400">{formatPHP(summary?.totalPaid || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Balance Remaining</p>
            <p className="text-xl font-bold text-orange-400">{formatPHP(summary?.balance || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payment Status</p>
            <Badge className={`${statusColor} text-sm mt-1`}>{statusLabel}</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Payments List */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground text-lg flex items-center gap-2"><DollarSign className="h-5 w-5 text-green-400" /> Payment Records</CardTitle>
            <Button onClick={() => setIsAddOpen(true)} size="sm" className="bg-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add Payment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!payments?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-right py-2 px-3">Amount</th>
                    <th className="text-left py-2 px-3">Method</th>
                    <th className="text-left py-2 px-3">Reference</th>
                    <th className="text-left py-2 px-3">Notes</th>
                    <th className="text-left py-2 px-3">Recorded By</th>
                    <th className="text-right py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="py-2 px-3 text-foreground">{new Date(p.paymentDate).toLocaleDateString()}</td>
                      <td className="py-2 px-3 text-right font-medium text-green-400">{formatPHP(p.amount)}</td>
                      <td className="py-2 px-3 text-foreground">{p.paymentMethod || "-"}</td>
                      <td className="py-2 px-3 text-foreground">{p.paymentReference || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{p.notes || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">{p.createdByName || "-"}</td>
                      <td className="py-2 px-3 text-right flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleAck(p.id)} title="Generate Acknowledgement Receipt" className="text-blue-400 hover:text-blue-300 h-7 w-7 p-0">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        {p.lastAckId && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(`/api/acknowledgement-receipts/${p.lastAckId}/print`, '_blank')} title="Re-print last receipt" className="text-green-400 hover:text-green-300 h-7 w-7 p-0">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: p.id, projectId })} className="text-red-400 hover:text-red-300 h-7 w-7 p-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Payment Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Payment Date *</Label><Input name="paymentDate" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className="bg-input border-border" /></div>
              <div><Label>Amount (PHP) *</Label><Input name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00" className="bg-input border-border" /></div>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Select method..." /></SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map((m: any) => <SelectItem key={m.id} value={m.value}>{m.value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference (Check #, Transaction ID, etc.)</Label><Input name="paymentReference" className="bg-input border-border" placeholder="e.g. CHK-001234" /></div>
            <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" rows={2} placeholder="Optional remarks..." /></div>
            <Button type="submit" disabled={addMutation.isPending} className="w-full bg-primary text-primary-foreground">
              {addMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NetMeteringPaymentsSection({ projectId }: { projectId: number }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const utils = trpc.useUtils();

  const { data: nmRecord } = trpc.netMetering.getByProjectId.useQuery({ projectId });
  const { data: payments } = trpc.netMeteringPayments.list.useQuery({ projectId });
  const { data: paymentMethods } = trpc.config.getOptions.useQuery({ category: "payment_method" });

  // --- Billing (what the client owes for the net metering processing) ---
  type BillRow = { description: string; amount: string };
  const [billRows, setBillRows] = useState<BillRow[]>([{ description: "", amount: "" }]);
  const [billNotes, setBillNotes] = useState("");
  const { data: billing } = trpc.netMeteringBillings.get.useQuery(
    { netMeteringId: nmRecord?.id ?? 0 },
    { enabled: !!nmRecord?.id }
  );

  // Load the saved billing into the editor once it arrives.
  useEffect(() => {
    if (billing) {
      setBillRows(
        (billing.items ?? []).length
          ? billing.items.map((it: any) => ({ description: it.description ?? "", amount: String(it.amount ?? "") }))
          : [{ description: "", amount: "" }]
      );
      setBillNotes(billing.notes ?? "");
    }
  }, [billing]);

  const saveBillingMutation = trpc.netMeteringBillings.save.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Billing ${data.billingNumber} saved`);
      utils.netMeteringBillings.get.invalidate({ netMeteringId: nmRecord?.id ?? 0 });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const billTotal = billRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  const handleSaveBilling = () => {
    if (!nmRecord) { toast.error("No net metering record found. Create one first."); return; }
    const items = billRows
      .filter(r => r.description.trim() && parseFloat(r.amount) >= 0 && r.amount !== "")
      .map(r => ({ description: r.description.trim(), amount: parseFloat(r.amount) }));
    if (items.length === 0) { toast.error("Add at least one entry with a description and amount"); return; }
    saveBillingMutation.mutate({ netMeteringId: nmRecord.id, projectId, items, notes: billNotes || undefined });
  };

  const addMutation = trpc.netMeteringPayments.add.useMutation({
    onSuccess: () => {
      toast.success("Net metering payment recorded");
      setIsAddOpen(false);
      setPaymentMethod("");
      utils.netMeteringPayments.list.invalidate({ projectId });
      utils.netMeteringPayments.centralList.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.netMeteringPayments.delete.useMutation({
    onSuccess: () => {
      toast.success("Payment deleted");
      utils.netMeteringPayments.list.invalidate({ projectId });
      utils.netMeteringPayments.centralList.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const nmAckMutationRaw = trpc.acknowledgements.createForNetMeteringPayment.useMutation({
    onError: (err: any) => toast.error(err.message),
  });
  const handleNmAck = async (paymentId: number) => {
    const printWindow = window.open('about:blank', '_blank');
    try {
      const data = await nmAckMutationRaw.mutateAsync({ paymentId });
      toast.success(`Acknowledgement Receipt ${data.receiptNumber} generated`);
      if (printWindow && data.id) {
        printWindow.location.href = `/api/acknowledgement-receipts/${data.id}/print`;
      }
    } catch {
      if (printWindow) printWindow.close();
    }
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!nmRecord) { toast.error("No net metering record found. Create one first."); return; }
    addMutation.mutate({
      projectId,
      netMeteringId: nmRecord.id,
      paymentDate: fd.get("paymentDate") as string,
      amount: fd.get("amount") as string,
      paymentMethod: paymentMethod || undefined,
      paymentReference: (fd.get("paymentReference") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const totalPaid = payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Billed</p>
            <p className="text-xl font-bold text-foreground">{formatPHP(billing?.total ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total NM Payments</p>
            <p className="text-xl font-bold text-green-400">{formatPHP(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-xl font-bold text-red-400">{formatPHP(Number(billing?.total ?? 0) - totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payment Count</p>
            <p className="text-xl font-bold text-foreground">{payments?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Billing — what the client owes for the net metering processing */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-400" /> NetMetering Process Billing
              {billing?.billingNumber && (
                <span className="font-mono text-xs text-muted-foreground">{billing.billingNumber}</span>
              )}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="border-border"
              disabled={!billing}
              title={billing ? "Open printable billing" : "Save the billing first"}
              onClick={() => nmRecord && window.open(`/api/net-metering/${nmRecord.id}/billing/pdf`, "_blank")}
            >
              <FileText className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!nmRecord ? (
            <p className="text-muted-foreground text-sm py-2">No net metering record for this project yet — create one first.</p>
          ) : (
            <>
              {billRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.description}
                    onChange={(e) => setBillRows(billRows.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))}
                    placeholder="Description (e.g. LGU permit fee)"
                    className="min-w-0 flex-1 bg-input border-border"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => setBillRows(billRows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
                    placeholder="0.00"
                    className="w-32 shrink-0 bg-input border-border"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-red-400"
                    onClick={() => setBillRows(billRows.filter((_, j) => j !== i))}
                    disabled={billRows.length === 1}
                    title="Remove entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" className="border-border" onClick={() => setBillRows([...billRows, { description: "", amount: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add entry
                </Button>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground mr-2">Total</span>
                  <span className="text-lg font-bold text-foreground tabular-nums">{formatPHP(billTotal)}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={billNotes} onChange={(e) => setBillNotes(e.target.value)} placeholder="Optional notes shown on the billing..." className="bg-input border-border" />
              </div>

              <Button className="bg-primary text-primary-foreground" onClick={handleSaveBilling} disabled={saveBillingMutation.isPending}>
                {saveBillingMutation.isPending ? "Saving..." : billing ? "Update Billing" : "Issue Billing"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payments List */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-400" /> Net Metering Payments</CardTitle>
            <Button onClick={() => setIsAddOpen(true)} size="sm" className="bg-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add Payment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!payments?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No net metering payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-right py-2 px-3">Amount</th>
                    <th className="text-left py-2 px-3">Method</th>
                    <th className="text-left py-2 px-3">Reference</th>
                    <th className="text-left py-2 px-3">Description</th>
                    <th className="text-left py-2 px-3">Notes</th>
                    <th className="text-right py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="py-2 px-3 text-foreground">{new Date(p.paymentDate).toLocaleDateString()}</td>
                      <td className="py-2 px-3 text-right font-medium text-green-400">{formatPHP(p.amount)}</td>
                      <td className="py-2 px-3 text-foreground">{p.paymentMethod || "-"}</td>
                      <td className="py-2 px-3 text-foreground">{p.paymentReference || "-"}</td>
                      <td className="py-2 px-3 text-foreground">{p.description || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{p.notes || "-"}</td>
                      <td className="py-2 px-3 text-right flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleNmAck(p.id)} title="Generate Acknowledgement Receipt" className="text-blue-400 hover:text-blue-300 h-7 w-7 p-0">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        {p.lastAckId && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(`/api/acknowledgement-receipts/${p.lastAckId}/print`, '_blank')} title="Re-print last receipt" className="text-green-400 hover:text-green-300 h-7 w-7 p-0">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: p.id })} className="text-red-400 hover:text-red-300 h-7 w-7 p-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Payment Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Record Net Metering Payment</DialogTitle></DialogHeader>
          {!nmRecord ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Please create a Net Metering record first before adding payments.</p>
          ) : (
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Payment Date *</Label><Input name="paymentDate" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className="bg-input border-border" /></div>
                <div><Label>Amount (PHP) *</Label><Input name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00" className="bg-input border-border" /></div>
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Select method..." /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods?.map((m: any) => <SelectItem key={m.id} value={m.value}>{m.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reference</Label><Input name="paymentReference" className="bg-input border-border" placeholder="e.g. OR-001234" /></div>
              <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" rows={2} placeholder="Optional remarks..." /></div>
              <Button type="submit" disabled={addMutation.isPending} className="w-full bg-primary text-primary-foreground">
                {addMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const NM_STATUSES = [
  { value: "plan_drawings", label: "Plan Drawings", color: "bg-slate-500/20 text-slate-300" },
  { value: "submitted_lgu", label: "Submitted to LGU", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "submitted_fire", label: "Submitted to Fire Dept", color: "bg-orange-500/20 text-orange-400" },
  { value: "submitted_electric", label: "Submitted to Electric Co.", color: "bg-blue-500/20 text-blue-400" },
  { value: "approved", label: "Approved", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "completed_energized", label: "Completed/Energized", color: "bg-green-500/20 text-green-400" },
];

function NetMeteringSection({ projectId, project }: { projectId: number; project: any }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: nmRecord } = trpc.netMetering.getByProjectId.useQuery({ projectId });
  const { data: setupTypes } = trpc.config.getOptions.useQuery({ category: "project_setup_type" });

  // Refresh the standalone Net Metering tab and the payments roll-up too —
  // otherwise a record created here sits behind a stale cache and looks like
  // it never appeared on those screens.
  const refreshNetMeteringViews = () => {
    utils.netMetering.getByProjectId.invalidate({ projectId });
    utils.netMetering.list.invalidate();
    utils.netMetering.stats.invalidate();
    utils.netMeteringPayments.centralList.invalidate();
  };

  const createMutation = trpc.netMetering.create.useMutation({
    onSuccess: () => { toast.success("Net metering record created"); setIsCreateOpen(false); refreshNetMeteringViews(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.netMetering.update.useMutation({
    onSuccess: () => { toast.success("Net metering updated"); setIsEditOpen(false); refreshNetMeteringViews(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      projectId,
      clientName: project.customerName || fd.get("clientName") as string,
      projectName: project.name,
      address: project.address || (fd.get("address") as string) || undefined,
      sizeOfSetup: project.sizeOfSetup || (fd.get("sizeOfSetup") as string) || undefined,
      typeOfSetup: project.typeOfSetup || (fd.get("typeOfSetup") as string) || undefined,
      status: (fd.get("status") as string) || "plan_drawings",
      electricCompany: (fd.get("electricCompany") as string) || undefined,
      applicationNumber: (fd.get("applicationNumber") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
      submittedDate: (fd.get("submittedDate") as string) || undefined,
    });
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!nmRecord) return;
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: nmRecord.id,
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

  const currentStatus = nmRecord ? NM_STATUSES.find(s => s.value === nmRecord.status) : null;
  const currentIdx = nmRecord ? NM_STATUSES.findIndex(s => s.value === nmRecord.status) : -1;

  if (!nmRecord) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground mb-4">No net metering record for this project yet.</p>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" /> Create Net Metering Record
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent className="max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-foreground">Create Net Metering Record</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Client Name *</Label><Input name="clientName" defaultValue={project.customerName || ""} required className="bg-input border-border" /></div>
                  <div><Label>Electric Company</Label><Input name="electricCompany" className="bg-input border-border" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Status</Label>
                    <select name="status" defaultValue="plan_drawings" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                      {NM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div><Label>Application Number</Label><Input name="applicationNumber" className="bg-input border-border" /></div>
                </div>
                <div><Label>Submitted Date</Label><Input name="submittedDate" type="date" className="bg-input border-border" /></div>
                <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" rows={2} /></div>
                <Button type="submit" disabled={createMutation.isPending} className="w-full bg-primary text-primary-foreground">
                  {createMutation.isPending ? "Creating..." : "Create Record"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Progress */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-400" /> Net Metering Status</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)} className="border-border">Edit</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visual stepper */}
          <div className="flex items-center justify-between relative">
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-border mx-8" />
            <div className="absolute top-4 left-0 h-0.5 bg-primary mx-8 transition-all" style={{ width: `${(currentIdx / (NM_STATUSES.length - 1)) * (100 - 8)}%` }} />
            {NM_STATUSES.map((s, idx) => (
              <div key={s.value} className="flex flex-col items-center z-10 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all ${
                  idx < currentIdx ? "bg-primary border-primary text-primary-foreground"
                  : idx === currentIdx ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-muted border-border text-muted-foreground"
                }`}>
                  {idx < currentIdx ? "\u2713" : idx + 1}
                </div>
                <p className={`text-[10px] mt-1 text-center max-w-[70px] ${idx <= currentIdx ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Current Status</p>
              <Badge className={`${currentStatus?.color || "bg-muted"} text-xs mt-1`}>{currentStatus?.label || nmRecord.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Electric Company</p>
              <p className="text-foreground text-sm">{nmRecord.electricCompany || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Application #</p>
              <p className="text-foreground text-sm">{nmRecord.applicationNumber || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Submitted Date</p>
              <p className="text-foreground text-sm">{nmRecord.submittedDate ? new Date(nmRecord.submittedDate).toLocaleDateString() : "-"}</p>
            </div>
          </div>
          {nmRecord.notes && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-foreground text-sm mt-1">{nmRecord.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Edit Net Metering</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Client Name *</Label><Input name="clientName" defaultValue={nmRecord.clientName} required className="bg-input border-border" /></div>
              <div><Label>Project Name</Label><Input name="projectName" defaultValue={nmRecord.projectName || ""} className="bg-input border-border" /></div>
            </div>
            <div><Label>Address</Label><Input name="address" defaultValue={nmRecord.address || ""} className="bg-input border-border" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Size of Setup</Label><Input name="sizeOfSetup" defaultValue={nmRecord.sizeOfSetup || ""} className="bg-input border-border" /></div>
              <div>
                <Label>Type of Setup</Label>
                <select name="typeOfSetup" defaultValue={nmRecord.typeOfSetup || ""} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="">-- Select --</option>
                  {setupTypes?.map((opt: any) => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue={nmRecord.status} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  {NM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div><Label>Electric Company</Label><Input name="electricCompany" defaultValue={nmRecord.electricCompany || ""} className="bg-input border-border" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Application Number</Label><Input name="applicationNumber" defaultValue={nmRecord.applicationNumber || ""} className="bg-input border-border" /></div>
              <div><Label>Submitted Date</Label><Input name="submittedDate" type="date" defaultValue={nmRecord.submittedDate ? new Date(nmRecord.submittedDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Approved Date</Label><Input name="approvedDate" type="date" defaultValue={nmRecord.approvedDate ? new Date(nmRecord.approvedDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
              <div><Label>Completed Date</Label><Input name="completedDate" type="date" defaultValue={nmRecord.completedDate ? new Date(nmRecord.completedDate).toISOString().split("T")[0] : ""} className="bg-input border-border" /></div>
            </div>
            <div><Label>Notes</Label><Textarea name="notes" defaultValue={nmRecord.notes || ""} className="bg-input border-border" rows={2} /></div>
            <Button type="submit" disabled={updateMutation.isPending} className="w-full bg-primary text-primary-foreground">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptHistorySection({ projectId }: { projectId: number }) {
  const { data: receipts, isLoading } = trpc.acknowledgements.getForProject.useQuery({ projectId });

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-foreground text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" /> Receipt History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading receipts...</p>
          ) : !receipts?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No receipts generated yet. Generate acknowledgement receipts from the Payments or NM Payments tabs.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-3">Receipt #</th>
                    <th className="text-left py-2 px-3">Type</th>
                    <th className="text-left py-2 px-3">Customer</th>
                    <th className="text-right py-2 px-3">Amount</th>
                    <th className="text-left py-2 px-3">Payment Date</th>
                    <th className="text-left py-2 px-3">Issued</th>
                    <th className="text-right py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="py-2 px-3 text-foreground font-mono text-xs">{r.receiptNumber}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={r.type === "project_payment" ? "border-green-500/50 text-green-400" : "border-blue-500/50 text-blue-400"}>
                          {r.type === "project_payment" ? "Project Payment" : "NM Payment"}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-foreground">{r.customerName || "-"}</td>
                      <td className="py-2 px-3 text-right font-medium text-green-400">{formatPHP(r.amount)}</td>
                      <td className="py-2 px-3 text-foreground">{r.paymentDate ? new Date(r.paymentDate).toLocaleDateString() : "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 px-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => window.open(`/api/acknowledgement-receipts/${r.id}/print`, '_blank')} title="Print / View Receipt" className="text-blue-400 hover:text-blue-300 h-7 px-2">
                          <FileText className="h-3.5 w-3.5 mr-1" /> Print
                        </Button>
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
