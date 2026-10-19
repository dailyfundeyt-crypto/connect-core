import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@dailyfun/components/ui/dialog';
import { Button } from '@dailyfun/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@dailyfun/components/ui/avatar';
import { ScrollArea } from '@dailyfun/components/ui/scroll-area';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { toast } from 'sonner';
import { Send, Users } from 'lucide-react';

interface ShareArticleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  article: {
    id: string;
    title: string;
    excerpt: string;
    image_url?: string;
    category: string;
  };
}

interface Contact {
  id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export const ShareArticleDialog: React.FC<ShareArticleDialogProps> = ({
  isOpen,
  onClose,
  article,
}) => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      fetchContacts();
    }
  }, [isOpen, user]);

  const fetchContacts = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: conversations } = await supabase
        .from('conversations')
        .select('*')
        .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
        .order('updated_at', { ascending: false });

      if (conversations) {
        const contactsData = await Promise.all(
          conversations.map(async (conv) => {
            const otherUserId = conv.user_one_id === user.id ? conv.user_two_id : conv.user_one_id;
            
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, avatar_url')
              .eq('user_id', otherUserId)
              .single();

            return {
              id: conv.id,
              other_user_id: otherUserId,
              display_name: profile?.display_name || 'Unbekannt',
              avatar_url: profile?.avatar_url || null,
            };
          })
        );

        setContacts(contactsData);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast.error('Fehler beim Laden der Kontakte');
    } finally {
      setLoading(false);
    }
  };

  const handleShareArticle = async (conversationId: string, recipientId: string) => {
    if (!user) return;

    setSending(conversationId);
    try {
      const articleData = {
        id: article.id,
        title: article.title,
        excerpt: article.excerpt,
        image_url: article.image_url,
        category: article.category,
      };

      const { data, error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `📰 Artikel: ${article.title}`,
        message_type: 'article',
        article_data: articleData,
      }).select().single();

      if (error) throw error;

      // Send push notification in background
      supabase.functions.invoke('notify-new-message', {
        body: {
          message: data,
          conversation_id: conversationId,
        },
      }).catch(err => console.error('Push notification error:', err));

      toast.success('Artikel geteilt!');
      onClose();
    } catch (error) {
      console.error('Error sharing article:', error);
      toast.error('Fehler beim Teilen des Artikels');
    } finally {
      setSending(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Artikel teilen
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Keine Kontakte gefunden. Starte eine Konversation, um Artikel zu teilen.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={contact.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {contact.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{contact.display_name}</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleShareArticle(contact.id, contact.other_user_id)}
                    disabled={sending === contact.id}
                    className="gap-2"
                  >
                    {sending === contact.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Senden
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
