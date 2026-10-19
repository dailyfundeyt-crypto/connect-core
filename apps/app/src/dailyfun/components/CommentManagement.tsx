import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '@dailyfun/components/ui/avatar';
import { Button } from '@dailyfun/components/ui/button';
import { Textarea } from '@dailyfun/components/ui/textarea';
import { Loader2, Trash2, Reply, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface Comment {
  id: string;
  user_id: string;
  article_id: string;
  content: string;
  created_at: string;
  parent_comment_id: string | null;
  author?: {
    display_name: string;
    avatar_url: string;
  };
  article?: {
    title: string;
  };
  replies?: Comment[];
  notification?: {
    id: string;
    is_read: boolean;
  };
}

interface CommentGroup {
  articleId: string;
  articleTitle: string;
  comments: Comment[];
  unreadCount: number;
}

export const CommentManagement = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [commentGroups, setCommentGroups] = useState<CommentGroup[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchComments();
    }
  }, [user]);

  const fetchComments = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get all articles by current user
      const { data: userArticles, error: articlesError } = await supabase
        .from('user_articles')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('is_published', true);

      if (articlesError) throw articlesError;

      if (!userArticles || userArticles.length === 0) {
        setCommentGroups([]);
        setLoading(false);
        return;
      }

      const articleIds = userArticles.map(a => a.id.toString());

      // Get all comments on user's articles
      const { data: comments, error: commentsError } = await supabase
        .from('article_comments')
        .select('*')
        .in('article_id', articleIds)
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;

      // Get comment authors
      const userIds = [...new Set(comments?.map(c => c.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      // Get notifications
      const commentIds = comments?.map(c => c.id) || [];
      const { data: notifications } = await supabase
        .from('comment_notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .in('comment_id', commentIds);

      // Build comment tree
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const notificationMap = new Map(notifications?.map(n => [n.comment_id, n]) || []);
      const commentMap = new Map<string, Comment>();

      comments?.forEach(comment => {
        commentMap.set(comment.id, {
          ...comment,
          author: profileMap.get(comment.user_id),
          notification: notificationMap.get(comment.id),
          replies: []
        });
      });

      // Build reply tree
      comments?.forEach(comment => {
        if (comment.parent_comment_id) {
          const parent = commentMap.get(comment.parent_comment_id);
          if (parent) {
            parent.replies = parent.replies || [];
            parent.replies.push(commentMap.get(comment.id)!);
          }
        }
      });

      // Group by article
      const groups: CommentGroup[] = userArticles.map(article => {
        const articleComments = Array.from(commentMap.values())
          .filter(c => c.article_id === article.id.toString() && !c.parent_comment_id);
        
        const unreadCount = articleComments.reduce((count, comment) => {
          const isUnread = comment.notification && !comment.notification.is_read;
          const repliesUnread = comment.replies?.filter(r => r.notification && !r.notification.is_read).length || 0;
          return count + (isUnread ? 1 : 0) + repliesUnread;
        }, 0);

        return {
          articleId: article.id.toString(),
          articleTitle: article.title,
          comments: articleComments,
          unreadCount
        };
      }).filter(g => g.comments.length > 0);

      setCommentGroups(groups);
    } catch (error) {
      console.error('Error fetching comments:', error);
      toast.error('Fehler beim Laden der Kommentare');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (comment: Comment) => {
    if (!comment.notification || comment.notification.is_read) return;

    try {
      await supabase
        .from('comment_notifications')
        .update({ is_read: true })
        .eq('id', comment.notification.id);

      // Mark replies as read too
      if (comment.replies) {
        const replyNotificationIds = comment.replies
          .filter(r => r.notification && !r.notification.is_read)
          .map(r => r.notification!.id);
        
        if (replyNotificationIds.length > 0) {
          await supabase
            .from('comment_notifications')
            .update({ is_read: true })
            .in('id', replyNotificationIds);
        }
      }

      fetchComments();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Möchten Sie diesen Kommentar wirklich löschen?')) return;

    try {
      const { error } = await supabase
        .from('article_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      toast.success('Kommentar gelöscht');
      fetchComments();
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Fehler beim Löschen');
    }
  };

  const handleReply = async (commentId: string) => {
    if (!replyContent.trim()) return;

    try {
      setSubmitting(true);

      // Moderate the reply before posting
      const { data: moderationData, error: moderationError } = await supabase.functions.invoke('moderate-comment', {
        body: { content: replyContent }
      });

      if (moderationError) {
        console.error('Moderation error:', moderationError);
        toast.error('Moderation fehlgeschlagen. Bitte versuche es erneut.');
        setSubmitting(false);
        return;
      }

      if (!moderationData.isAppropriate) {
        toast.error(`Deine Antwort wurde abgelehnt: ${moderationData.reason}`);
        setSubmitting(false);
        return;
      }

      const comment = commentGroups
        .flatMap(g => g.comments)
        .find(c => c.id === commentId);

      if (!comment) return;

      // If moderation passed, post the reply
      const { error } = await supabase
        .from('article_comments')
        .insert({
          article_id: comment.article_id,
          user_id: user!.id,
          content: replyContent,
          parent_comment_id: commentId
        });

      if (error) throw error;

      toast.success('Antwort gesendet');
      setReplyContent('');
      setReplyingTo(null);
      fetchComments();
    } catch (error) {
      console.error('Error replying:', error);
      toast.error('Fehler beim Antworten');
    } finally {
      setSubmitting(false);
    }
  };

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => {
    const isUnread = comment.notification && !comment.notification.is_read;

    return (
      <div
        className={`group transition-all duration-300 ${
          isReply ? 'ml-12 mt-3' : 'mb-4'
        } ${isUnread ? 'animate-fade-in' : ''}`}
        onMouseEnter={() => markAsRead(comment)}
      >
        <div
          className={`bg-white rounded-2xl p-4 border transition-all duration-300 ${
            isUnread
              ? 'border-primary/30 shadow-sm'
              : 'border-gray-100'
          } hover:shadow-md hover:border-gray-200`}
        >
          <div className="flex items-start space-x-3">
            <Avatar className="w-10 h-10 ring-2 ring-gray-100">
              <AvatarImage src={comment.author?.avatar_url || ''} />
              <AvatarFallback className="bg-gray-200 text-gray-600">
                {comment.author?.display_name?.charAt(0) || <User className="h-5 w-5" />}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-gray-900">
                    {comment.author?.display_name || 'Unbekannt'}
                  </span>
                  {isUnread && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      Neu
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(comment.created_at).toLocaleDateString('de-DE')}</span>
                </div>
              </div>

              <p className="text-gray-700 mb-3 leading-relaxed">{comment.content}</p>

              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(comment.id)}
                  className="h-8 text-xs hover:bg-gray-100"
                >
                  <Reply className="h-3 w-3 mr-1" />
                  Antworten
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(comment.id)}
                  className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Löschen
                </Button>
              </div>

              {replyingTo === comment.id && (
                <div className="mt-3 animate-fade-in">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Antwort schreiben..."
                    className="min-h-[80px] resize-none border-gray-200 focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex items-center space-x-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => handleReply(comment.id)}
                      disabled={!replyContent.trim() || submitting}
                      className="bg-black hover:bg-gray-800"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Senden...
                        </>
                      ) : (
                        'Senden'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent('');
                      }}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-3">
            {comment.replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (commentGroups.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Reply className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Keine Kommentare</h3>
        <p className="text-gray-600">
          Du hast noch keine Kommentare auf deinen Artikeln erhalten.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {commentGroups.map(group => (
        <div key={group.articleId} className="animate-fade-in">
          {/* Article Header */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <Link
                  to={`/article/${group.articleId}`}
                  className="text-lg font-bold text-gray-900 hover:text-primary transition-colors line-clamp-1"
                >
                  {group.articleTitle}
                </Link>
                <p className="text-sm text-gray-600 mt-1">
                  {group.comments.length} {group.comments.length === 1 ? 'Kommentar' : 'Kommentare'}
                </p>
              </div>
              {group.unreadCount > 0 && (
                <div className="flex-shrink-0 ml-4">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm font-bold">
                    {group.unreadCount}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Comments List */}
          <div className="space-y-4">
            {group.comments.map(comment => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};