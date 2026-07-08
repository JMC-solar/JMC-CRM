import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export interface ContactOption {
  id: number;
  firstName: string;
  lastName?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
}

export function contactFullName(c: Pick<ContactOption, "firstName" | "lastName">): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

interface ContactComboboxProps {
  /** Currently selected contact, or null when nothing is picked. */
  value: ContactOption | null;
  onChange: (contact: ContactOption | null) => void;
  placeholder?: string;
  /**
   * Shown when nothing is selected — for legacy records that carry a free-text
   * customer name but no linked contact. Distinguishes "unlinked name on file"
   * from "nothing set at all".
   */
  fallbackLabel?: string | null;
  className?: string;
}

/**
 * Searchable contact picker with an inline "Add new contact" escape hatch.
 *
 * Loads contacts eagerly (page 1, limit 500) and lets cmdk filter client-side,
 * matching the supplier combobox in PurchaseOrderCreate. When the user creates
 * a contact from the footer item, the newly created record is selected
 * immediately using the id returned by contacts.create.
 */
export default function ContactCombobox({ value, onChange, placeholder = "Search and select contact...", fallbackLabel, className }: ContactComboboxProps) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data } = trpc.contacts.list.useQuery({ search: "", page: 1, limit: 500 });
  // contacts.list flows through fsListPaginated, which is typed as Record<string, unknown>[].
  const contacts = (data?.items ?? []) as unknown as ContactOption[];

  const createMutation = trpc.contacts.create.useMutation({
    onSuccess: (result, variables) => {
      toast.success("Contact created");
      utils.contacts.list.invalidate();
      setAddOpen(false);
      onChange({
        id: result.id,
        firstName: variables.firstName,
        lastName: variables.lastName ?? null,
        company: variables.company ?? null,
        address: variables.address ?? null,
        city: variables.city ?? null,
      });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Radix portals this dialog out of the DOM, but React synthetic events still
    // bubble along the React tree — without this the submit reaches the enclosing
    // form (e.g. Create Project) and fires its mutation with empty fields.
    e.stopPropagation();
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

  const openAddDialog = () => {
    // Close the popover first — a Radix dialog opening from inside an open
    // popover fights over focus and pointer-events.
    setOpen(false);
    setAddOpen(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between bg-input border-border text-foreground font-normal", className)}
          >
            {value ? (
              <span>
                {contactFullName(value)}
                {value.company ? <span className="ml-2 text-xs text-muted-foreground">{value.company}</span> : null}
              </span>
            ) : fallbackLabel ? (
              <span>
                {fallbackLabel}
                <span className="ml-2 text-xs text-muted-foreground">(not linked)</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-card border-border" align="start">
          <Command className="bg-card">
            <CommandInput placeholder="Type to search contacts..." className="text-foreground" />
            <CommandList>
              <CommandEmpty className="text-muted-foreground p-4 text-sm">No contacts found.</CommandEmpty>
              <CommandGroup>
                {contacts.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${contactFullName(c)} ${c.company || ""} ${c.city || ""}`}
                    onSelect={() => { onChange(c); setOpen(false); }}
                    className="text-foreground"
                  >
                    <Check className={cn("mr-2 h-4 w-4", value?.id === c.id ? "opacity-100" : "opacity-0")} />
                    <span>{contactFullName(c)}</span>
                    {c.company && <span className="ml-2 text-xs text-muted-foreground">{c.company}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {/* Pinned outside CommandList so it stays visible without scrolling the contact list. */}
          <div className="border-t border-border p-1">
            <Button type="button" variant="ghost" onClick={openAddDialog} className="w-full justify-start text-primary hover:text-primary">
              <UserPlus className="mr-2 h-4 w-4" />
              Add new customer contact
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-foreground">Add Customer Contact</DialogTitle></DialogHeader>
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
            <div><Label>Notes</Label><Textarea name="notes" className="bg-input border-border" rows={2} /></div>
            <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Contact"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
