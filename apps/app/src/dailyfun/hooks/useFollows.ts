import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';

export const useFollows = () => {
  const [followedUserIds, setFollowedUserIds] = useState<string[]>([]);
  const [followedAuthors, setFollowedAuthors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchFollowedAuthors();
    } else {
      setFollowedUserIds([]);
      setFollowedAuthors([]);
      setLoading(false);
    }
  }, [user]);

  const fetchFollowedAuthors = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Get followed user IDs
      const { data: followsData, error: followsError } = await supabase
        .from('follows')
        .select('followed_user_id')
        .eq('follower_id', user.id);

      if (followsError) {
        console.error('Error fetching followed authors:', followsError);
        return;
      }

      const userIds = followsData?.map(follow => follow.followed_user_id) || [];
      setFollowedUserIds(userIds);

      // Get display names for these user IDs
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          return;
        }

        setFollowedAuthors(profilesData?.map(p => p.display_name || '') || []);
      } else {
        setFollowedAuthors([]);
      }
    } catch (error) {
      console.error('Error fetching followed authors:', error);
    } finally {
      setLoading(false);
    }
  };

  return { followedUserIds, followedAuthors, loading, refetchFollows: fetchFollowedAuthors };
};