import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function ConfirmButton({ onConfirm, title, description, children, confirmLabel = "Confirm", ...props }: ButtonProps & { onConfirm: () => unknown; title: string; description?: string; confirmLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>{children}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title} description={description}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={props.variant === "destructive" ? "destructive" : "default"} onClick={async () => { await onConfirm(); setOpen(false); }}>{confirmLabel}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const num = (v: string) => (v === "" ? null : Number(v));
