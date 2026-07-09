import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Same create form/logic as the Contacts page, packaged so other flows (e.g. Stock
// Transactions) can add a contact inline and receive the new {id, name} back.
export default function QuickAddContactDialog({
  open,
  onOpenChange,
  defaultFirstName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFirstName?: string;
  onCreated: (contact: { id: number; name: string }) => void;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.contacts.create.useMutation({
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const firstName = fd.get("firstName") as string;
    const lastName = (fd.get("lastName") as string) || "";
    createMutation.mutate(
      {
        firstName,
        lastName: lastName || undefined,
        email: (fd.get("email") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        company: (fd.get("company") as string) || undefined,
        position: (fd.get("position") as string) || undefined,
        address: (fd.get("address") as string) || undefined,
        city: (fd.get("city") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      },
      {
        onSuccess: (res) => {
          toast.success("Contact created");
          utils.contacts.list.invalidate();
          onCreated({ id: res.id, name: `${firstName}${lastName ? ` ${lastName}` : ""}` });
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Create Contact</DialogTitle></DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>First Name *</Label><Input name="firstName" required defaultValue={defaultFirstName || ""} className="bg-input border-border" /></div>
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
  );
}
