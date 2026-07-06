import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, FileText, Search, Edit, Trash2, Printer, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { confirm } from "@/lib/confirm";

const STATUS_COLORS: Record<string, string> = {
  draft: "border-gray-500/50 text-gray-400",
  sent: "border-blue-500/50 text-blue-400",
  accepted: "border-green-500/50 text-green-400",
  rejected: "border-red-500/50 text-red-400",
};

function formatPHP(val: string | number | null | undefined) {
  if (!val) return "—";
  return `₱${Number(val).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

export default function SpecialQuotations() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.specialQuotations.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    limit: 20,
  });

  const { data: templates } = trpc.specialQuotationTemplates.list.useQuery();

  const deleteMutation = trpc.specialQuotations.delete.useMutation({
    onSuccess: () => {
      toast.success("Quotation deleted");
      utils.specialQuotations.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const items = data?.items || [];
  const totalPages = data?.totalPages || 0;
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Special Quotations</h1>
          <p className="text-muted-foreground">Create and manage special quotations from templates.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => navigate("/special-quotation-templates")} className="border-border">
              <Settings className="h-4 w-4 mr-1" /> Templates
            </Button>
          )}
          {templates && templates.length > 0 ? (
            <Select onValueChange={(val) => navigate(`/special-quotations/new?templateId=${val}`)}>
              <SelectTrigger className="w-[200px] bg-primary text-primary-foreground border-primary">
                <Plus className="h-4 w-4 mr-1" />
                <span>New from Template</span>
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Button onClick={() => navigate("/special-quotations/new")} className="bg-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-2" /> New Quotation
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by customer, quotation#, system, kW, date..." className="pl-9 bg-input border-border" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] bg-input border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading quotations...</p>
      ) : !items.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No special quotations found.</p>
            <p className="text-sm text-muted-foreground mt-1">Create one from a template to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-3 px-3">Quotation #</th>
                <th className="text-left py-3 px-3">Customer</th>
                <th className="text-left py-3 px-3">System</th>
                <th className="text-right py-3 px-3">Total</th>
                <th className="text-left py-3 px-3">Date</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="text-right py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q: any) => (
                <tr key={q.id} className="border-b border-border/30 hover:bg-muted/10">
                  <td className="py-3 px-3 font-mono text-xs text-foreground">{q.quotationNumber}</td>
                  <td className="py-3 px-3 text-foreground">{q.customerName || "—"}</td>
                  <td className="py-3 px-3 text-foreground">
                    <div className="max-w-[200px] truncate">{q.systemTitle || "—"}</div>
                    {q.kwRating && <span className="text-xs text-muted-foreground">{q.kwRating} kW</span>}
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-green-400">{formatPHP(q.total)}</td>
                  <td className="py-3 px-3 text-foreground">{q.date ? new Date(q.date).toLocaleDateString() : "—"}</td>
                  <td className="py-3 px-3">
                    <Badge variant="outline" className={STATUS_COLORS[q.status] || ""}>{q.status}</Badge>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/special-quotations/${q.id}`)} className="text-blue-400 hover:text-blue-300 h-7 px-2">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => window.open(`/api/special-quotations/${q.id}/print`, '_blank')} className="text-green-400 hover:text-green-300 h-7 px-2">
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={async () => { if (await confirm("Delete this quotation?")) deleteMutation.mutate({ id: q.id }); }} className="text-red-400 hover:text-red-300 h-7 px-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="border-border">Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="border-border">Next</Button>
        </div>
      )}
    </div>
  );
}
