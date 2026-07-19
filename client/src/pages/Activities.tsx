import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Trash2 } from "lucide-react";
import DetailDialog from "@/components/DetailDialog";
import { useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";

const typeColors: Record<string, string> = {
  call: "bg-green-500/20 text-green-400 border-green-500/30",
  email: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  meeting: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  site_visit: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  follow_up: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  note: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function Activities() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingAct, setViewingAct] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: activities, isLoading } = trpc.activities.list.useQuery({ search });
  const createMutation = trpc.activities.create.useMutation({
    onSuccess: () => { toast.success("Activity logged"); setIsCreateOpen(false); utils.activities.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.activities.delete.useMutation({
    onSuccess: () => { toast.success("Activity deleted"); setViewingAct(null); utils.activities.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (act: any) => {
    if (await confirm("Delete this activity?")) deleteMutation.mutate({ id: act.id });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      type: fd.get("type") as string,
      subject: fd.get("subject") as string,
      description: (fd.get("description") as string) || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activities</h1>
          <p className="text-muted-foreground mt-1">Log calls, emails, meetings, and follow-ups.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Log Activity</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Log Activity</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Type *</Label>
                <select name="type" defaultValue="call" className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground">
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="site_visit">Site Visit</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <div><Label>Subject *</Label><Input name="subject" required className="bg-input border-border" /></div>
              <div><Label>Description</Label><Textarea name="description" className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>Log Activity</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by subject, description, date..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-input border-border" />
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Subject</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Description</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : activities?.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No activities logged yet.</td></tr>
                ) : (
                  activities?.map((act: any) => (
                    <tr
                      key={act.id}
                      onClick={() => setViewingAct(act)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4"><Badge variant="outline" className={typeColors[act.type]}>{act.type.replace("_", " ")}</Badge></td>
                      <td className="p-4 font-medium text-foreground">{act.subject}</td>
                      <td className="p-4 text-sm text-muted-foreground max-w-xs truncate">{act.description || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{new Date(act.createdAt).toLocaleDateString()}</td>
                      <td className="p-4">
                        {/* Stop row-level view clicks from firing behind the action buttons */}
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDelete(act)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        open={!!viewingAct}
        onOpenChange={(open) => !open && setViewingAct(null)}
        title={viewingAct?.subject || ""}
        headerRight={viewingAct ? <Badge variant="outline" className={typeColors[viewingAct.type]}>{viewingAct.type.replace("_", " ")}</Badge> : null}
        sections={[
          {
            title: "Activity Details",
            fields: [
              { label: "Subject", value: viewingAct?.subject },
              { label: "Contact", value: viewingAct?.contactName ?? (viewingAct?.contactId ? `#${viewingAct.contactId}` : undefined) },
              { label: "Opportunity", value: viewingAct?.opportunityName ?? (viewingAct?.opportunityId ? `#${viewingAct.opportunityId}` : undefined) },
              { label: "Lead", value: viewingAct?.leadName ?? (viewingAct?.leadId ? `#${viewingAct.leadId}` : undefined) },
              { label: "Scheduled At", value: viewingAct?.scheduledAt ? new Date(viewingAct.scheduledAt).toLocaleString() : undefined },
              { label: "Completed", value: viewingAct ? (viewingAct.completedAt ? new Date(viewingAct.completedAt).toLocaleString() : "No") : undefined },
              { label: "Date", value: viewingAct?.createdAt ? new Date(viewingAct.createdAt).toLocaleDateString() : undefined },
            ],
          },
          {
            title: "Description",
            fields: [{ label: "Description", value: viewingAct?.description, full: true }],
          },
        ]}
        onDelete={() => handleDelete(viewingAct)}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
