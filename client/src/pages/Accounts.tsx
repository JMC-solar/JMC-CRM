import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import DetailDialog from "@/components/DetailDialog";
import { useState } from "react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";

export default function Accounts() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [viewingAccount, setViewingAccount] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: accounts, isLoading } = trpc.accounts.list.useQuery({ search });
  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: () => { toast.success("Account created"); setIsCreateOpen(false); utils.accounts.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.accounts.update.useMutation({
    onSuccess: () => { toast.success("Account updated"); setEditingAccount(null); utils.accounts.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.accounts.delete.useMutation({
    onSuccess: () => { toast.success("Account deleted"); setViewingAccount(null); utils.accounts.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (account: any) => {
    if (await confirm("Delete this account?")) deleteMutation.mutate({ id: account.id });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name") as string,
      industry: (fd.get("industry") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      website: (fd.get("website") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      city: (fd.get("city") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingAccount.id,
      name: fd.get("name") as string,
      industry: (fd.get("industry") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      website: (fd.get("website") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      city: (fd.get("city") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage organizations and business accounts.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Add Account</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Create Account</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Name *</Label><Input name="name" required className="bg-input border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Industry</Label><Input name="industry" className="bg-input border-border" /></div>
                <div><Label>Phone</Label><Input name="phone" className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input name="email" type="email" className="bg-input border-border" /></div>
                <div><Label>Website</Label><Input name="website" className="bg-input border-border" /></div>
              </div>
              <div><Label>Address</Label><Input name="address" className="bg-input border-border" /></div>
              <div><Label>City</Label><Input name="city" className="bg-input border-border" /></div>
              <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>Create Account</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email, industry, phone, city..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-input border-border" />
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Industry</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Phone</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">City</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : accounts?.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No accounts found.</td></tr>
                ) : (
                  accounts?.map((account: any) => (
                    <tr
                      key={account.id}
                      onClick={() => setViewingAccount(account)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4 font-medium text-foreground">{account.name}</td>
                      <td className="p-4 text-sm text-muted-foreground">{account.industry || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{account.email || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{account.phone || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{account.city || "-"}</td>
                      <td className="p-4">
                        {/* Stop row-level view clicks from firing behind the action buttons */}
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditingAccount(account)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDelete(account)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        open={!!viewingAccount}
        onOpenChange={(open) => !open && setViewingAccount(null)}
        title={viewingAccount?.name}
        subtitle={viewingAccount?.industry || undefined}
        sections={[
          {
            title: "Account Details",
            fields: [
              { label: "Name", value: viewingAccount?.name },
              { label: "Industry", value: viewingAccount?.industry },
              { label: "Phone", value: viewingAccount?.phone },
              { label: "Email", value: viewingAccount?.email },
              { label: "Website", value: viewingAccount?.website },
              { label: "Address", value: viewingAccount?.address, full: true },
              { label: "City", value: viewingAccount?.city },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingAccount?.notes, full: true }],
          },
        ]}
        onEdit={() => {
          const account = viewingAccount;
          setViewingAccount(null);
          setEditingAccount(account);
        }}
        onDelete={() => handleDelete(viewingAccount)}
        isDeleting={deleteMutation.isPending}
      />

      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Edit Account</DialogTitle></DialogHeader>
          {editingAccount && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div><Label>Name *</Label><Input name="name" defaultValue={editingAccount.name} required className="bg-input border-border" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Industry</Label><Input name="industry" defaultValue={editingAccount.industry || ""} className="bg-input border-border" /></div>
                <div><Label>Phone</Label><Input name="phone" defaultValue={editingAccount.phone || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input name="email" type="email" defaultValue={editingAccount.email || ""} className="bg-input border-border" /></div>
                <div><Label>Website</Label><Input name="website" defaultValue={editingAccount.website || ""} className="bg-input border-border" /></div>
              </div>
              <div><Label>Address</Label><Input name="address" defaultValue={editingAccount.address || ""} className="bg-input border-border" /></div>
              <div><Label>City</Label><Input name="city" defaultValue={editingAccount.city || ""} className="bg-input border-border" /></div>
              <div><Label>Notes</Label><Textarea name="notes" defaultValue={editingAccount.notes || ""} className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>Update Account</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
