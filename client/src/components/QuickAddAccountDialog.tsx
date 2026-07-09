import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Same create form/logic as the Accounts page, packaged so other flows (e.g. Stock
// Transactions) can add an account inline and receive the new {id, name} back.
export default function QuickAddAccountDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated: (account: { id: number; name: string }) => void;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.accounts.create.useMutation({
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    createMutation.mutate(
      {
        name,
        industry: (fd.get("industry") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        email: (fd.get("email") as string) || undefined,
        website: (fd.get("website") as string) || undefined,
        city: (fd.get("city") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      },
      {
        onSuccess: (res) => {
          toast.success("Account created");
          utils.accounts.list.invalidate();
          utils.accounts.listAll.invalidate();
          onCreated({ id: res.id, name });
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Create Account</DialogTitle></DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div><Label>Name *</Label><Input name="name" required defaultValue={defaultName || ""} className="bg-input border-border" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Industry</Label><Input name="industry" className="bg-input border-border" /></div>
            <div><Label>Phone</Label><Input name="phone" className="bg-input border-border" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Email</Label><Input name="email" type="email" className="bg-input border-border" /></div>
            <div><Label>Website</Label><Input name="website" className="bg-input border-border" /></div>
          </div>
          <div><Label>City</Label><Input name="city" className="bg-input border-border" /></div>
          <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" /></div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
