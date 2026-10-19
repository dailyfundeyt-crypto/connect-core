import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@dailyfun/components/ui/dialog';
import { Button } from '@dailyfun/components/ui/button';
import { Input } from '@dailyfun/components/ui/input';
import { Label } from '@dailyfun/components/ui/label';
import { Copy, Download, Key } from 'lucide-react';
import { toast } from 'sonner';

interface PassphraseBackupDialogProps {
  passphrase: string;
  onClose: () => void;
}

export function PassphraseBackupDialog({ passphrase, onClose }: PassphraseBackupDialogProps) {
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(passphrase);
    toast.success('Passphrase kopiert');
  };

  const handleDownload = () => {
    const blob = new Blob(
      [
        `BACKUP-PASSPHRASE FÜR END-TO-END-VERSCHLÜSSELUNG\n\n` +
        `${passphrase}\n\n` +
        `WICHTIG: Bewahren Sie diese Passphrase sicher auf!\n` +
        `Sie benötigen sie, um Ihre Nachrichten auf neuen Geräten zu entschlüsseln.\n` +
        `Ohne diese Passphrase können Ihre alten Nachrichten nicht wiederhergestellt werden.`
      ],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'encryption-backup-passphrase.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Passphrase heruntergeladen');
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Key className="h-5 w-5 text-primary" />
            <DialogTitle>Backup-Passphrase</DialogTitle>
          </div>
          <DialogDescription>
            Speichern Sie diese Passphrase sicher! Sie benötigen sie, um Ihre verschlüsselten
            Nachrichten auf neuen Geräten wiederherzustellen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Ihre Backup-Passphrase</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={passphrase}
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ <strong>Wichtig:</strong> Ohne diese Passphrase können Sie Ihre Nachrichten auf
              neuen Geräten nicht entschlüsseln. Bewahren Sie sie an einem sicheren Ort auf.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="confirm"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="confirm" className="text-sm">
              Ich habe meine Passphrase gesichert
            </label>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            Herunterladen
          </Button>
          <Button
            onClick={onClose}
            disabled={!confirmed}
          >
            Fertig
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
