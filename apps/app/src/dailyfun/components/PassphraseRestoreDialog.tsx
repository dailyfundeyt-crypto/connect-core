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
import { KeyRound, Loader2 } from 'lucide-react';

interface PassphraseRestoreDialogProps {
  onRestore: (passphrase: string) => Promise<boolean>;
}

export function PassphraseRestoreDialog({ onRestore }: PassphraseRestoreDialogProps) {
  const [passphrase, setPassphrase] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    if (!passphrase.trim()) return;

    setIsRestoring(true);
    const success = await onRestore(passphrase);
    setIsRestoring(false);

    if (success) {
      setPassphrase('');
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <DialogTitle>Verschlüsselung wiederherstellen</DialogTitle>
          </div>
          <DialogDescription>
            Sie haben ein verschlüsseltes Backup Ihrer Nachrichten. Bitte geben Sie Ihre
            Backup-Passphrase ein, um Ihre Nachrichten zu entschlüsseln.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="passphrase">Backup-Passphrase</Label>
            <Input
              id="passphrase"
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="z.B. Apfel-Baum-Sonne-Mond-Stern-Wasser"
              className="font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRestore();
              }}
              autoFocus
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 Ihre Passphrase besteht aus 6 Wörtern, getrennt durch Bindestriche.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleRestore}
            disabled={!passphrase.trim() || isRestoring}
            className="w-full"
          >
            {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Wiederherstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
