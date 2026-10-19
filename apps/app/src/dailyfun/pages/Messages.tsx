import { useEffect, useState } from 'react';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { Card } from '@dailyfun/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dailyfun/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@dailyfun/components/ui/avatar';
import { Button } from '@dailyfun/components/ui/button';
import { MessageCircle, Reply, ArrowLeft } from 'lucide-react';
import ChatInterface from '@dailyfun/components/ChatInterface';
import { CommentManagement } from '@dailyfun/components/CommentManagement';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface ConversationWithProfile {
  id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  last_message: string;
  last_message_time: string;
  unread_count: number;
}

const Messages = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [selectedChat, setSelectedChat] = useState<{ recipientId: string; recipientName: string; recipientAvatar: string | null } | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
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

  // Show preview for non-authenticated users
  if (!user) {
    const demoConversations = [
      {
        id: '1',
        display_name: 'Max Mustermann',
        avatar_url: null,
        last_message: 'Hey, hast du den neuen Artikel über die Katzen gelesen?',
        last_message_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '2',
        display_name: 'Anna Schmidt',
        avatar_url: null,
        last_message: 'Das Video war echt lustig! 😄',
        last_message_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '3',
        display_name: 'Tom Weber',
        avatar_url: null,
        last_message: 'Wollen wir morgen zusammen den Artikel besprechen?',
        last_message_time: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      },
    ];

    return (
      <div className="min-h-screen bg-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-black mb-2">Nachrichten</h1>
            <p className="text-gray-600">Private Chats und Kommentare verwalten</p>
          </div>

          {/* Preview Banner */}
          <Card className="mb-6 p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-bold text-black mb-2">
                Melde dich an, um diese Funktion zu nutzen
              </h2>
              <p className="text-gray-600 mb-4">
                Chatte privat mit anderen Nutzern und verwalte deine Kommentare
              </p>
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-primary hover:bg-primary/90"
              >
                Jetzt anmelden
              </Button>
            </div>
          </Card>

          {/* Demo Preview */}
          <Tabs defaultValue="private" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-gray-100 rounded-2xl p-1">
              <TabsTrigger 
                value="private" 
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-xl transition-all"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Nachrichten
              </TabsTrigger>
              <TabsTrigger 
                value="comments" 
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-xl transition-all"
              >
                <Reply className="h-4 w-4 mr-2" />
                Kommentare
              </TabsTrigger>
            </TabsList>

            <TabsContent value="private" className="space-y-4 relative">
              {/* Blur overlay */}
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 rounded-2xl flex items-center justify-center">
                <Button 
                  onClick={() => navigate('/auth')}
                  size="lg"
                  className="bg-primary hover:bg-primary/90 shadow-lg"
                >
                  Anmelden um Nachrichten zu sehen
                </Button>
              </div>
              
              <div className="space-y-3 opacity-50">
                {demoConversations.map((conv, index) => (
                  <div
                    key={conv.id}
                    className="bg-white rounded-2xl p-5 border border-gray-100"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14 ring-2 ring-gray-100">
                        <AvatarFallback className="bg-gray-200 text-gray-700 text-lg font-bold">
                          {conv.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold text-black text-base truncate">
                            {conv.display_name}
                          </h3>
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(conv.last_message_time), { 
                              addSuffix: true, 
                              locale: de 
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 truncate">
                          {conv.last_message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="comments" className="relative">
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 rounded-2xl flex items-center justify-center">
                <Button 
                  onClick={() => navigate('/auth')}
                  size="lg"
                  className="bg-primary hover:bg-primary/90 shadow-lg"
                >
                  Anmelden um Kommentare zu verwalten
                </Button>
              </div>
              <div className="text-center py-16 opacity-50">
                <Reply className="h-10 w-10 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Deine Kommentare werden hier angezeigt</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // Show chat interface if chat is open
  if (selectedChat) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="p-4 border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedChat(null)}
              className="gap-2 hover:bg-gray-100 rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück zu Nachrichten
            </Button>
          </div>
          <ChatInterface
            recipientId={selectedChat.recipientId}
            recipientName={selectedChat.recipientName}
            recipientAvatar={selectedChat.recipientAvatar}
            onClose={() => setSelectedChat(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Nachrichten</h1>
          <p className="text-gray-600">Private Chats und Kommentare verwalten</p>
        </div>

        <Tabs defaultValue="private" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-gray-100 rounded-2xl p-1">
            <TabsTrigger 
              value="private" 
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-xl transition-all"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Nachrichten
            </TabsTrigger>
            <TabsTrigger 
              value="comments" 
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-xl transition-all"
            >
              <Reply className="h-4 w-4 mr-2" />
              Kommentare
            </TabsTrigger>
          </TabsList>

          <TabsContent value="private" className="space-y-4">
            {conversations.length === 0 ? (
              <div className="text-center py-16 animate-fade-in">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <MessageCircle className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-black mb-2">Keine Nachrichten</h3>
                <p className="text-gray-600 max-w-sm mx-auto">
                  Du hast noch keine privaten Nachrichten erhalten. Starte eine Konversation, indem du auf ein Profil gehst.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {conversations.map((conv, index) => (
                  <div
                    key={conv.id}
                    className="group bg-white rounded-2xl p-5 border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-300 cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => setSelectedChat({
                      recipientId: conv.other_user_id,
                      recipientName: conv.display_name,
                      recipientAvatar: conv.avatar_url
                    })}
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <Avatar className="h-14 w-14 ring-2 ring-gray-100 group-hover:ring-primary/20 transition-all">
                          <AvatarImage src={conv.avatar_url || undefined} />
                          <AvatarFallback className="bg-gray-200 text-gray-700 text-lg font-bold">
                            {conv.display_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        {/* Online indicator - optional */}
                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold text-black text-base truncate group-hover:text-primary transition-colors">
                            {conv.display_name}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(conv.last_message_time), { 
                                addSuffix: true, 
                                locale: de 
                              })}
                            </span>
                            {conv.unread_count > 0 && (
                              <div className="bg-primary text-white rounded-full min-w-[24px] h-6 px-2 flex items-center justify-center text-xs font-bold shadow-sm">
                                {conv.unread_count}
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 truncate line-clamp-2">
                          {conv.last_message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="comments">
            <CommentManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Messages;
