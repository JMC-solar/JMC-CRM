import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import ExportButtons from "@/components/ExportButtons";
import DetailDialog from "@/components/DetailDialog";
import { useState } from "react";
import { toast } from "sonner";
import PaginationControls from "@/components/PaginationControls";
import { confirm } from "@/lib/confirm";

export default function Contacts() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "subadmin";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [viewingContact, setViewingContact] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.contacts.list.useQuery({ search, page, limit: 20 });
  const contacts = data?.items;

  // Clamp page if it exceeds totalPages after data changes
  if (data && data.totalPages > 0 && page > data.totalPages) {
    setPage(data.totalPages);
  }
  const createMutation = trpc.contacts.create.useMutation({
    onSuccess: () => { toast.success("Contact created"); setIsCreateOpen(false); utils.contacts.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.contacts.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); setEditingContact(null); utils.contacts.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => { toast.success("Contact deleted"); setViewingContact(null); utils.contacts.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async (contact: any) => {
    if (await confirm("Delete this contact?")) deleteMutation.mutate({ id: contact.id });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
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
      position: (fd.get("position") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      city: (fd.get("city") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingContact.id,
      firstName: fd.get("firstName") as string,
      lastName: (fd.get("lastName") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      company: (fd.get("company") as string) || undefined,
      position: (fd.get("position") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      city: (fd.get("city") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-muted-foreground mt-1">Manage your customer contacts.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons module="contacts" params={{ search: search || undefined }} />
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" /> Add Contact</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Create Contact</DialogTitle></DialogHeader>
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
                <div><Label>Position</Label><Input name="position" className="bg-input border-border" /></div>
              </div>
              <div><Label>Address</Label><Input name="address" className="bg-input border-border" /></div>
              <div><Label>City</Label><Input name="city" className="bg-input border-border" /></div>
              <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Contact"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email, company, phone, city..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 bg-input border-border" />
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Phone</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Company</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">City</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : !contacts || contacts.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No contacts found.</td></tr>
                ) : (
                  contacts.map((contact: any) => (
                    <tr
                      key={contact.id}
                      onClick={() => setViewingContact(contact)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4 font-medium text-foreground">{contact.firstName} {contact.lastName}</td>
                      <td className="p-4 text-sm text-muted-foreground">{contact.email || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{contact.phone || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{contact.company || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{contact.city || "-"}</td>
                      <td className="p-4">
                        {/* Stop row-level view clicks from firing behind the action buttons */}
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditingContact(contact)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDelete(contact)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </>
                          )}
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
        open={!!viewingContact}
        onOpenChange={(open) => !open && setViewingContact(null)}
        title={viewingContact ? `${viewingContact.firstName} ${viewingContact.lastName || ""}`.trim() : ""}
        subtitle={viewingContact?.position || viewingContact?.company || undefined}
        sections={[
          {
            title: "Contact Details",
            fields: [
              { label: "First Name", value: viewingContact?.firstName },
              { label: "Last Name", value: viewingContact?.lastName },
              { label: "Email", value: viewingContact?.email },
              { label: "Phone", value: viewingContact?.phone },
              { label: "Company", value: viewingContact?.company },
              { label: "Position", value: viewingContact?.position },
              { label: "Address", value: viewingContact?.address, full: true },
              { label: "City", value: viewingContact?.city },
            ],
          },
          {
            title: "Notes",
            fields: [{ label: "Notes", value: viewingContact?.notes, full: true }],
          },
        ]}
        onEdit={canEdit ? () => {
          const contact = viewingContact;
          setViewingContact(null);
          setEditingContact(contact);
        } : undefined}
        onDelete={canEdit ? () => handleDelete(viewingContact) : undefined}
        isDeleting={deleteMutation.isPending}
      />

      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Edit Contact</DialogTitle></DialogHeader>
          {editingContact && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>First Name *</Label><Input name="firstName" defaultValue={editingContact.firstName} required className="bg-input border-border" /></div>
                <div><Label>Last Name</Label><Input name="lastName" defaultValue={editingContact.lastName || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input name="email" type="email" defaultValue={editingContact.email || ""} className="bg-input border-border" /></div>
                <div><Label>Phone</Label><Input name="phone" defaultValue={editingContact.phone || ""} className="bg-input border-border" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Company</Label><Input name="company" defaultValue={editingContact.company || ""} className="bg-input border-border" /></div>
                <div><Label>Position</Label><Input name="position" defaultValue={editingContact.position || ""} className="bg-input border-border" /></div>
              </div>
              <div><Label>Address</Label><Input name="address" defaultValue={editingContact.address || ""} className="bg-input border-border" /></div>
              <div><Label>City</Label><Input name="city" defaultValue={editingContact.city || ""} className="bg-input border-border" /></div>
              <div><Label>Notes</Label><Textarea name="notes" defaultValue={editingContact.notes || ""} className="bg-input border-border" /></div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Updating..." : "Update Contact"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
