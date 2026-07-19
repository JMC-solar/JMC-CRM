import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Edit, Trash2 } from "lucide-react";
import { ReactNode } from "react";

/** A single label/value pair rendered inside a DetailDialog section. */
export type DetailField = {
  label: string;
  value: ReactNode;
  /** Span the full dialog width instead of a single grid column. */
  full?: boolean;
  /** Skip rendering entirely (rather than showing an empty placeholder). */
  hidden?: boolean;
};

export type DetailSection = {
  title?: string;
  fields: DetailField[];
};

type DetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Secondary line under the title — usually a record number or category. */
  subtitle?: ReactNode;
  /** Rendered top-right in the header, typically a status badge. */
  headerRight?: ReactNode;
  sections: DetailSection[];
  /** Extra content below the sections — line-item tables, attachments, history. */
  children?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  isDeleting?: boolean;
  /** Extra footer controls rendered left of Edit/Delete (e.g. approve/reject). */
  footerLeft?: ReactNode;
  className?: string;
};

/** Renders "—" for values that are absent or blank so rows stay aligned. */
function renderValue(value: ReactNode): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  return value;
}

/**
 * Read-only record detail modal with Edit/Delete actions pinned to the bottom.
 * Pair with a list page's Eye button so records can be inspected without
 * opening the edit form.
 */
export default function DetailDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  headerRight,
  sections,
  children,
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
  isDeleting = false,
  footerLeft,
  className = "max-w-2xl",
}: DetailDialogProps) {
  const hasFooter = Boolean(onEdit || onDelete || footerLeft);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${className} bg-card border-border max-h-[85vh] overflow-y-auto`}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-foreground break-words">{title}</DialogTitle>
              {subtitle ? (
                <DialogDescription className="mt-1">{subtitle}</DialogDescription>
              ) : null}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {sections.map((section, sectionIndex) => {
            const fields = section.fields.filter((field) => !field.hidden);
            if (fields.length === 0) return null;

            return (
              <div key={section.title ?? sectionIndex} className="space-y-3">
                {section.title ? (
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {section.title}
                  </h3>
                ) : null}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  {fields.map((field) => (
                    <div
                      key={field.label}
                      className={field.full ? "sm:col-span-2 min-w-0" : "min-w-0"}
                    >
                      <dt className="text-xs text-muted-foreground mb-1">{field.label}</dt>
                      <dd className="text-sm text-foreground break-words whitespace-pre-wrap">
                        {renderValue(field.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}

          {children}
        </div>

        {hasFooter && (
          <div className="flex items-center justify-between gap-2 pt-4 mt-2 border-t border-border">
            <div className="flex items-center gap-2">{footerLeft}</div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <Button variant="outline" onClick={onEdit} className="border-border">
                  <Edit className="h-4 w-4 mr-2" />
                  {editLabel}
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="outline"
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="border-border text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? "Deleting..." : deleteLabel}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
