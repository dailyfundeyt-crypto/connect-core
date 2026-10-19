import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { toast } from 'sonner';

// VAPID public key - you'll need to generate this
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDpKexSr0VJQ6p7wQ5WOr0t3kUhLs9JqFg9pEfRjLqVU';

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    // Check if push notifications are supported
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, [user]);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const checkSubscription = async () => {
    if (!user) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await (registration as any).pushManager?.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  };

  const subscribe = async () => {
    if (!isSupported || !user) {
      toast.error('Push-Benachrichtigungen werden nicht unterstützt');
      return false;
    }

    try {
      // Request notification permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        toast.error('Benachrichtigungen wurden abgelehnt');
        return false;
      }

      // Register service worker
      const registration = await registerServiceWorker();

      // Subscribe to push notifications
      const subscription = await (registration as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Save subscription to database
      const subscriptionData = subscription.toJSON();
      const { error } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        subscription: subscriptionData as any,
      });

      if (error && !error.message.includes('duplicate')) {
        throw error;
      }

      setIsSubscribed(true);
      toast.success('Push-Benachrichtigungen aktiviert!');
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      toast.error('Fehler beim Aktivieren der Benachrichtigungen');
      return false;
    }
  };

  const unsubscribe = async () => {
    if (!user) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await (registration as any).pushManager?.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        const subscriptionData = subscription.toJSON();
        
        // Remove subscription from database
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('subscription', subscriptionData as any);

        if (error) throw error;
      }

      setIsSubscribed(false);
      toast.success('Push-Benachrichtigungen deaktiviert');
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      toast.error('Fehler beim Deaktivieren der Benachrichtigungen');
      return false;
    }
  };

  return {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
  };
};
