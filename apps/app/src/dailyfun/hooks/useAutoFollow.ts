import { useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';

const DEFAULT_AUTHORS = [
  'Stefan Kunc',
  'Dr. Elke Schneider', 
  'Karl Bergmann',
  'Jonas Richter'
];

export const useAutoFollow = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const autoFollowDefaultAuthors = async () => {
      // Note: Auto-follow is disabled because default authors don't have user accounts
      // Users can manually follow real user accounts
      // This hook is kept for backwards compatibility
    };

    autoFollowDefaultAuthors();
  }, [user]);

  return { DEFAULT_AUTHORS };
};