import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';

export const useArticleComments = (articleIds: string[]) => {
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCommentCounts = async () => {
      if (articleIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const counts: Record<string, number> = {};

        // Fetch comment counts for all articles
        const { data, error } = await supabase
          .from('article_comments')
          .select('article_id')
          .in('article_id', articleIds);

        if (error) throw error;

        // Count comments per article
        data?.forEach(comment => {
          counts[comment.article_id] = (counts[comment.article_id] || 0) + 1;
        });

        // Set 0 for articles without comments
        articleIds.forEach(id => {
          if (!(id in counts)) {
            counts[id] = 0;
          }
        });

        setCommentCounts(counts);
      } catch (error) {
        console.error('Error fetching comment counts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCommentCounts();
  }, [articleIds.join(',')]);

  return { commentCounts, loading };
};
