import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ShareButton({ path, title, label = "Share", variant = "outline" }: { path: string; title: string; label?: string; variant?: "outline" | "ghost" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const url = new URL(path, window.location.origin).toString();
  return (
    <>
      <Button variant={variant} size="sm" onClick={async () => {
        if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
          try {
            await navigator.share({ title, url });
            return;
          } catch {
            /* cancelled -> show QR */
          }
        }
        setOpen(true);
      }} aria-label={`Share ${title}`}>
        <Share2 /> <span className="hidden sm:inline">{label}</span>
      </Button>
      <QrDialog open={open} onOpenChange={setOpen} url={url} title={title} />
    </>
  );
}

export function QrDialog({ open, onOpenChange, url, title, description }: { open: boolean; onOpenChange: (o: boolean) => void; url: string; title: string; description?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description ?? "Scan to open on another device."}>
        <div className="mx-auto rounded-xl bg-white p-4">
          <QRCodeSVG value={url} size={240} level="M" />
        </div>
        <div className="flex gap-2">
          <input readOnly value={url} className="h-12 min-w-0 flex-1 rounded-lg border bg-muted px-3 text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
          <Button onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}><Copy /> Copy</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
