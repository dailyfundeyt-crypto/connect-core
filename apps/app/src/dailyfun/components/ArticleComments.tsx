import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Loader2, MessageCircle, Send, Trash2, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  parent_comment_id: string | null;
  profiles?: ProfileData | ProfileData[] | null;
  replies?: Comment[];
}

interface ArticleCommentsProps {
  articleId: string;
}

const commentSchema = z.object({
  content: z.string()
    .trim()
    .min(1, { message: "Kommentar darf nicht leer sein" })
    .max(1000, { message: "Kommentar darf maximal 1000 Zeichen lang sein" })
});

const ArticleComments = ({ articleId }: ArticleCommentsProps) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  useEffect(() => {
    fetchComments();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('article-comments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'article_comments',
          filter: `article_id=eq.${articleId}`
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [articleId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const { data: commentsData, error: commentsError } = await supabase
        .from('article_comments')
        .select('*')
        .eq('article_id', articleId)
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;

      // Fetch profiles separately
      const userIds = commentsData?.map(c => c.user_id) || [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      // Map profiles to comments and build tree
      const commentMap = new Map<string, Comment>();
      
      commentsData?.forEach(comment => {
        commentMap.set(comment.id, {
          ...comment,
          profiles: profilesData?.find(p => p.user_id === comment.user_id),
          replies: []
        });
      });

      // Build reply tree
      commentsData?.forEach(comment => {
        if (comment.parent_comment_id) {
          const parent = commentMap.get(comment.parent_comment_id);
          if (parent) {
            parent.replies = parent.replies || [];
            parent.replies.push(commentMap.get(comment.id)!);
          }
        }
      });

      // Get only top-level comments (no parent)
      const topLevelComments = Array.from(commentMap.values())
        .filter(c => !c.parent_comment_id);

      setComments(topLevelComments);
    } catch (error) {
      console.error('Error fetching comments:', error);
      toast.error('Fehler beim Laden der Kommentare');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Bitte melde dich an, um zu kommentieren');
      return;
    }

    try {
      // Validate input
      const validationResult = commentSchema.safeParse({ content: newComment });
      if (!validationResult.success) {
        toast.error(validationResult.error.errors[0].message);
        return;
      }

      setSubmitting(true);

      // Moderate the comment before posting
      const { data: moderationData, error: moderationError } = await supabase.functions.invoke('moderate-comment', {
        body: { content: validationResult.data.content }
      });

      if (moderationError) {
        console.error('Moderation error:', moderationError);
        toast.error('Moderation fehlgeschlagen. Bitte versuche es erneut.');
        setSubmitting(false);
        return;
      }

      if (!moderationData.isAppropriate) {
        toast.error(`Dein Kommentar wurde abgelehnt: ${moderationData.reason}`);
        setSubmitting(false);
        return;
      }

      // If moderation passed, post the comment
      const { error } = await supabase
        .from('article_comments')
        .insert({
          article_id: articleId,
          user_id: user.id,
          content: validationResult.data.content
        });

      if (error) throw error;

      setNewComment('');
      toast.success('Kommentar veröffentlicht!');
      fetchComments();
    } catch (error) {
      console.error('Error posting comment:', error);
      toast.error('Fehler beim Posten des Kommentars');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Möchtest du diesen Kommentar wirklich löschen?')) return;

    try {
      const { error } = await supabase
        .from('article_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast.success('Kommentar gelöscht!');
      fetchComments();
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Fehler beim Löschen des Kommentars');
    }
  };

  const handleEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (commentId: string) => {
    try {
      // Validate input
      const validationResult = commentSchema.safeParse({ content: editContent });
      if (!validationResult.success) {
        toast.error(validationResult.error.errors[0].message);
        return;
      }

      const { error } = await supabase
        .from('article_comments')
        .update({ 
          content: validationResult.data.content,
          updated_at: new Date().toISOString()
        })
        .eq('id', commentId)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast.success('Kommentar aktualisiert!');
      setEditingId(null);
      setEditContent('');
      fetchComments();
    } catch (error) {
      console.error('Error updating comment:', error);
      toast.error('Fehler beim Aktualisieren des Kommentars');
    }
  };

  const handleReply = async (parentCommentId: string) => {
    if (!user) {
      toast.error('Bitte melde dich an, um zu antworten');
      return;
    }

    try {
      // Validate input
      const validationResult = commentSchema.safeParse({ content: replyContent });
      if (!validationResult.success) {
        toast.error(validationResult.error.errors[0].message);
        return;
      }

      setSubmitting(true);

      // Moderate the reply before posting
      const { data: moderationData, error: moderationError } = await supabase.functions.invoke('moderate-comment', {
        body: { content: validationResult.data.content }
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

      // If moderation passed, post the reply
      const { error } = await supabase
        .from('article_comments')
        .insert({
          article_id: articleId,
          user_id: user.id,
          content: validationResult.data.content,
          parent_comment_id: parentCommentId
        });

      if (error) throw error;

      setReplyContent('');
      setReplyingTo(null);
      toast.success('Antwort gesendet!');
      fetchComments();
    } catch (error) {
      console.error('Error replying to comment:', error);
      toast.error('Fehler beim Antworten');
    } finally {
      setSubmitting(false);
    }
  };

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => (
    <div className={`${isReply ? 'ml-12 mt-4' : ''}`}>
      <div 
        className="bg-muted/20 rounded-lg p-4 border border-border hover:border-primary/30 transition-colors"
      >
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={
              Array.isArray(comment.profiles) 
                ? comment.profiles[0]?.avatar_url || '' 
                : comment.profiles?.avatar_url || ''
            } />
            <AvatarFallback className="bg-primary/10 text-primary">
              {(Array.isArray(comment.profiles) 
                ? comment.profiles[0]?.display_name || 'U'
                : comment.profiles?.display_name || 'U'
              ).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-semibold text-sm text-foreground">
                  {Array.isArray(comment.profiles)
                    ? comment.profiles[0]?.display_name || 'Anonymer Nutzer'
                    : comment.profiles?.display_name || 'Anonymer Nutzer'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(comment.created_at).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  {comment.updated_at !== comment.created_at && ' (bearbeitet)'}
                </p>
              </div>
              
              {user?.id === comment.user_id && (
                <div className="flex gap-2">
                  {editingId !== comment.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(comment)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(comment.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
            
            {editingId === comment.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[80px] resize-none"
                  maxLength={1000}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {editContent.length}/1000
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Abbrechen
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(comment.id)}
                      disabled={!editContent.trim()}
                    >
                      Speichern
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words mb-3">
                  {comment.content}
                </p>
                
                {/* Reply Button */}
                {!isReply && user && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyingTo(comment.id)}
                    className="text-xs h-7"
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Antworten
                  </Button>
                )}
              </>
            )}

            {/* Reply Form */}
            {replyingTo === comment.id && user && (
              <div className="mt-3 animate-fade-in">
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Antwort schreiben..."
                  className="min-h-[80px] resize-none mb-2"
                  maxLength={1000}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {replyContent.length}/1000
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent('');
                      }}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleReply(comment.id)}
                      disabled={!replyContent.trim() || submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Senden...
                        </>
                      ) : (
                        'Antworten'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Render Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-4">
          {comment.replies.map(reply => (
            <CommentItem key={reply.id} comment={reply} isReply />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-12 pt-8 border-t border-gray-200">
      <div className="flex items-center gap-2 mb-6">
        <MessageCircle className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-black">
          Kommentare {comments.length > 0 && `(${comments.length})`}
        </h2>
      </div>

      {/* Comment Form */}
      {user ? (
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="bg-muted/30 rounded-lg p-4 border border-border">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Schreibe einen Kommentar..."
              className="min-h-[100px] mb-3 resize-none"
              maxLength={1000}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {newComment.length}/1000
              </span>
              <Button 
                type="submit" 
                disabled={submitting || !newComment.trim()}
                className="gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Wird gepostet...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Kommentieren
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="mb-8 p-6 bg-muted/30 rounded-lg border border-border text-center">
          <p className="text-muted-foreground mb-3">
            Melde dich an, um einen Kommentar zu schreiben
          </p>
          <Button 
            onClick={() => window.location.href = '/auth'}
            variant="default"
          >
            Anmelden
          </Button>
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Noch keine Kommentare. Sei der Erste, der kommentiert!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ArticleComments;
