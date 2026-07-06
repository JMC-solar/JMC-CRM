import * as React from "react";
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
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type Request = {
  message: string;
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
};

// Module-level bridge so any code can call confirm() without wiring a hook
// through every component. <ConfirmRoot/> registers the setter on mount.
let notify: ((request: Request | null) => void) | null = null;

/**
 * Promise-based replacement for the native window.confirm().
 * Renders a themed Radix AlertDialog instead of a blocking browser dialog.
 * Usage: if (await confirm("Delete this lead?")) { ... }
 */
export function confirm(
  message: string,
  opts: ConfirmOptions = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!notify) {
      // Fallback if the root isn't mounted yet (shouldn't happen in-app).
      resolve(window.confirm(message));
      return;
    }
    notify({ message, opts, resolve });
  });
}

export function ConfirmRoot() {
  const [request, setRequest] = React.useState<Request | null>(null);

  React.useEffect(() => {
    notify = setRequest;
    return () => {
      notify = null;
    };
  }, []);

  const close = (result: boolean) => {
    request?.resolve(result);
    setRequest(null);
  };

  const destructive = request?.opts.destructive ?? true;

  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {request?.opts.title ?? request?.message ?? "Are you sure?"}
          </AlertDialogTitle>
          {request?.opts.description ? (
            <AlertDialogDescription>
              {request.opts.description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {request?.opts.cancelText ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              destructive &&
                buttonVariants({ variant: "destructive" })
            )}
            onClick={() => close(true)}
          >
            {request?.opts.confirmText ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
