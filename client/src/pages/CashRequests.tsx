import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Check, X, Clock, CheckCircle, XCircle } from "lucide-react";
import DetailDialog from "@/components/DetailDialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString("default", { month: "long" }));

type SortMode = "month_asc" | "month_desc" | "date_desc" | "date_asc";

// Sorts by the request's *attributed* month/year (not raw createdAt) — an old/backfilled
// record tagged March belongs with March, regardless of when it was actually entered.
// Ties within the same month/year break by monthSeq (entry order).
function sortRequests(requests: any[], mode: SortMode): any[] {
  const byAttributedDate = (a: any, b: any) => (a.year - b.year) || (a.month - b.month) || (a.monthSeq - b.monthSeq);
  const arr = [...requests];
  switch (mode) {
    case "date_asc": return arr.sort(byAttributedDate);
    case "date_desc": return arr.sort((a, b) => -byAttributedDate(a, b));
    case "month_desc": return arr.sort((a, b) => (b.month - a.month) || (a.year - b.year) || (a.monthSeq - b.monthSeq));
    case "month_asc":
    default: return arr.sort((a, b) => (a.month - b.month) || (a.year - b.year) || (a.monthSeq - b.monthSeq));
  }
}

export default function CashRequests() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isSubAdmin = user?.role === "subadmin";
  const utils = trpc.useUtils();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isOldRecord, setIsOldRecord] = useState(false);
  const [oldMonth, setOldMonth] = useState(new Date().getMonth() + 1);
  const [sortMode, setSortMode] = useState<SortMode>("month_asc");
  const [viewingRequest, setViewingRequest] = useState<any>(null);

  const { data: requests, isLoading } = trpc.cashRequests.list.useQuery();
  const sortedRequests = useMemo(() => (requests ? sortRequests(requests, sortMode) : requests), [requests, sortMode]);

  // Approved-this-year KPIs — scoped the same as the list itself (admin sees all, sub-admin their own).
  const currentYear = new Date().getFullYear();
  const approvedThisYear = useMemo(
    () => (requests ?? []).filter((r: any) => r.status === "approved" && r.year === currentYear),
    [requests, currentYear]
  );
  const approvedCount = approvedThisYear.length;
  const approvedTotal = approvedThisYear.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
  const { data: purposeOptions } = trpc.config.getOptions.useQuery({ category: "cash_request_purpose" });

  // The id is reserved and the request written atomically server-side, only at
  // actual submit — never while just browsing a month — so no number is ever
  // burned without a real request behind it. See handleCreate for the payload.
  const createMutation = trpc.cashRequests.create.useMutation({
    onSuccess: (data) => { toast.success(`Cash request ${data.id} submitted`); setIsCreateOpen(false); utils.cashRequests.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const approveMutation = trpc.cashRequests.approve.useMutation({
    onSuccess: () => { toast.success("Cash request approved"); setViewingRequest(null); utils.cashRequests.list.invalidate(); utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const rejectMutation = trpc.cashRequests.reject.useMutation({
    onSuccess: () => { toast.success("Cash request rejected"); setViewingRequest(null); utils.cashRequests.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const receivedMutation = trpc.cashRequests.markReceived.useMutation({
    onSuccess: () => { toast.success("Marked as received"); utils.cashRequests.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      isOldRecord, month: isOldRecord ? oldMonth : undefined,
      purposeOptionId: parseInt(fd.get("purposeOptionId") as string),
      amount: parseFloat(fd.get("amount") as string),
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const statusBadge = (status: string, received: boolean) => {
    if (status === "approved" && received) {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Received</Badge>;
    }
    switch (status) {
      case "pending": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved": return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cash Requests</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Review and approve cash requests from sub-admins." : "Request cash and track approval status."}
          </p>
        </div>
        {isSubAdmin && (
          <Dialog
            open={isCreateOpen}
            onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (!open) { setIsOldRecord(false); setOldMonth(new Date().getMonth() + 1); }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> New Request</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-card border-border">
              <DialogHeader><DialogTitle className="text-foreground">New Cash Request</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-center">
                  <span className="text-xs text-muted-foreground block">Request ID</span>
                  <span className="text-lg font-mono font-semibold text-muted-foreground">Assigned on submit</span>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant={!isOldRecord ? "default" : "outline"} className={!isOldRecord ? "bg-primary text-primary-foreground flex-1" : "flex-1"} onClick={() => setIsOldRecord(false)}>New Record</Button>
                  <Button type="button" variant={isOldRecord ? "default" : "outline"} className={isOldRecord ? "bg-primary text-primary-foreground flex-1" : "flex-1"} onClick={() => setIsOldRecord(true)}>Old Record</Button>
                </div>

                {isOldRecord && (
                  <div>
                    <Label>Month *</Label>
                    <select value={oldMonth} onChange={(e) => setOldMonth(parseInt(e.target.value))} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                      {MONTH_NAMES.slice(0, new Date().getMonth() + 1).map((name, i) => (
                        <option key={i + 1} value={i + 1}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <Label>Purpose *</Label>
                  <select name="purposeOptionId" required className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                    <option value="">-- Select Purpose --</option>
                    {purposeOptions?.map((o: any) => (
                      <option key={o.id} value={o.id}>{o.value}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Amount (₱) *</Label>
                  <Input name="amount" type="number" min="0.01" step="0.01" required className="bg-input border-border" placeholder="0.00" />
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea name="notes" className="bg-input border-border" placeholder="Additional details..." />
                </div>

                <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>
                  Submit Request
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Approved This Year</div>
            <div className="text-2xl font-bold text-foreground mt-1">{approvedCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Approved Amount</div>
            <div className="text-2xl font-bold text-green-400 mt-1">{formatPHP(approvedTotal)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-56 bg-input border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month_asc">Group by Month (Jan → Dec)</SelectItem>
            <SelectItem value="month_desc">Group by Month (Dec → Jan)</SelectItem>
            <SelectItem value="date_desc">Newest → Oldest</SelectItem>
            <SelectItem value="date_asc">Oldest → Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Requested By</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Purpose</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Amount</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Record</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : sortedRequests?.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No cash requests found.</td></tr>
                ) : (
                  sortedRequests?.map((req: any) => {
                    const canMarkReceived = req.status === "approved" && !req.received && req.requestedBy === user?.id;
                    return (
                      <tr
                        key={req.id}
                        onClick={() => setViewingRequest(req)}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="p-4 text-sm font-mono text-foreground">{req.id}</td>
                        <td className="p-4 text-sm text-muted-foreground">{req.requestedByName}</td>
                        <td className="p-4 text-sm text-foreground">{req.purposeLabel}</td>
                        <td className="p-4 text-sm text-foreground font-medium">₱{req.amount}</td>
                        <td className="p-4 text-sm text-muted-foreground">{req.isOldRecord ? "Old" : "New"}</td>
                        <td className="p-4">{statusBadge(req.status, req.received)}</td>
                        <td className="p-4 text-sm text-muted-foreground">{new Date(req.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          {/* Stop row-level view clicks from firing behind the action buttons */}
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {req.status === "pending" && isAdmin && (
                              <>
                                <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300" onClick={() => approveMutation.mutate({ id: req.id })} disabled={approveMutation.isPending}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => rejectMutation.mutate({ id: req.id })} disabled={rejectMutation.isPending}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {canMarkReceived && (
                              <Button size="sm" variant="ghost" className="text-primary" onClick={() => receivedMutation.mutate({ id: req.id })} disabled={receivedMutation.isPending}>
                                Mark Received
                              </Button>
                            )}
                            {!(req.status === "pending" && isAdmin) && !canMarkReceived && (
                              <span className="text-xs text-muted-foreground">{req.decidedByName || "-"}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DetailDialog
        open={!!viewingRequest}
        onOpenChange={(open) => !open && setViewingRequest(null)}
        title={viewingRequest?.id}
        subtitle={viewingRequest?.purposeLabel}
        headerRight={viewingRequest ? statusBadge(viewingRequest.status, viewingRequest.received) : undefined}
        sections={[
          {
            title: "Request",
            fields: [
              { label: "Requested By", value: viewingRequest?.requestedByName },
              { label: "Purpose", value: viewingRequest?.purposeLabel },
              { label: "Amount", value: viewingRequest ? formatPHP(viewingRequest.amount) : undefined },
              { label: "Record", value: viewingRequest ? (viewingRequest.isOldRecord ? "Old" : "New") : undefined },
              { label: "Month", value: viewingRequest ? `${MONTH_NAMES[viewingRequest.month - 1]} ${viewingRequest.year}` : undefined },
              { label: "Submitted", value: viewingRequest ? new Date(viewingRequest.createdAt).toLocaleDateString() : undefined },
            ],
          },
          {
            title: "Approval",
            fields: [
              { label: "Decided By", value: viewingRequest?.decidedByName },
              { label: "Decided At", value: viewingRequest?.decidedAt ? new Date(viewingRequest.decidedAt).toLocaleDateString() : null },
              { label: "Received At", value: viewingRequest?.receivedAt ? new Date(viewingRequest.receivedAt).toLocaleDateString() : null },
              { label: "Rejection Reason", value: viewingRequest?.rejectionReason, full: true, hidden: !viewingRequest?.rejectionReason },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingRequest?.notes, full: true }],
          },
        ]}
        footerLeft={
          viewingRequest?.status === "pending" && isAdmin ? (
            <>
              <Button size="sm" variant="outline" className="border-border text-green-400 hover:text-green-300" onClick={() => approveMutation.mutate({ id: viewingRequest.id })} disabled={approveMutation.isPending}>
                <Check className="h-4 w-4 mr-2" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="border-border text-red-400 hover:text-red-300" onClick={() => rejectMutation.mutate({ id: viewingRequest.id })} disabled={rejectMutation.isPending}>
                <X className="h-4 w-4 mr-2" /> Reject
              </Button>
            </>
          ) : undefined
        }
      />
    </div>
  );
}
