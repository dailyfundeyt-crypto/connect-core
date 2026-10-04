import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmWord: string;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [input, setInput] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setInput("");
    onOpenChange(next);
  };

  const handleConfirm = () => {
    if (input !== confirmWord) return;
    onConfirm();
    setInput("");
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-sm border-[#2a2a2a] bg-[#0b0b0b] text-white [&_[data-slot=dialog-title]]:text-red-400 [&_[data-slot=dialog-description]]:text-[#888]">
        <DialogHeader>
          <DialogTitle className="text-red-400">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[#888]">
            Zur Bestätigung{" "}
            <code className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-xs text-white">
              {confirmWord}
            </code>{" "}
            eingeben:
          </p>
          <Input
            autoComplete="off"
            className="h-10 rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-white placeholder:text-[#555]"
            onChange={(e) => setInput(e.target.value)}
            placeholder={confirmWord}
            value={input}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => handleOpenChange(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Abbrechen
          </Button>
          <Button
            disabled={input !== confirmWord}
            onClick={handleConfirm}
            size="sm"
            type="button"
            variant="destructive"
          >
            {title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
