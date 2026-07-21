import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Check, X, Clock, CheckCircle, XCircle, Pencil, Trash2 } from "lucide-react";
import DetailDialog from "@/components/DetailDialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString("default", { month: "long" }));

type SortMode = "month_asc" | "month_desc" | "date_desc" | "date_asc";

/** One editable row in the entries editor. Kept as strings while typing. */
type ItemRow = { purposeOptionId: string; amount: string };
const emptyRow = (): ItemRow => ({ purposeOptionId: "", amount: "" });

/** Drop incomplete rows and convert to the shape the server expects. */
function buildItems(rows: ItemRow[]) {
  return rows
    .filter(r => r.purposeOptionId && parseFloat(r.amount) > 0)
    .map(r => ({ purposeOptionId: parseInt(r.purposeOptionId), amount: parseFloat(r.amount) }));
}

const rowsTotal = (rows: ItemRow[]) => rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

/** Repeating purpose + amount rows with a running total. */
function ItemsEditor({
  rows,
  setRows,
  purposeOptions,
}: {
  rows: ItemRow[];
  setRows: (rows: ItemRow[]) => void;
  purposeOptions: any[] | undefined;
}) {
  const update = (i: number, patch: Partial<ItemRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <Label>Entries *</Label>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={row.purposeOptionId}
            onChange={(e) => update(i, { purposeOptionId: e.target.value })}
            className="min-w-0 flex-1 rounded-md border border-border bg-input px-2 py-2 text-sm text-foreground"
          >
            <option value="">-- Purpose --</option>
            {purposeOptions?.map((o: any) => (
              <option key={o.id} value={o.id}>{o.value}</option>
            ))}
          </select>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={row.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
            className="w-28 shrink-0 border-border bg-input"
            placeholder="0.00"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-red-400"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            disabled={rows.length === 1}
            title="Remove entry"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="border-border" onClick={() => setRows([...rows, emptyRow()])}>
        <Plus className="mr-1 h-4 w-4" /> Add entry
      </Button>

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-bold tabular-nums text-foreground">{formatPHP(rowsTotal(rows))}</span>
      </div>
    </div>
  );
}

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

const itemsOf = (req: any): any[] =>
  (req?.items && req.items.length > 0)
    ? req.items
    : (req ? [{ purposeOptionId: req.purposeOptionId, purposeLabel: req.purposeLabel, amount: req.amount }] : []);

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
  const [createItems, setCreateItems] = useState<ItemRow[]>([emptyRow()]);
  const [editing, setEditing] = useState<any>(null);
  const [editItems, setEditItems] = useState<ItemRow[]>([emptyRow()]);
  const [editNotes, setEditNotes] = useState("");
  const [deletingRequest, setDeletingRequest] = useState<any>(null);

  const { data: requests, isLoading } = trpc.cashRequests.list.useQuery();
  const sortedRequests = useMemo(() => (requests ? sortRequests(requests, sortMode) : requests), [requests, sortMode]);

  // Approved-this-year KPIs — every admin and sub-admin now sees the whole cash book.
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
  const updateMutation = trpc.cashRequests.update.useMutation({
    onSuccess: () => { toast.success("Cash request updated"); setEditing(null); utils.cashRequests.list.invalidate(); },
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
  const deleteMutation = trpc.cashRequests.remove.useMutation({
    onSuccess: () => { toast.success("Cash request deleted"); setDeletingRequest(null); utils.cashRequests.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const items = buildItems(createItems);
    if (items.length === 0) { toast.error("Add at least one entry with a purpose and an amount"); return; }
    createMutation.mutate({
      isOldRecord, month: isOldRecord ? oldMonth : undefined,
      items,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  // Editable while pending (any sub-admin); after a decision only an admin can correct it.
  const canEdit = (req: any) => isAdmin || (isSubAdmin && req.status === "pending");
  // Erasing is pending-only for everyone — an approved/received record stays on the books.
  const canDelete = (req: any) => req.status === "pending" && (isSubAdmin || isAdmin);

  const openEdit = (req: any) => {
    setEditing(req);
    setEditItems(itemsOf(req).map((it: any) => ({ purposeOptionId: String(it.purposeOptionId ?? ""), amount: String(it.amount ?? "") })));
    setEditNotes(req.notes ?? "");
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const items = buildItems(editItems);
    if (items.length === 0) { toast.error("Add at least one entry with a purpose and an amount"); return; }
    updateMutation.mutate({ id: editing.id, items, notes: editNotes || undefined });
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
              if (!open) { setIsOldRecord(false); setOldMonth(new Date().getMonth() + 1); setCreateItems([emptyRow()]); }
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

                <ItemsEditor rows={createItems} setRows={setCreateItems} purposeOptions={purposeOptions} />

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
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Entries</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Total</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Record</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Received By</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : sortedRequests?.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No cash requests found.</td></tr>
                ) : (
                  sortedRequests?.map((req: any) => {
                    // Any sub-admin (or admin) can confirm receipt — not just the requester.
                    const canMarkReceived = req.status === "approved" && !req.received && (isSubAdmin || isAdmin);
                    const editable = canEdit(req);
                    const deletable = canDelete(req);
                    const hasActions = (req.status === "pending" && isAdmin) || canMarkReceived || editable || deletable;
                    const entries = itemsOf(req);
                    return (
                      <tr
                        key={req.id}
                        onClick={() => setViewingRequest(req)}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="p-4 text-sm font-mono text-foreground">{req.id}</td>
                        <td className="p-4 text-sm text-muted-foreground">{req.requestedByName}</td>
                        <td className="p-4 text-sm text-foreground">
                          <div className="max-w-[220px] truncate">{entries.map((i: any) => i.purposeLabel).join(", ")}</div>
                          {entries.length > 1 && (
                            <span className="text-xs text-muted-foreground">{entries.length} entries</span>
                          )}
                        </td>
                        <td className="p-4 text-sm font-medium tabular-nums text-foreground">{formatPHP(req.amount)}</td>
                        <td className="p-4 text-sm text-muted-foreground">{req.isOldRecord ? "Old" : "New"}</td>
                        <td className="p-4">{statusBadge(req.status, req.received)}</td>
                        <td className="p-4 text-sm text-muted-foreground">{req.receivedByName || "-"}</td>
                        <td className="p-4 text-sm text-muted-foreground">{new Date(req.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          {/* Stop row-level view clicks from firing behind the action buttons */}
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {req.status === "pending" && isAdmin && (
                              <>
                                <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300" onClick={() => approveMutation.mutate({ id: req.id })} disabled={approveMutation.isPending} title="Approve">
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => rejectMutation.mutate({ id: req.id })} disabled={rejectMutation.isPending} title="Reject">
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {editable && (
                              <Button size="sm" variant="ghost" className="text-primary" onClick={() => openEdit(req)} title="Edit entries">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {deletable && (
                              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setDeletingRequest(req)} title="Delete request">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            {canMarkReceived && (
                              <Button size="sm" variant="ghost" className="text-primary" onClick={() => receivedMutation.mutate({ id: req.id })} disabled={receivedMutation.isPending}>
                                Mark Received
                              </Button>
                            )}
                            {!hasActions && (
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

      {/* Erase confirmation — pending requests only, and deliberately irreversible. */}
      <AlertDialog open={!!deletingRequest} onOpenChange={(open) => { if (!open) setDeletingRequest(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete {deletingRequest?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases the pending request
              {deletingRequest ? ` for ${formatPHP(deletingRequest.amount)} (${deletingRequest.requestedByName})` : ""}.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => deletingRequest && deleteMutation.mutate({ id: deletingRequest.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog — entries can be changed while pending; admins can correct later. */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Edit {editing?.id}</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editing && editing.status !== "pending" && (
              <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-400">
                This request was already {editing.status}. You're editing it as an admin.
              </p>
            )}

            <ItemsEditor rows={editItems} setRows={setEditItems} purposeOptions={purposeOptions} />

            <div>
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="bg-input border-border" placeholder="Additional details..." />
            </div>

            <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <DetailDialog
        open={!!viewingRequest}
        onOpenChange={(open) => !open && setViewingRequest(null)}
        title={viewingRequest?.id}
        subtitle={viewingRequest ? itemsOf(viewingRequest).map((i: any) => i.purposeLabel).join(", ") : undefined}
        headerRight={viewingRequest ? statusBadge(viewingRequest.status, viewingRequest.received) : undefined}
        sections={[
          {
            title: "Request",
            fields: [
              { label: "Requested By", value: viewingRequest?.requestedByName },
              {
                label: "Entries",
                value: viewingRequest
                  ? itemsOf(viewingRequest).map((i: any) => `${i.purposeLabel} — ${formatPHP(i.amount)}`).join("  ·  ")
                  : undefined,
                full: true,
              },
              { label: "Total", value: viewingRequest ? formatPHP(viewingRequest.amount) : undefined },
              { label: "Record", value: viewingRequest ? (viewingRequest.isOldRecord ? "Old" : "New") : undefined },
              { label: "Month", value: viewingRequest ? `${MONTH_NAMES[viewingRequest.month - 1]} ${viewingRequest.year}` : undefined },
              { label: "Submitted", value: viewingRequest ? new Date(viewingRequest.createdAt).toLocaleDateString() : undefined },
            ],
          },
          {
            title: "Trail",
            fields: [
              { label: "Requested By", value: viewingRequest?.requestedByName },
              { label: "Decided By", value: viewingRequest?.decidedByName },
              { label: "Decided At", value: viewingRequest?.decidedAt ? new Date(viewingRequest.decidedAt).toLocaleDateString() : null },
              { label: "Received By", value: viewingRequest?.receivedByName },
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
