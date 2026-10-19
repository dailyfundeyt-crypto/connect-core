import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';

export const useArticleViews = (articleIds: string[]) => {
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchViewCounts = async () => {
      if (articleIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const counts: Record<string, number> = {};

        // Fetch view counts for all articles
        const { data, error } = await supabase
          .from('article_views')
          .select('article_id, view_count')
          .in('article_id', articleIds);

        if (error) throw error;

        // Map the results
        data?.forEach(item => {
          counts[item.article_id] = item.view_count || 0;
        });

        // Set 0 for articles without views
        articleIds.forEach(id => {
          if (!(id in counts)) {
            counts[id] = 0;
          }
        });

        setViewCounts(counts);
      } catch (error) {
        console.error('Error fetching view counts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchViewCounts();
  }, [articleIds.join(',')]);

  return { viewCounts, loading };
};
