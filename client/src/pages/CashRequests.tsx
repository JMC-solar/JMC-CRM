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
import { Plus, Check, X, Clock, CheckCircle, XCircle, Pencil, Trash2, Search } from "lucide-react";
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

/** One editable expense row in the liquidation editor. */
type LiqRow = { purposeOptionId: string; description: string; payee: string; spentDate: string; amount: string };
const emptyLiqRow = (): LiqRow => ({ purposeOptionId: "", description: "", payee: "", spentDate: "", amount: "" });
const liqRowsTotal = (rows: LiqRow[]) => rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

/** Drop incomplete rows and convert to the shape submitLiquidation expects. */
function buildLiqItems(rows: LiqRow[]) {
  return rows
    .filter(r => r.description.trim() && parseFloat(r.amount) > 0)
    .map(r => ({
      purposeOptionId: r.purposeOptionId ? parseInt(r.purposeOptionId) : null,
      description: r.description.trim(),
      payee: r.payee.trim() || undefined,
      spentDate: r.spentDate || undefined,
      amount: parseFloat(r.amount),
    }));
}

/** Repeating "what the cash was actually spent on" rows. */
function LiquidationEditor({ rows, setRows, purposeOptions }: { rows: LiqRow[]; setRows: (rows: LiqRow[]) => void; purposeOptions: any[] | undefined }) {
  const update = (i: number, patch: Partial<LiqRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <Label>Expenses *</Label>
      {rows.map((row, i) => (
        <div key={i} className="space-y-1 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <Input placeholder="What was it spent on?" value={row.description} onChange={(e) => update(i, { description: e.target.value })} className="min-w-0 flex-1 bg-input border-border" />
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={row.amount} onChange={(e) => update(i, { amount: e.target.value })} className="w-28 shrink-0 bg-input border-border" />
            <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-red-400" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} title="Remove expense"><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <select value={row.purposeOptionId} onChange={(e) => update(i, { purposeOptionId: e.target.value })} className="min-w-0 flex-1 rounded-md border border-border bg-input px-2 py-1.5 text-xs text-muted-foreground">
              <option value="">Purpose (optional)</option>
              {purposeOptions?.map((o: any) => <option key={o.id} value={o.id}>{o.value}</option>)}
            </select>
            <Input placeholder="Payee (optional)" value={row.payee} onChange={(e) => update(i, { payee: e.target.value })} className="h-8 min-w-0 flex-1 bg-input border-border text-xs" />
            <Input type="date" value={row.spentDate} onChange={(e) => update(i, { spentDate: e.target.value })} className="h-8 w-36 shrink-0 bg-input border-border text-xs" />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="border-border" onClick={() => setRows([...rows, emptyLiqRow()])}>
        <Plus className="mr-1 h-4 w-4" /> Add expense
      </Button>
    </div>
  );
}

// Liquidation lifecycle for a request, from the receiver's side:
//   "n/a"       — cash not yet received, nothing to account for
//   "awaiting"  — received, nothing submitted yet (or sent back for correction)
//   "submitted" — accounting submitted, waiting on an admin to verify
//   "verified"  — admin signed off; the money is fully accounted for
function liqStateOf(req: any): "n/a" | "awaiting" | "submitted" | "verified" {
  if (!(req?.status === "approved" && req?.received)) return "n/a";
  const s = req?.liquidation?.status;
  if (s === "verified") return "verified";
  if (s === "submitted") return "submitted";
  return "awaiting";
}

// The outstanding amount for a settlement type, from a request's accounting.
const t2 = (a: any, t: string) => t === "return" ? a.outstandingReturn : t === "charge" ? a.outstandingCharge : a.outstandingReimburse;
const settleTypeLabel: Record<string, string> = { return: "Cash returned to office", charge: "Charge repaid by receiver", reimburse: "Reimbursement paid by office" };

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
  // The Auditor is the admin's cash-side backup, so on THIS page it has the same
  // powers as admin (approve / review / verify / settle / edit). Creating requests
  // stays with sub-admins (the New Request button below is gated on isSubAdmin).
  const isAdmin = user?.role === "admin" || user?.role === "auditor";
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
  const [liquidating, setLiquidating] = useState<any>(null);
  const [liqRows, setLiqRows] = useState<LiqRow[]>([emptyLiqRow()]);
  const [liqReturned, setLiqReturned] = useState("");
  const [liqNotes, setLiqNotes] = useState("");
  // Approving with an editable "amount to release" (may exceed requested).
  const [approving, setApproving] = useState<any>(null);
  const [releaseAmount, setReleaseAmount] = useState("");
  // Per-line liquidation review (admin) — track by id so it stays fresh on refetch.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // Settlement — record returns / charge repayments / reimbursements.
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settleType, setSettleType] = useState<"return" | "charge" | "reimburse">("return");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState("");
  const [settleNotes, setSettleNotes] = useState("");
  // Search + filters on the main list.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [liqFilter, setLiqFilter] = useState<string>("all");

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

  // Received cash still waiting to be accounted for — the watchlist that keeps money honest.
  const awaitingLiquidation = useMemo(
    () => (requests ?? []).filter((r: any) => liqStateOf(r) === "awaiting"),
    [requests]
  );
  const awaitingCount = awaitingLiquidation.length;
  const awaitingTotal = awaitingLiquidation.reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  // Flag likely double entries: same requester + same total + same first purpose within 3 days.
  const duplicateIds = useMemo(() => {
    const dup = new Set<string>();
    const list = requests ?? [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a: any = list[i], b: any = list[j];
        if (a.requestedBy === b.requestedBy && Number(a.amount) === Number(b.amount)) {
          const ap = itemsOf(a)[0]?.purposeLabel, bp = itemsOf(b)[0]?.purposeLabel;
          const days = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) / 86400000;
          if (ap === bp && days <= 3) { dup.add(a.id); dup.add(b.id); }
        }
      }
    }
    return dup;
  }, [requests]);

  // Apply the search box + status/liquidation filters on top of the sort.
  const displayedRequests = useMemo(() => {
    let list = sortedRequests ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r: any) => {
      const hay = [r.id, r.requestedByName, r.receivedByName, r.decidedByName, r.amount, r.releasedAmount,
        MONTH_NAMES[r.month - 1], String(r.year),
        ...itemsOf(r).map((i: any) => i.purposeLabel),
        ...((r.liquidation?.items ?? []).flatMap((it: any) => [it.description, it.payee, it.amount])),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (liqFilter !== "all") list = list.filter((r: any) => liqStateOf(r) === liqFilter);
    return list;
  }, [sortedRequests, search, statusFilter, liqFilter]);

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
    onSuccess: () => { toast.success("Cash request approved"); setViewingRequest(null); setApproving(null); utils.cashRequests.list.invalidate(); utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); },
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
  const invalidateAll = () => { utils.cashRequests.list.invalidate(); utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); };
  const submitLiqMutation = trpc.cashRequests.submitLiquidation.useMutation({
    onSuccess: () => { toast.success("Liquidation submitted for verification"); setLiquidating(null); invalidateAll(); },
    onError: (err: any) => toast.error(err.message),
  });
  const verifyLiqMutation = trpc.cashRequests.verifyLiquidation.useMutation({
    onSuccess: () => { toast.success("All lines accepted — liquidation reviewed"); setViewingRequest(null); setReviewingId(null); invalidateAll(); },
    onError: (err: any) => toast.error(err.message),
  });
  const rejectLiqMutation = trpc.cashRequests.rejectLiquidation.useMutation({
    onSuccess: () => { toast.success("Sent back for correction"); setViewingRequest(null); setReviewingId(null); invalidateAll(); },
    onError: (err: any) => toast.error(err.message),
  });
  const reopenLiqMutation = trpc.cashRequests.reopenLiquidation.useMutation({
    onSuccess: () => { toast.success("Reopened — sent back to the receiver to add/adjust"); setViewingRequest(null); setReviewingId(null); invalidateAll(); },
    onError: (err: any) => toast.error(err.message),
  });
  const reviewLineMutation = trpc.cashRequests.reviewLiquidationLine.useMutation({
    onSuccess: () => { utils.cashRequests.list.invalidate(); utils.notifications.list.invalidate(); utils.notifications.unreadCount.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const recordSettlementMutation = trpc.cashRequests.recordSettlement.useMutation({
    onSuccess: () => { toast.success("Settlement recorded"); setSettleAmount(""); setSettleNotes(""); invalidateAll(); },
    onError: (err: any) => toast.error(err.message),
  });
  const removeSettlementMutation = trpc.cashRequests.removeSettlement.useMutation({
    onSuccess: () => { toast.success("Settlement removed"); invalidateAll(); },
    onError: (err: any) => toast.error(err.message),
  });

  // Keep the review dialog pointed at the latest data as lines are decided.
  const reviewing = reviewingId ? (requests ?? []).find((r: any) => r.id === reviewingId) : null;
  // Settlement dialog target (kept fresh from the live list).
  const settling = settlingId ? (requests ?? []).find((r: any) => r.id === settlingId) : null;
  const settleOutstanding = (t: string) => settling?.accounting
    ? Number(t === "return" ? settling.accounting.outstandingReturn : t === "charge" ? settling.accounting.outstandingCharge : settling.accounting.outstandingReimburse)
    : 0;
  const openSettle = (req: any) => {
    setSettlingId(req.id);
    const a = req.accounting;
    const firstType = a && Number(a.outstandingReturn) > 0 ? "return" : a && Number(a.outstandingCharge) > 0 ? "charge" : a && Number(a.outstandingReimburse) > 0 ? "reimburse" : "return";
    setSettleType(firstType as any);
    setSettleAmount(a ? String(Number(t2(a, firstType))) : "");
    setSettleDate(new Date().toISOString().slice(0, 10));
    setSettleNotes("");
  };
  const onSettleTypeChange = (t: "return" | "charge" | "reimburse") => {
    setSettleType(t);
    setSettleAmount(settling?.accounting ? String(Number(t2(settling.accounting, t))) : "");
  };
  const handleRecordSettle = () => {
    if (!settling) return;
    const amt = parseFloat(settleAmount);
    if (!(amt > 0)) { toast.error("Enter an amount to record."); return; }
    recordSettlementMutation.mutate({ id: settling.id, type: settleType, amount: amt, date: settleDate || undefined, notes: settleNotes || undefined });
  };

  // Per-receiver outstanding balances across all their requests.
  const receiverBalances = useMemo(() => {
    const map = new Map<string, { owes: number; owed: number }>();
    for (const r of (requests ?? []) as any[]) {
      const a = r.accounting; if (!a) continue;
      const who = r.receivedByName || r.requestedByName || "—";
      const owes = Number(a.outstandingReturn) + Number(a.outstandingCharge);
      const owed = Number(a.outstandingReimburse);
      if (owes === 0 && owed === 0) continue;
      const cur = map.get(who) ?? { owes: 0, owed: 0 };
      cur.owes += owes; cur.owed += owed; map.set(who, cur);
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.owes - a.owes);
  }, [requests]);
  const openApprove = (req: any) => { setApproving(req); setReleaseAmount(String(req.amount ?? "")); };
  const handleApprove = () => {
    const amt = parseFloat(releaseAmount);
    if (!(amt >= 0)) { toast.error("Enter the amount to release."); return; }
    approveMutation.mutate({ id: approving.id, releasedAmount: amt });
  };
  const rejectLine = (id: string, index: number) => {
    const reason = window.prompt("Why is this expense rejected? (charged to the receiver)") ?? undefined;
    if (reason === undefined) return; // cancelled
    reviewLineMutation.mutate({ id, index, decision: "rejected", reason: reason || undefined });
  };

  // Received cash amount, spent, returned, and the resulting variance — recomputed
  // live in the dialog so the person accounting always sees whether it balances.
  // Accounts against the amount actually RELEASED (the extra the admin decided).
  const liqReceived = liquidating ? Number(liquidating.releasedAmount ?? liquidating.amount ?? 0) : 0;
  const liqSpent = liqRowsTotal(liqRows);
  const liqReturnedNum = parseFloat(liqReturned) || 0;
  const liqOverspend = Math.max(0, liqSpent - liqReceived);
  const liqUnaccounted = Math.max(0, liqReceived - liqSpent - liqReturnedNum);

  const openLiquidate = (req: any) => {
    setViewingRequest(null);
    setLiquidating(req);
    const liq = req.liquidation;
    if (liq?.items?.length) {
      setLiqRows(liq.items.map((it: any) => ({
        purposeOptionId: String(it.purposeOptionId ?? ""),
        description: it.description ?? "",
        payee: it.payee ?? "",
        spentDate: it.spentDate ? new Date(it.spentDate).toISOString().slice(0, 10) : "",
        amount: String(it.amount ?? ""),
      })));
      setLiqReturned(liq.amountReturned != null && Number(liq.amountReturned) > 0 ? String(liq.amountReturned) : "");
      setLiqNotes(liq.notes ?? "");
    } else {
      // Seed one row per requested purpose to make accounting quick.
      const seeded = itemsOf(req).map((it: any) => ({ purposeOptionId: String(it.purposeOptionId ?? ""), description: it.purposeLabel ?? "", payee: "", spentDate: "", amount: "" }));
      setLiqRows(seeded.length ? seeded : [emptyLiqRow()]);
      setLiqReturned("");
      setLiqNotes("");
    }
  };
  const handleLiquidateSubmit = () => {
    const items = buildLiqItems(liqRows);
    if (items.length === 0) { toast.error("Add at least one expense with a description and amount"); return; }
    submitLiqMutation.mutate({ id: liquidating.id, items, amountReturned: liqReturned ? liqReturnedNum : undefined, notes: liqNotes || undefined });
  };
  const sendBackLiquidation = (req: any) => {
    const reason = window.prompt("Reason for sending this liquidation back (optional):");
    if (reason === null) return; // cancelled
    rejectLiqMutation.mutate({ id: req.id, reason: reason || undefined });
  };
  const reopenLiquidation = (req: any) => {
    const reason = window.prompt("Reopen this liquidation so the receiver can add/adjust. Reason (optional):");
    if (reason === null) return; // cancelled
    reopenLiqMutation.mutate({ id: req.id, reason: reason || undefined });
  };
  // Whether the admin can reopen (there is a liquidation not already open, and nothing settled yet — the server enforces this too).
  const canReopen = (req: any) => isAdmin && req.liquidation && (req.liquidation.status === "submitted" || req.liquidation.status === "verified");
  // Whether a line has been reviewed yet (once it has, the receiver can't overwrite — admin must reopen).
  const reviewStartedOf = (req: any) => (req.liquidation?.items ?? []).some((it: any) => (it.status ?? "pending") !== "pending");

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

  // Second badge line describing how far along the money accounting is.
  const liqBadge = (req: any) => {
    const st = liqStateOf(req);
    if (st === "n/a") return null;
    if (st === "verified") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Liquidated</Badge>;
    if (st === "submitted") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Clock className="h-3 w-3 mr-1" />Liquidation submitted</Badge>;
    const returned = req?.liquidation?.status === "rejected";
    const days = req.receivedAt ? Math.floor((Date.now() - new Date(req.receivedAt).getTime()) / 86400000) : 0;
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
        <Clock className="h-3 w-3 mr-1" />{returned ? "Liquidation returned" : "Awaiting liquidation"}{!returned && days > 0 ? ` · ${days}d` : ""}
      </Badge>
    );
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <Card className={awaitingCount > 0 ? "bg-card border-amber-500/40" : "bg-card border-border"}>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Awaiting Liquidation</div>
            <div className={`text-2xl font-bold mt-1 ${awaitingCount > 0 ? "text-amber-400" : "text-foreground"}`}>{awaitingCount}</div>
            {awaitingCount > 0 && <div className="text-xs text-muted-foreground mt-0.5">{formatPHP(awaitingTotal)} to account for</div>}
          </CardContent>
        </Card>
      </div>

      {receiverBalances.length > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-sm font-medium text-foreground mb-2">Outstanding by receiver</div>
            <div className="flex flex-wrap gap-2">
              {receiverBalances.map((rb) => (
                <div key={rb.name} className="rounded-md border border-border px-3 py-1.5 text-sm">
                  <span className="text-foreground">{rb.name}</span>
                  {rb.owes > 0 && <span className="ml-2 text-amber-400">owes office {formatPHP(rb.owes)}</span>}
                  {rb.owed > 0 && <span className="ml-2 text-blue-400">office owes {formatPHP(rb.owed)}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search ID, requester, purpose, payee, amount, month…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-input border-border" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 bg-input border-border"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={liqFilter} onValueChange={setLiqFilter}>
          <SelectTrigger className="w-52 bg-input border-border"><SelectValue placeholder="Liquidation" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All liquidation</SelectItem>
            <SelectItem value="awaiting">Awaiting liquidation</SelectItem>
            <SelectItem value="submitted">Submitted (to review)</SelectItem>
            <SelectItem value="verified">Reviewed</SelectItem>
          </SelectContent>
        </Select>
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
                ) : displayedRequests?.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No cash requests found.</td></tr>
                ) : (
                  displayedRequests?.map((req: any) => {
                    // Any sub-admin (or admin) can confirm receipt — not just the requester.
                    const canMarkReceived = req.status === "approved" && !req.received && (isSubAdmin || isAdmin);
                    const editable = canEdit(req);
                    const deletable = canDelete(req);
                    const liqState = liqStateOf(req);
                    // The receiver can still edit/add while it's submitted and the admin hasn't started reviewing.
                    const canLiquidate = (isSubAdmin || isAdmin) && (liqState === "awaiting" || (liqState === "submitted" && !reviewStartedOf(req)));
                    const canReviewLiq = liqState === "submitted" && isAdmin;
                    const reopenable = canReopen(req);
                    const isDup = duplicateIds.has(req.id);
                    const hasActions = (req.status === "pending" && isAdmin) || canMarkReceived || editable || deletable || canLiquidate || canReviewLiq || reopenable;
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
                        <td className="p-4 text-sm font-medium tabular-nums text-foreground">
                          {formatPHP(req.amount)}
                          {req.accounting && Number(req.accounting.released) !== Number(req.amount) && (
                            <div className="text-[11px] text-blue-400">released {formatPHP(req.accounting.released)}</div>
                          )}
                          {req.accounting && (Number(req.accounting.toReturn) > 0 || Number(req.accounting.toCharge) > 0) && (
                            <div className="text-[11px] text-muted-foreground">
                              {Number(req.accounting.toReturn) > 0 && <span className="text-amber-400">return {formatPHP(req.accounting.toReturn)} </span>}
                              {Number(req.accounting.toCharge) > 0 && <span className="text-red-400">charge {formatPHP(req.accounting.toCharge)}</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{req.isOldRecord ? "Old" : "New"}</td>
                        <td className="p-4">
                          <div className="flex flex-col items-start gap-1">
                            {statusBadge(req.status, req.received)}
                            {liqBadge(req)}
                          </div>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{req.receivedByName || "-"}</td>
                        <td className="p-4 text-sm text-muted-foreground">{new Date(req.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          {/* Stop row-level view clicks from firing behind the action buttons */}
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {req.status === "pending" && isAdmin && (
                              <>
                                <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300" onClick={() => openApprove(req)} disabled={approveMutation.isPending} title="Approve & set amount to release">
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
                            {canLiquidate && (
                              <Button size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300" onClick={() => openLiquidate(req)}>
                                {liqState === "submitted" ? "Edit / Add Liquidation" : req.liquidation?.status === "rejected" ? "Fix Liquidation" : "Liquidate"}
                              </Button>
                            )}
                            {canReviewLiq && (
                              <Button size="sm" variant="ghost" className="text-primary" onClick={() => setReviewingId(req.id)}>
                                Review
                              </Button>
                            )}
                            {isAdmin && Number(req.accounting?.outstandingTotal) > 0 && (
                              <Button size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300" onClick={() => openSettle(req)}>
                                Settle
                              </Button>
                            )}
                            {reopenable && (
                              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => reopenLiquidation(req)} title="Reopen / send back so the receiver can add or adjust their liquidation">
                                Reopen
                              </Button>
                            )}
                            {req.accounting?.settled && liqStateOf(req) === "verified" && (
                              <span className="text-[10px] text-green-400" title="Reviewed and fully settled">settled ✓</span>
                            )}
                            {isDup && <span className="text-[10px] text-orange-400" title="Same requester, amount and purpose as another recent request">possible duplicate</span>}
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

      {/* Liquidation — account for received cash (spent + returned), submitted for admin verification. */}
      <Dialog open={!!liquidating} onOpenChange={(open) => { if (!open) setLiquidating(null); }}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Liquidate {liquidating?.id}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Account for the {formatPHP(liqReceived)} received: list what it was actually spent on, and enter any leftover cash you returned. An admin then verifies it.
              {liquidating?.liquidation?.status === "rejected" && liquidating?.liquidation?.rejectionReason && (
                <span className="mt-1 block text-red-400">Sent back: {liquidating.liquidation.rejectionReason}</span>
              )}
            </p>

            <LiquidationEditor rows={liqRows} setRows={setLiqRows} purposeOptions={purposeOptions} />

            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Cash returned (leftover)</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={liqReturned} onChange={(e) => setLiqReturned(e.target.value)} className="w-32 bg-input border-border" />
            </div>

            {/* Live reconciliation so the total always ties out. */}
            <div className="rounded-md border border-border p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Cash received</span><span className="tabular-nums text-foreground">{formatPHP(liqReceived)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total spent</span><span className="tabular-nums text-foreground">{formatPHP(liqSpent)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cash returned</span><span className="tabular-nums text-foreground">{formatPHP(liqReturnedNum)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-medium">
                {liqOverspend > 0 ? (
                  <><span className="text-red-400">Overspend (to reimburse)</span><span className="tabular-nums text-red-400">{formatPHP(liqOverspend)}</span></>
                ) : liqUnaccounted > 0 ? (
                  <><span className="text-amber-400">Unaccounted (still to explain)</span><span className="tabular-nums text-amber-400">{formatPHP(liqUnaccounted)}</span></>
                ) : (
                  <><span className="text-green-400">Balanced</span><span className="tabular-nums text-green-400">{formatPHP(0)}</span></>
                )}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={liqNotes} onChange={(e) => setLiqNotes(e.target.value)} className="bg-input border-border" placeholder="Anything the admin should know..." />
            </div>

            <Button className="w-full bg-primary text-primary-foreground" onClick={handleLiquidateSubmit} disabled={submitLiqMutation.isPending}>
              {submitLiqMutation.isPending ? "Submitting..." : "Submit for Verification"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve & decide the amount to actually release (may exceed requested) */}
      <Dialog open={!!approving} onOpenChange={(open) => { if (!open) setApproving(null); }}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Approve {approving?.id}</DialogTitle></DialogHeader>
          {approving && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Requested</span>
                <span className="font-medium text-foreground">{formatPHP(approving.amount)}</span>
              </div>
              <div>
                <Label>Amount to release *</Label>
                <Input type="number" min="0" step="0.01" value={releaseAmount} onChange={(e) => setReleaseAmount(e.target.value)} className="bg-input border-border" />
                <p className="text-xs text-muted-foreground mt-1">Defaults to the requested amount. Enter more if you're sending extra — this is what the receiver accounts for.</p>
              </div>
              {parseFloat(releaseAmount) > Number(approving.amount) && (
                <p className="text-xs text-amber-400">Releasing {formatPHP(parseFloat(releaseAmount) - Number(approving.amount))} extra over the requested amount.</p>
              )}
              <Button className="w-full bg-primary text-primary-foreground" onClick={handleApprove} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? "Approving..." : "Approve & Release"}
              </Button>
            </div>
          )}
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
              { label: "Requested", value: viewingRequest ? formatPHP(viewingRequest.amount) : undefined },
              { label: "Released", value: viewingRequest?.accounting ? formatPHP(viewingRequest.accounting.released) : undefined, hidden: !viewingRequest?.accounting || Number(viewingRequest.accounting.released) === Number(viewingRequest.amount) },
              { label: "Record", value: viewingRequest ? (viewingRequest.isOldRecord ? "Old" : "New") : undefined },
              { label: "Month", value: viewingRequest ? `${MONTH_NAMES[viewingRequest.month - 1]} ${viewingRequest.year}` : undefined },
              { label: "Submitted", value: viewingRequest ? new Date(viewingRequest.createdAt).toLocaleDateString() : undefined },
            ],
          },
          ...(viewingRequest?.accounting && viewingRequest.liquidation ? [{
            title: "Money Position",
            fields: [
              { label: "Released", value: formatPHP(viewingRequest.accounting.released) },
              { label: "Liquidated properly", value: formatPHP(viewingRequest.accounting.accepted) },
              { label: "To be returned to office", value: `${formatPHP(viewingRequest.accounting.outstandingReturn)}${Number(viewingRequest.accounting.settledReturn) > 0 ? ` (of ${formatPHP(viewingRequest.accounting.toReturn)}, ${formatPHP(viewingRequest.accounting.settledReturn)} returned)` : ""}`, hidden: !(Number(viewingRequest.accounting.toReturn) > 0) },
              { label: "To be charged to receiver", value: `${formatPHP(viewingRequest.accounting.outstandingCharge)}${Number(viewingRequest.accounting.settledCharge) > 0 ? ` (of ${formatPHP(viewingRequest.accounting.toCharge)}, ${formatPHP(viewingRequest.accounting.settledCharge)} repaid)` : ""}`, hidden: !(Number(viewingRequest.accounting.toCharge) > 0) },
              { label: "Office to reimburse receiver", value: `${formatPHP(viewingRequest.accounting.outstandingReimburse)}${Number(viewingRequest.accounting.settledReimburse) > 0 ? ` (of ${formatPHP(viewingRequest.accounting.reimburse)}, ${formatPHP(viewingRequest.accounting.settledReimburse)} paid)` : ""}`, hidden: !(Number(viewingRequest.accounting.reimburse) > 0) },
              { label: "Outstanding balance", value: Number(viewingRequest.accounting.outstandingTotal) > 0 ? formatPHP(viewingRequest.accounting.outstandingTotal) : (viewingRequest.accounting.settled ? "Settled ✓" : formatPHP(0)) },
              { label: "Lines still to review", value: String(viewingRequest.accounting.pendingLines), hidden: !(viewingRequest.accounting.pendingLines > 0) },
              { label: "Settlements", full: true, hidden: !(viewingRequest.settlements?.length), value: (viewingRequest.settlements ?? []).map((s: any) => `${settleTypeLabel[s.type] ?? s.type}: ${formatPHP(s.amount)}${s.date ? ` (${new Date(s.date).toLocaleDateString()})` : ""}`).join("   |   ") },
            ],
          }] : []),
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
          ...(viewingRequest?.liquidation ? [{
            title: "Liquidation",
            fields: [
              { label: "Status", value: viewingRequest.liquidation.status === "verified" ? "Reviewed ✓" : viewingRequest.liquidation.status === "rejected" ? "Sent back for correction" : "Submitted — awaiting review" },
              { label: "Total Spent", value: formatPHP(viewingRequest.liquidation.totalSpent) },
              { label: "Cash Returned", value: formatPHP(viewingRequest.liquidation.amountReturned) },
              { label: "Expenses (per line)", full: true, value: (viewingRequest.liquidation.items || []).map((it: any) => `${(it.status ?? "pending") === "accepted" ? "✓" : (it.status ?? "pending") === "rejected" ? "✗" : "•"} ${it.description}${it.payee ? ` — ${it.payee}` : ""} · ${formatPHP(it.amount)}${it.status === "rejected" && it.rejectionReason ? ` (rejected: ${it.rejectionReason})` : ""}`).join("   |   ") },
              { label: "Submitted By", value: viewingRequest.liquidation.submittedByName },
              { label: "Verified By", value: viewingRequest.liquidation.verifiedByName, hidden: viewingRequest.liquidation.status !== "verified" },
              { label: "Sent back", value: viewingRequest.liquidation.rejectionReason, full: true, hidden: viewingRequest.liquidation.status !== "rejected" || !viewingRequest.liquidation.rejectionReason },
            ],
          }] : []),
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingRequest?.notes, full: true }],
          },
        ]}
        footerLeft={viewingRequest ? (() => {
          const vr = viewingRequest;
          const st = liqStateOf(vr);
          const canLiq = (isSubAdmin || isAdmin) && (st === "awaiting" || (st === "submitted" && !reviewStartedOf(vr)));
          return (
            <div className="flex flex-wrap gap-2">
              {vr.status === "pending" && isAdmin && (
                <>
                  <Button size="sm" variant="outline" className="border-border text-green-400 hover:text-green-300" onClick={() => openApprove(vr)} disabled={approveMutation.isPending}>
                    <Check className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="border-border text-red-400 hover:text-red-300" onClick={() => rejectMutation.mutate({ id: vr.id })} disabled={rejectMutation.isPending}>
                    <X className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </>
              )}
              {canLiq && (
                <Button size="sm" variant="outline" className="border-border text-amber-400 hover:text-amber-300" onClick={() => openLiquidate(vr)}>
                  {st === "submitted" ? "Edit / Add Liquidation" : vr.liquidation?.status === "rejected" ? "Fix Liquidation" : "Liquidate"}
                </Button>
              )}
              {st === "submitted" && isAdmin && (
                <Button size="sm" variant="outline" className="border-border text-primary" onClick={() => { setReviewingId(vr.id); setViewingRequest(null); }}>
                  <Check className="h-4 w-4 mr-2" /> Review Liquidation
                </Button>
              )}
              {isAdmin && Number(vr.accounting?.outstandingTotal) > 0 && (
                <Button size="sm" variant="outline" className="border-border text-amber-400 hover:text-amber-300" onClick={() => { openSettle(vr); setViewingRequest(null); }}>
                  Settle Balance
                </Button>
              )}
              {canReopen(vr) && (
                <Button size="sm" variant="outline" className="border-border text-red-400 hover:text-red-300" onClick={() => reopenLiquidation(vr)} disabled={reopenLiqMutation.isPending}>
                  <X className="h-4 w-4 mr-2" /> Reopen for correction
                </Button>
              )}
            </div>
          );
        })() : undefined}
      />

      {/* Per-line liquidation review (admin): accept/reject each expense, live money position */}
      <Dialog open={!!reviewing} onOpenChange={(open) => { if (!open) setReviewingId(null); }}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Review Liquidation — {reviewing?.id}</DialogTitle></DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              {reviewing.accounting && (
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div className="rounded-md border border-border p-2"><div className="text-[11px] text-muted-foreground">Released</div><div className="font-bold text-foreground">{formatPHP(reviewing.accounting.released)}</div></div>
                  <div className="rounded-md border border-border p-2"><div className="text-[11px] text-muted-foreground">Liquidated properly</div><div className="font-bold text-green-400">{formatPHP(reviewing.accounting.accepted)}</div></div>
                  <div className="rounded-md border border-border p-2"><div className="text-[11px] text-muted-foreground">To be returned</div><div className="font-bold text-amber-400">{formatPHP(reviewing.accounting.toReturn)}</div></div>
                  <div className="rounded-md border border-border p-2"><div className="text-[11px] text-muted-foreground">To be charged</div><div className="font-bold text-red-400">{formatPHP(reviewing.accounting.toCharge)}</div></div>
                </div>
              )}
              {Number(reviewing.accounting?.reimburse) > 0 && (
                <p className="text-xs text-blue-400">Office to reimburse receiver: {formatPHP(reviewing.accounting.reimburse)} (accepted spend exceeded the cash released).</p>
              )}
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-2 font-medium">Expense</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                      <th className="text-center p-2 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviewing.liquidation?.items ?? []).map((it: any, idx: number) => {
                      const st = it.status ?? "pending";
                      return (
                        <tr key={idx} className="border-b border-border/50 last:border-0">
                          <td className="p-2 text-foreground">{it.description}{it.payee ? <span className="text-xs text-muted-foreground"> — {it.payee}</span> : null}{st === "rejected" && it.rejectionReason ? <div className="text-[11px] text-red-400">Rejected: {it.rejectionReason}</div> : null}</td>
                          <td className="p-2 text-right tabular-nums text-foreground">{formatPHP(it.amount)}</td>
                          <td className="p-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant={st === "accepted" ? "default" : "ghost"} className={st === "accepted" ? "bg-green-600 text-white h-7 px-2" : "text-green-400 h-7 px-2"} disabled={reviewLineMutation.isPending} onClick={() => reviewLineMutation.mutate({ id: reviewing.id, index: idx, decision: "accepted" })} title="Accept"><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant={st === "rejected" ? "default" : "ghost"} className={st === "rejected" ? "bg-red-600 text-white h-7 px-2" : "text-red-400 h-7 px-2"} disabled={reviewLineMutation.isPending} onClick={() => rejectLine(reviewing.id, idx)} title="Reject (charge to receiver)"><X className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => verifyLiqMutation.mutate({ id: reviewing.id })} disabled={verifyLiqMutation.isPending}><Check className="h-4 w-4 mr-1" /> Accept all remaining</Button>
                <Button size="sm" variant="outline" className="border-border text-red-400" onClick={() => sendBackLiquidation(reviewing)} disabled={rejectLiqMutation.isPending}><X className="h-4 w-4 mr-1" /> Send whole thing back</Button>
                <Button size="sm" variant="outline" className="border-border ml-auto" onClick={() => setReviewingId(null)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settlement — record returns / charge repayments / reimbursements that close the balance */}
      <Dialog open={!!settling} onOpenChange={(open) => { if (!open) setSettlingId(null); }}>
        <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Settle Balance — {settling?.id}</DialogTitle></DialogHeader>
          {settling && settling.accounting && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md border border-border p-2"><div className="text-[11px] text-muted-foreground">To return</div><div className="font-bold text-amber-400">{formatPHP(settling.accounting.outstandingReturn)}</div></div>
                <div className="rounded-md border border-border p-2"><div className="text-[11px] text-muted-foreground">To charge</div><div className="font-bold text-red-400">{formatPHP(settling.accounting.outstandingCharge)}</div></div>
                <div className="rounded-md border border-border p-2"><div className="text-[11px] text-muted-foreground">To reimburse</div><div className="font-bold text-blue-400">{formatPHP(settling.accounting.outstandingReimburse)}</div></div>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <div>
                  <Label className="text-sm">What are you recording?</Label>
                  <Select value={settleType} onValueChange={(v) => onSettleTypeChange(v as any)}>
                    <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="return" disabled={settleOutstanding("return") <= 0}>Cash returned to office{settleOutstanding("return") > 0 ? ` (${formatPHP(settling.accounting.outstandingReturn)} left)` : " — nothing due"}</SelectItem>
                      <SelectItem value="charge" disabled={settleOutstanding("charge") <= 0}>Charge repaid by receiver{settleOutstanding("charge") > 0 ? ` (${formatPHP(settling.accounting.outstandingCharge)} left)` : " — nothing due"}</SelectItem>
                      <SelectItem value="reimburse" disabled={settleOutstanding("reimburse") <= 0}>Reimbursement paid by office{settleOutstanding("reimburse") > 0 ? ` (${formatPHP(settling.accounting.outstandingReimburse)} left)` : " — nothing due"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-sm">Amount</Label>
                    <Input type="number" min="0" step="0.01" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} className="bg-input border-border" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-sm">Date</Label>
                    <Input type="date" value={settleDate} onChange={(e) => setSettleDate(e.target.value)} className="bg-input border-border" />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Notes</Label>
                  <Input value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} className="bg-input border-border" placeholder="e.g. returned in cash, or deducted from salary" />
                </div>
                <Button className="w-full bg-primary text-primary-foreground" onClick={handleRecordSettle} disabled={recordSettlementMutation.isPending || settleOutstanding(settleType) <= 0}>
                  {recordSettlementMutation.isPending ? "Recording..." : "Record Settlement"}
                </Button>
              </div>

              {(settling.settlements?.length ?? 0) > 0 && (
                <div>
                  <Label className="text-sm">History</Label>
                  <div className="mt-1 space-y-1">
                    {(settling.settlements ?? []).map((s: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1 text-sm">
                        <span className="text-foreground">{settleTypeLabel[s.type] ?? s.type} — <span className="font-medium">{formatPHP(s.amount)}</span>{s.date ? <span className="text-xs text-muted-foreground"> · {new Date(s.date).toLocaleDateString()}</span> : null}{s.notes ? <span className="text-xs text-muted-foreground"> · {s.notes}</span> : null}</span>
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-400 h-6 px-1" title="Remove" onClick={() => removeSettlementMutation.mutate({ id: settling.id, index: idx })} disabled={removeSettlementMutation.isPending}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="border-border" onClick={() => setSettlingId(null)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
