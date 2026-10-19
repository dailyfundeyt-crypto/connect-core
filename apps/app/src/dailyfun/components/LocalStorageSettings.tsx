import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { FolderOpen, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { selectStorageDirectory, hasDirectoryAccess } from '@dailyfun/utils/fileSystemStorage';

export const LocalStorageSettings: React.FC = () => {
  const [hasAccess, setHasAccess] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const access = await hasDirectoryAccess();
      setHasAccess(access);
    } catch (error) {
      console.error('Error checking directory access:', error);
      setHasAccess(false);
    } finally {
      setChecking(false);
    }
  };

  const handleSelectDirectory = async () => {
    try {
      await selectStorageDirectory();
      setHasAccess(true);
      toast.success('Ordner erfolgreich ausgewählt!');
    } catch (error: any) {
      console.error('Error selecting directory:', error);
      toast.error(error.message || 'Fehler beim Auswählen des Ordners');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Lokaler Speicher für Chat-Bilder
        </CardTitle>
        <CardDescription>
          Wähle einen Ordner auf deinem PC, wo Chat-Bilder gespeichert werden sollen.
          Bilder werden temporär zu Supabase hochgeladen (nur zum Teilen) und nach 7 Tagen
          automatisch gelöscht. Deine lokale Kopie bleibt erhalten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!checking && (
          <>
            {hasAccess ? (
              <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
                <Check className="h-5 w-5 text-success" />
                <span className="text-sm text-success">
                  Ordner ausgewählt und zugänglich
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg">
                <AlertCircle className="h-5 w-5 text-warning" />
                <span className="text-sm text-warning">
                  Kein Ordner ausgewählt. Bilder werden nur temporär gespeichert.
                </span>
              </div>
            )}

            <Button 
              onClick={handleSelectDirectory}
              variant={hasAccess ? 'outline' : 'default'}
              className="w-full"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              {hasAccess ? 'Anderen Ordner wählen' : 'Ordner auswählen'}
            </Button>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>ℹ️ Es wird ein Unterordner "DailyFun-Chats" erstellt</p>
              <p>ℹ️ Diese Funktion benötigt Chrome, Edge oder einen anderen modernen Browser</p>
              <p>ℹ️ Bilder werden beim Senden und Empfangen automatisch gespeichert</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
