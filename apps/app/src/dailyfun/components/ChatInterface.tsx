import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { useEncryption } from '@dailyfun/hooks/useEncryption';
import { useMessageSync } from '@dailyfun/hooks/useMessageSync';
import { PassphraseBackupDialog } from './PassphraseBackupDialog';
import { PassphraseRestoreDialog } from './PassphraseRestoreDialog';
import { Avatar, AvatarImage, AvatarFallback } from '@dailyfun/components/ui/avatar';
import { Button } from '@dailyfun/components/ui/button';
import { Input } from '@dailyfun/components/ui/input';
import { ArrowLeft, Send, Paperclip, Image as ImageIcon, FileText, FolderUp, X, ExternalLink, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveFileToLocalDirectory, readFileFromLocalDirectory, hasDirectoryAccess } from '@dailyfun/utils/fileSystemStorage';
import MessageAttachment from './MessageAttachment';
import JSZip from 'jszip';
interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  is_encrypted?: boolean;
  message_type?: 'text' | 'image' | 'pdf' | 'file' | 'folder' | 'article';
  attachment_url?: string | null;
  article_data?: {
    id: string;
    title: string;
    excerpt: string;
    image_url?: string;
    category: string;
  } | null;
}

interface ChatInterfaceProps {
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string | null;
  onClose: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  recipientId,
  recipientName,
  recipientAvatar,
  onClose,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loadMessages, saveReceivedMessageAndDeleteFromServer, saveOwnMessageLocally, getAttachmentUrl, deleteMessageLocally } = useMessageSync();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canSendMedia, setCanSendMedia] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!user) {
      toast.error('Bitte melden Sie sich an');
      navigate('/auth');
      return;
    }
    initializeChat();
  }, [user, recipientId]);


  const initializeChat = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Find or create conversation
      const userOne = user.id < recipientId ? user.id : recipientId;
      const userTwo = user.id < recipientId ? recipientId : user.id;

      let { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_one_id', userOne)
        .eq('user_two_id', userTwo)
        .single();

      if (convError && convError.code !== 'PGRST116') {
        throw convError;
      }

      if (!conversation) {
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            user_one_id: userOne,
            user_two_id: userTwo,
          })
          .select()
          .single();

        if (createError) throw createError;
        conversation = newConv;
      }

      setConversationId(conversation.id);
      await fetchMessages(conversation.id);
      await checkMediaPermission(conversation.id);
      subscribeToMessages(conversation.id);
    } catch (error) {
      console.error('Error initializing chat:', error);
      toast.error('Fehler beim Laden des Chats');
    } finally {
      setLoading(false);
    }
  };

  const checkMediaPermission = async (convId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('can_send_media', {
        p_conversation_id: convId,
        p_recipient_id: recipientId,
      });

      if (error) {
        console.error('Error checking media permission:', error);
        return;
      }

      setCanSendMedia(data || false);
    } catch (error) {
      console.error('Error checking media permission:', error);
    }
  };

  const fetchMessages = async (convId: string) => {
    if (!user) return;
    
    try {
      // Load messages from local storage + server (no decryption needed)
      const allMessages = await loadMessages(convId, user.id);

      // Process messages - save received ones locally
      const processedMessages = await Promise.all(
        allMessages.map(async (msg: any) => {
          // Save received messages locally and delete from server
          if (msg.sender_id !== user.id && msg.message_type === 'text') {
            await saveReceivedMessageAndDeleteFromServer(msg, msg.content);
          }
          return msg as Message;
        })
      );

      setMessages(processedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const subscribeToMessages = (convId: string) => {
    const channel = supabase
      .channel(`messages:${convId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${convId}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          
          // Save received message locally and delete from server (for all message types)
          if (newMsg.sender_id !== user?.id) {
            await saveReceivedMessageAndDeleteFromServer(newMsg, newMsg.content);
          }
          
          setMessages((prev) => [...prev, newMsg as Message]);
          
          // Re-check media permission after new message
          checkMediaPermission(convId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !conversationId || !user) return;

    if (!canSendMedia) {
      toast.error('Der andere muss dir erst 3 Nachrichten senden, bevor du Dateien teilen kannst');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('Datei zu groß. Maximal 50MB erlaubt');
      return;
    }

    setShowAttachMenu(false);
    await uploadAndSendFile(file);
  };

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !conversationId || !user) return;

    if (!canSendMedia) {
      toast.error('Der andere muss dir erst 3 Nachrichten senden, bevor du Dateien teilen kannst');
      return;
    }

    setShowAttachMenu(false);
    setUploading(true);

    try {
      // Get folder name from the first file's webkitRelativePath
      const firstPath = (files[0] as any).webkitRelativePath || files[0].name;
      const folderName = firstPath.split('/')[0] || 'Ordner';

      // Create ZIP from all files
      const zip = new JSZip();
      let totalSize = 0;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const relativePath = (f as any).webkitRelativePath || f.name;
        totalSize += f.size;
        zip.file(relativePath, f);
      }

      if (totalSize > 100 * 1024 * 1024) {
        toast.error('Ordner zu groß. Maximal 100MB erlaubt');
        setUploading(false);
        return;
      }

      toast.info(`Ordner "${folderName}" wird gepackt (${files.length} Dateien)...`);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' });

      await uploadAndSendFile(zipFile, 'folder', `📁 ${folderName} (${files.length} Dateien)`);
    } catch (error) {
      console.error('Error creating folder zip:', error);
      toast.error('Fehler beim Packen des Ordners');
    } finally {
      setUploading(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const uploadAndSendFile = async (
    file: File,
    overrideType?: string,
    overrideContent?: string
  ) => {
    if (!conversationId || !user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(uploadError.message || 'Upload fehlgeschlagen');
      }

      const { data: { publicUrl } } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(fileName);

      const messageType = overrideType || (file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'file');
      const content = overrideContent || (messageType === 'image' ? '📷 Bild' : messageType === 'pdf' ? '📄 PDF-Dokument' : `📎 ${file.name}`);

      const { data: messageData, error: messageError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: messageType,
        attachment_url: publicUrl,
      }).select().single();

      if (messageError) throw messageError;

      await saveOwnMessageLocally(messageData as any, content);

      try {
        const canSave = await hasDirectoryAccess();
        if (canSave) {
          const localName = publicUrl.split('/').pop() || `${Date.now()}.${fileExt}`;
          await saveFileToLocalDirectory(localName, file, ['Chats', conversationId]);
        }
      } catch (e) {
        console.warn('Local mirror for sent attachment failed:', e);
      }

      supabase.functions.invoke('notify-new-message', {
        body: {
          message: {
            sender_id: user.id,
            content,
            message_type: messageType,
            attachment_url: publicUrl,
          },
          conversation_id: conversationId,
        },
      }).catch(err => console.error('Push notification error:', err));

      toast.success('Datei gesendet!');
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error(`Fehler beim Hochladen: ${error?.message || 'Unbekannter Fehler'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !conversationId || !user) return;

    const messageContent = newMessage.trim();
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic update - add message immediately
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: messageContent,
      is_read: false,
      created_at: new Date().toISOString(),
      message_type: 'text',
    };
    
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage('');

    try {
      const { data, error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageContent,
        message_type: 'text',
        is_encrypted: false,
      }).select().single();

      if (error) throw error;

      // Save own message locally
      await saveOwnMessageLocally(data as any, messageContent);

      // Mirror text message JSON to local directory
      try {
        const canSave = await hasDirectoryAccess();
        if (canSave) {
          const record = {
            id: (data as any).id,
            conversation_id: conversationId,
            sender_id: user.id,
            content: messageContent,
            message_type: 'text',
            attachment_url: null,
            created_at: (data as any).created_at,
            is_read: false,
          };
          const jsonBlob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
          await saveFileToLocalDirectory(`msg-${(data as any).id}.json`, jsonBlob, ['Chats', conversationId]);
        }
      } catch (e) {
        console.warn('Local mirror for sent text message failed:', e);
      }

      // Replace temp message with real one
      setMessages((prev) => 
        prev.map((msg) => msg.id === tempId ? { ...data, content: messageContent } as unknown as Message : msg)
      );

      // Send push notification in background
      supabase.functions.invoke('notify-new-message', {
        body: {
          message: { ...data, content: messageContent },
          conversation_id: conversationId,
        },
      }).catch(err => console.error('Push notification error:', err));
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Fehler beim Senden der Nachricht');
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  };

  const handleDeleteMessage = async (messageId: string, attachmentUrl?: string) => {
    try {
      await deleteMessageLocally(messageId, attachmentUrl || undefined);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setSelectedMessage(null);
      toast.success('Nachricht gelöscht');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Fehler beim Löschen');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = (message: Message) => {
    const isOwn = message.sender_id === user?.id;

    if (message.message_type === 'article' && message.article_data) {
      return (
        <div
          className={`max-w-[85%] rounded-2xl overflow-hidden shadow-md ${
            isOwn ? 'bg-primary text-white' : 'bg-white border border-gray-200'
          }`}
        >
          {message.article_data.image_url && (
            <img
              src={message.article_data.image_url}
              alt={message.article_data.title}
              className="w-full h-32 object-cover"
            />
          )}
          <div className="p-3">
            <h4 className={`font-bold text-sm mb-1 ${isOwn ? 'text-white' : 'text-black'}`}>
              {message.article_data.title}
            </h4>
            <p className={`text-xs mb-2 line-clamp-2 ${isOwn ? 'text-white/90' : 'text-gray-600'}`}>
              {message.article_data.excerpt}
            </p>
            <Button
              size="sm"
              variant={isOwn ? 'secondary' : 'default'}
              onClick={() => navigate(`/article/${message.article_data?.id}`)}
              className="w-full gap-2"
            >
              <ExternalLink className="h-3 w-3" />
              Artikel öffnen
            </Button>
          </div>
        </div>
      );
    }

    if (message.message_type === 'image' && message.attachment_url) {
      return (
        <MessageAttachment
          url={message.attachment_url}
          type="image"
          isOwn={isOwn}
        />
      );
    }

    if ((message.message_type === 'pdf' || message.message_type === 'file' || message.message_type === 'folder') && message.attachment_url) {
      return (
        <MessageAttachment
          url={message.attachment_url}
          type={message.message_type === 'folder' ? 'folder' : 'file'}
          isOwn={isOwn}
          fileName={message.content}
        />
      );
    }

    // Text message
    return (
      <div
        className={`max-w-[75%] rounded-[20px] px-4 py-2.5 shadow-sm ${
          isOwn
            ? 'bg-primary text-white rounded-br-sm'
            : 'bg-white text-black rounded-bl-sm border border-gray-100'
        }`}
      >
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col pb-24 md:pb-0">
        {/* Header - Apple Style */}
        <div className="bg-white/95 backdrop-blur-xl border-b border-gray-200 px-4 py-4 flex items-center gap-3 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="hover:bg-gray-100 rounded-full p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </Button>
        
        <Avatar className="w-11 h-11 ring-2 ring-gray-100">
          <AvatarImage src={recipientAvatar || ''} />
          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-bold text-lg">
            {recipientName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <h2 className="text-base font-bold text-black">{recipientName}</h2>
          <p className="text-xs text-gray-500">Online</p>
        </div>
      </div>

      {/* Messages Container - Apple iMessage Style */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-32 md:pb-6 space-y-3 bg-gray-50">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
              <Send className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-black mb-2">
              Noch keine Nachrichten
            </h3>
            <p className="text-gray-600">
              Sende die erste Nachricht an {recipientName}
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.sender_id === user?.id;
            const showTimestamp = index === 0 || 
              new Date(message.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() > 300000; // 5 min
            
            return (
              <div key={message.id} className="animate-fade-in">
                {showTimestamp && (
                  <div className="text-center mb-4">
                    <span className="text-xs text-gray-500 bg-white/80 px-3 py-1 rounded-full">
                      {new Date(message.created_at).toLocaleTimeString('de-DE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                <div
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group relative`}
                  onClick={() => setSelectedMessage(selectedMessage === message.id ? null : message.id)}
                >
                  {renderMessage(message)}
                  
                  {/* Delete button - only show for selected message */}
                  {selectedMessage === message.id && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMessage(message.id, message.attachment_url || undefined);
                      }}
                      className="absolute -right-2 top-1/2 -translate-y-1/2 rounded-full w-8 h-8 p-0 shadow-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Apple Style */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200 px-4 py-4 shadow-lg mb-[68px] md:mb-0">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            onChange={handleFolderSelect}
            className="hidden"
            {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
          />
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={!canSendMedia || uploading}
              className="rounded-full p-2 hover:bg-muted"
              title={canSendMedia ? 'Datei anhängen' : '3 Nachrichten vom Empfänger nötig'}
            >
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </Button>
            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 bg-card border border-border rounded-xl shadow-lg p-2 min-w-[160px] z-50">
                <button
                  onClick={() => { fileInputRef.current?.click(); }}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted text-sm text-foreground"
                >
                  <FileText className="h-4 w-4" />
                  Datei
                </button>
                <button
                  onClick={() => { folderInputRef.current?.click(); }}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted text-sm text-foreground"
                >
                  <FolderUp className="h-4 w-4" />
                  Ordner
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 relative">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Nachricht"
              className="rounded-full bg-gray-100 border-0 px-5 py-3 text-[15px] focus-visible:ring-2 focus-visible:ring-primary/20 resize-none h-11"
              disabled={!conversationId || uploading}
            />
          </div>
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || !conversationId || uploading}
            className="rounded-full w-11 h-11 p-0 bg-primary hover:bg-primary/90 shadow-md disabled:opacity-40 transition-all"
          >
            {uploading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        {!canSendMedia && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            Dateien werden freigeschaltet, sobald {recipientName} dir 3 Nachrichten gesendet hat
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
