import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { toast } from 'sonner';

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  ai_credits: number;
  image_upload_limit: number;
  has_ad_free: boolean;
  has_video_player: boolean;
}

interface UserSubscription {
  id: string;
  plan_id: string;
  ai_credits_remaining: number;
  images_uploaded: number;
  is_active: boolean;
  activated_at: string;
  expires_at: string | null;
  plan?: SubscriptionPlan;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProUser, setIsProUser] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPlans();
      fetchUserSubscription();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price', { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error fetching plans:', error);
      toast.error('Fehler beim Laden der Abonnementpläne');
    }
  };

  const fetchUserSubscription = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Fetch user subscription with plan details
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      setSubscription(data);
      
      // Check if user has Pro
      if (data?.plan) {
        setIsProUser(data.plan.name === 'Pro');
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const activateProSubscription = async () => {
    if (!user) {
      toast.error('Bitte melde dich an');
      return false;
    }

    try {
      // Find Pro plan
      const proPlan = plans.find(p => p.name === 'Pro');
      if (!proPlan) {
        toast.error('Pro-Plan nicht gefunden');
        return false;
      }

      // Check if user already has a subscription
      if (subscription) {
        // Update existing subscription to Pro
        const { error } = await supabase
          .from('user_subscriptions')
          .update({
            plan_id: proPlan.id,
            ai_credits_remaining: proPlan.ai_credits,
            images_uploaded: 0,
            is_active: true,
            activated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);

        if (error) throw error;
      } else {
        // Create new Pro subscription
        const { error } = await supabase
          .from('user_subscriptions')
          .insert({
            user_id: user.id,
            plan_id: proPlan.id,
            ai_credits_remaining: proPlan.ai_credits,
            images_uploaded: 0,
            is_active: true,
            activated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      toast.success('Pro-Abonnement erfolgreich aktiviert!');
      await fetchUserSubscription();
      return true;
    } catch (error) {
      console.error('Error activating Pro subscription:', error);
      toast.error('Fehler beim Aktivieren des Pro-Abonnements');
      return false;
    }
  };

  const cancelSubscription = async () => {
    if (!subscription) return false;

    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ is_active: false })
        .eq('id', subscription.id);

      if (error) throw error;

      toast.success('Abonnement erfolgreich gekündigt');
      await fetchUserSubscription();
      return true;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      toast.error('Fehler beim Kündigen des Abonnements');
      return false;
    }
  };

  const useAICredit = async (amount: number = 1) => {
    if (!user || !subscription) {
      toast.error('Kein aktives Abonnement gefunden');
      return false;
    }

    try {
      const { data, error } = await supabase.rpc('deduct_ai_credits', {
        p_user_id: user.id,
        p_amount: amount
      });

      if (error) throw error;

      if (!data) {
        toast.error('Nicht genügend AI-Credits verfügbar');
        return false;
      }

      await fetchUserSubscription();
      return true;
    } catch (error) {
      console.error('Error using AI credit:', error);
      toast.error('Fehler beim Verwenden der AI-Credits');
      return false;
    }
  };

  const incrementImageUpload = async () => {
    if (!subscription) return false;

    try {
      const newCount = subscription.images_uploaded + 1;
      const limit = subscription.plan?.image_upload_limit || 10;

      if (newCount > limit) {
        toast.error(`Bild-Upload-Limit erreicht (${limit} Bilder)`);
        return false;
      }

      const { error } = await supabase
        .from('user_subscriptions')
        .update({ images_uploaded: newCount })
        .eq('id', subscription.id);

      if (error) throw error;

      await fetchUserSubscription();
      return true;
    } catch (error) {
      console.error('Error incrementing image upload:', error);
      return false;
    }
  };

  return {
    subscription,
    plans,
    loading,
    isProUser,
    activateProSubscription,
    cancelSubscription,
    useAICredit,
    incrementImageUpload,
    refreshSubscription: fetchUserSubscription,
  };
};
