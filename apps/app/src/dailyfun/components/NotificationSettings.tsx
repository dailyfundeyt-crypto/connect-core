import React from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@dailyfun/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@dailyfun/components/ui/card';
import { usePushNotifications } from '@dailyfun/hooks/usePushNotifications';
import { useAuth } from '@dailyfun/contexts/AuthContext';

export const NotificationSettings: React.FC = () => {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications();

  if (!user) {
    return null;
  }

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Push-Benachrichtigungen
          </CardTitle>
          <CardDescription>
            Dein Browser unterstützt leider keine Push-Benachrichtigungen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push-Benachrichtigungen
        </CardTitle>
        <CardDescription>
          Erhalte Benachrichtigungen über neue Nachrichten und geteilte Artikel direkt auf dein Gerät.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {isSubscribed ? 'Aktiviert' : 'Deaktiviert'}
            </p>
            <p className="text-xs text-muted-foreground">
              {permission === 'granted' && 'Benachrichtigungen sind erlaubt'}
              {permission === 'denied' && 'Benachrichtigungen wurden blockiert'}
              {permission === 'default' && 'Noch keine Berechtigung erteilt'}
            </p>
          </div>
          {isSubscribed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={unsubscribe}
              className="gap-2"
            >
              <BellOff className="h-4 w-4" />
              Deaktivieren
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={subscribe}
              disabled={permission === 'denied'}
              className="gap-2"
            >
              <Bell className="h-4 w-4" />
              Aktivieren
            </Button>
          )}
        </div>

        {permission === 'denied' && (
          <div className="rounded-md bg-destructive/10 p-3">
            <p className="text-xs text-destructive">
              Benachrichtigungen wurden blockiert. Bitte erlaube Benachrichtigungen in den Browser-Einstellungen.
            </p>
          </div>
        )}

        <div className="rounded-md bg-muted p-3 space-y-2">
          <p className="text-xs font-medium">Was wird benachrichtigt?</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Neue private Nachrichten</li>
            <li>Geteilte Artikel</li>
            <li>Bilder und PDF-Dateien</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
