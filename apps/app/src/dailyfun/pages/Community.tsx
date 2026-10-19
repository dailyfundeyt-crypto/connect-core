import { useEffect, useState } from 'react';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { Card } from '@dailyfun/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dailyfun/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@dailyfun/components/ui/avatar';
import { Button } from '@dailyfun/components/ui/button';
import { MessageCircle, ThumbsUp, MoreVertical } from 'lucide-react';
import { SEO } from '@dailyfun/components/SEO';
import ChatInterface from '@dailyfun/components/ChatInterface';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  article_id: string;
  user_profile: {
    display_name: string;
    avatar_url: string;
  };
}

interface ConversationWithProfile {
  id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  last_message: string;
  last_message_time: string;
  unread_count: number;
}

const Community = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [selectedChat, setSelectedChat] = useState<{ recipientId: string; recipientName: string; recipientAvatar: string | null } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch comments on user's articles
      const { data: userArticles } = await supabase
        .from('user_articles')
        .select('id')
        .eq('user_id', user.id);

      if (userArticles && userArticles.length > 0) {
        const articleIds = userArticles.map(a => a.id);
        
        const { data: commentsData } = await supabase
          .from('article_comments')
          .select('id, content, created_at, article_id, user_id')
          .in('article_id', articleIds)
          .order('created_at', { ascending: false })
          .limit(20);

        if (commentsData) {
          const commentsWithProfiles = await Promise.all(
            commentsData.map(async (c) => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('display_name, avatar_url')
                .eq('user_id', c.user_id)
                .single();

              return {
                id: c.id,
                content: c.content,
                created_at: c.created_at,
                article_id: c.article_id,
                user_profile: {
                  display_name: profile?.display_name || 'Unbekannt',
                  avatar_url: profile?.avatar_url || ''
                }
              };
            })
          );
          setComments(commentsWithProfiles);
        }
      }

      // Fetch conversations
      const { data: conversationsData } = await supabase
        .from('conversations')
        .select('*')
        .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
        .order('updated_at', { ascending: false });

      if (conversationsData) {
        const conversationsWithProfiles = await Promise.all(
          conversationsData.map(async (conv) => {
            const otherUserId = conv.user_one_id === user.id ? conv.user_two_id : conv.user_one_id;
            
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, avatar_url')
              .eq('user_id', otherUserId)
              .single();

            const { data: lastMessage } = await supabase
              .from('messages')
              .select('content, created_at')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            return {
              id: conv.id,
              other_user_id: otherUserId,
              display_name: profile?.display_name || 'Unbekannt',
              avatar_url: profile?.avatar_url || null,
              last_message: lastMessage?.content || 'Keine Nachrichten',
              last_message_time: lastMessage?.created_at || conv.created_at,
              unread_count: 0
            };
          })
        );

        setConversations(conversationsWithProfiles);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (selectedChat) {
    return (
      <ChatInterface
        recipientId={selectedChat.recipientId}
        recipientName={selectedChat.recipientName}
        recipientAvatar={selectedChat.recipientAvatar}
        onClose={() => setSelectedChat(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <SEO 
        title="Community - Daily Fun"
        description="Treten Sie der Daily Fun Community bei. Tauschen Sie sich mit anderen Nutzern aus und bleiben Sie verbunden."
        canonical="https://www.daily-fun.org/community"
      />
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Community</h1>

        <Tabs defaultValue="private" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="private">Private Nachrichten</TabsTrigger>
            <TabsTrigger value="public">Kommentare</TabsTrigger>
          </TabsList>

          <TabsContent value="private" className="space-y-4">
            {conversations.length === 0 ? (
              <Card className="p-12 text-center bg-card">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Keine Nachrichten</h3>
                <p className="text-muted-foreground">
                  Du hast noch keine privaten Nachrichten erhalten.
                </p>
              </Card>
            ) : (
              conversations.map((conv) => (
                <Card
                  key={conv.id}
                  className="p-4 bg-card hover:bg-accent/5 transition-all cursor-pointer"
                  onClick={() => setSelectedChat({
                    recipientId: conv.other_user_id,
                    recipientName: conv.display_name,
                    recipientAvatar: conv.avatar_url
                  })}
                >
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={conv.avatar_url || undefined} />
                      <AvatarFallback>{conv.display_name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold truncate">{conv.display_name}</h3>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.last_message_time), { 
                            addSuffix: true, 
                            locale: de 
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{conv.last_message}</p>
                    </div>
                    {conv.unread_count > 0 && (
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs font-semibold">
                        {conv.unread_count}
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="public" className="space-y-4">
            {comments.length === 0 ? (
              <Card className="p-12 text-center bg-card">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Keine Kommentare</h3>
                <p className="text-muted-foreground">
                  Du hast noch keine Kommentare auf deine Artikel erhalten.
                </p>
              </Card>
            ) : (
              comments.map((comment) => (
                <Card key={comment.id} className="p-6 bg-card hover:bg-accent/5 transition-all">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={comment.user_profile.avatar_url || undefined} />
                      <AvatarFallback>{comment.user_profile.display_name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold">{comment.user_profile.display_name}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { 
                            addSuffix: true, 
                            locale: de 
                          })}
                        </span>
                      </div>
                      <p className="text-foreground mb-4">{comment.content}</p>
                      <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" className="gap-2">
                          <ThumbsUp className="h-4 w-4" />
                          Antworten
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Community;
