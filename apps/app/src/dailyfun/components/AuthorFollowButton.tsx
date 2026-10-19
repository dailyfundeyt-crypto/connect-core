import React, { useState, useEffect } from 'react';
import { Button } from '@dailyfun/components/ui/button';
import { Heart, HeartIcon } from 'lucide-react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { useToast } from '@dailyfun/hooks/use-toast';

const DEFAULT_AUTHORS = [
  'Stefan Kunc',
  'Dr. Elke Schneider',
  'Karl Bergmann', 
  'Jonas Richter'
];

interface AuthorFollowButtonProps {
  authorUserId?: string; // For real users
  authorName?: string; // For display (required for backwards compatibility with hardcoded authors)
  className?: string;
  onFollowChange?: () => void;
}

const AuthorFollowButton: React.FC<AuthorFollowButtonProps> = ({ 
  authorUserId,
  authorName, 
  className = '',
  onFollowChange
}) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user && authorUserId) {
      checkFollowStatus();
    }
  }, [user, authorUserId]);

  const checkFollowStatus = async () => {
    if (!user || !authorUserId) return;

    try {
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('followed_user_id', authorUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking follow status:', error);
        return;
      }

      setIsFollowing(!!data);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  };

  const handleFollowToggle = async () => {
    if (!user) {
      toast({
        title: 'Anmeldung erforderlich',
        description: 'Bitte melden Sie sich an, um Autoren zu folgen.',
        variant: 'destructive',
      });
      return;
    }

    if (!authorUserId) {
      toast({
        title: 'Fehler',
        description: 'Dieser Autor kann nicht gefolgt werden.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      if (isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('followed_user_id', authorUserId);

        if (error) throw error;

        setIsFollowing(false);
        toast({
          title: 'Entfolgt',
          description: `Sie folgen ${authorName || 'diesem Autor'} nicht mehr.`,
        });
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: user.id,
            followed_user_id: authorUserId,
          });

        if (error) throw error;

        setIsFollowing(true);
        toast({
          title: 'Gefolgt',
          description: `Sie folgen jetzt ${authorName || 'diesem Autor'}.`,
        });
      }
      
      // Trigger callback to refresh follows
      onFollowChange?.();
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast({
        title: 'Fehler',
        description: 'Es gab ein Problem beim Folgen/Entfolgen.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Button
      variant={isFollowing ? "default" : "outline"}
      size="sm"
      onClick={handleFollowToggle}
      disabled={loading}
      className={`ml-2 ${className}`}
    >
      {isFollowing ? (
        <>
          <Heart className="w-4 h-4 mr-1 fill-current" />
          Gefolgt
        </>
      ) : (
        <>
          <HeartIcon className="w-4 h-4 mr-1" />
          Folgen
        </>
      )}
    </Button>
  );
};

export default AuthorFollowButton;