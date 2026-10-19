import { useEffect, useCallback } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { 
  storeMessageLocally, 
  getLocalMessages, 
  deleteLocalMessage,
  storeAttachmentLocally,
  getLocalAttachment,
  deleteLocalAttachment
} from '@dailyfun/utils/indexedDBHelper';
import { saveFileToLocalDirectory, hasDirectoryAccess } from '@dailyfun/utils/fileSystemStorage';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type?: 'text' | 'image' | 'pdf' | 'article';
  attachment_url?: string | null;
  article_data?: any;
  created_at: string;
  is_read: boolean;
  delivered_at?: string | null;
}

export function useMessageSync() {
  /**
   * Load messages: Merge local + server messages
   */
  const loadMessages = useCallback(async (conversationId: string, userId: string) => {
    // Load local messages first (instant)
    const localMessages = await getLocalMessages(conversationId);
    
    // Load undelivered messages from server
    const { data: serverMessages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .is('delivered_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching server messages:', error);
      return localMessages.map(msg => ({
        ...msg,
        conversation_id: msg.conversationId,
        sender_id: msg.senderId,
        message_type: msg.messageType,
        attachment_url: msg.attachmentUrl,
        article_data: msg.articleData,
        created_at: msg.createdAt,
        is_read: msg.isRead,
      }));
    }

    // Merge: local messages + new server messages
    const allMessages: Message[] = localMessages.map(msg => ({
      id: msg.id,
      conversation_id: msg.conversationId,
      sender_id: msg.senderId,
      content: msg.content,
      message_type: msg.messageType,
      attachment_url: msg.attachmentUrl,
      article_data: msg.articleData,
      created_at: msg.createdAt,
      is_read: msg.isRead,
    }));

    // Add server messages that aren't already local
    if (serverMessages) {
      for (const serverMsg of serverMessages) {
        if (!allMessages.find(m => m.id === serverMsg.id)) {
          allMessages.push({
            ...serverMsg,
            message_type: serverMsg.message_type || 'text',
          } as Message);
        }
      }
    }

    // Sort by date
    allMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return allMessages;
  }, []);

  /**
   * Save RECEIVED message locally and delete from server after delivery
   * Only for messages we receive, not for our own messages!
   */
  const saveReceivedMessageAndDeleteFromServer = useCallback(async (
    message: Message, 
    decryptedContent: string
  ) => {
    try {
      console.log('Saving received message locally:', message.id);
      
      // Save locally
      await storeMessageLocally({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        content: decryptedContent,
        messageType: (message.message_type || 'text') as 'text' | 'image' | 'pdf' | 'article',
        attachmentUrl: message.attachment_url || undefined,
        articleData: message.article_data,
        createdAt: message.created_at,
        isRead: message.is_read,
      });

      // Mirror message JSON into selected local folder (Obsidian-like)
      try {
        const canSave = await hasDirectoryAccess();
        if (canSave) {
          const messageRecord = {
            id: message.id,
            conversation_id: message.conversation_id,
            sender_id: message.sender_id,
            content: decryptedContent,
            message_type: message.message_type || 'text',
            attachment_url: message.attachment_url || null,
            created_at: message.created_at,
            is_read: message.is_read,
          };
          const jsonBlob = new Blob([JSON.stringify(messageRecord, null, 2)], { type: 'application/json' });
          await saveFileToLocalDirectory(`msg-${message.id}.json`, jsonBlob, ['Chats', message.conversation_id]);
        }
      } catch (e) {
        console.warn('Mirroring received message to local folder failed:', e);
      }

      // Download and save attachment if exists
      if (message.attachment_url) {
        // Download to IndexedDB first
        await downloadAndStoreAttachment(message.attachment_url);
        
        // Mirror attachment into local folder
        try {
          const canSave = await hasDirectoryAccess();
          console.log('hasDirectoryAccess:', canSave);
          
          if (canSave) {
            const fileName = message.attachment_url.split('/').pop() || `${message.id}-attachment`;
            console.log('Downloading attachment:', fileName, 'from:', message.attachment_url);
            
            const resp = await fetch(message.attachment_url);
            if (!resp.ok) {
              throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
            }
            
            const blob = await resp.blob();
            console.log('Blob received, size:', blob.size, 'type:', blob.type);
            
            await saveFileToLocalDirectory(fileName, blob, ['Chats', message.conversation_id]);
            console.log('✓ Attachment saved to local folder:', fileName);
          } else {
            console.warn('No directory access for saving attachments');
          }
        } catch (e) {
          console.error('Mirroring received attachment to local folder failed:', e);
        }
        
        // Delete from Supabase Storage
        try {
          const pathParts = message.attachment_url.split('/message-attachments/');
          if (pathParts[1]) {
            await supabase.storage
              .from('message-attachments')
              .remove([pathParts[1]]);
            console.log('✓ Attachment deleted from Supabase Storage');
          }
        } catch (e) {
          console.error('Failed to delete attachment from Supabase:', e);
        }
      }

      // Delete from server after we received it
      await supabase
        .from('messages')
        .delete()
        .eq('id', message.id);

      console.log('Received message saved locally and deleted from server:', message.id);
    } catch (error) {
      console.error('Error in saveReceivedMessageAndDeleteFromServer:', error);
    }
  }, []);

  /**
   * Save OWN sent message locally (keep on server until recipient downloads)
   */
  const saveOwnMessageLocally = useCallback(async (
    message: Message,
    unencryptedContent: string
  ) => {
    try {
      console.log('Saving own message locally:', message.id);
      
      await storeMessageLocally({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        content: unencryptedContent,
        messageType: (message.message_type || 'text') as 'text' | 'image' | 'pdf' | 'article',
        attachmentUrl: message.attachment_url || undefined,
        articleData: message.article_data,
        createdAt: message.created_at,
        isRead: false,
      });

      // Mirror message JSON into selected local folder
      try {
        const canSave = await hasDirectoryAccess();
        if (canSave) {
          const messageRecord = {
            id: message.id,
            conversation_id: message.conversation_id,
            sender_id: message.sender_id,
            content: unencryptedContent,
            message_type: message.message_type || 'text',
            attachment_url: message.attachment_url || null,
            created_at: message.created_at,
            is_read: false,
          };
          const jsonBlob = new Blob([JSON.stringify(messageRecord, null, 2)], { type: 'application/json' });
          await saveFileToLocalDirectory(`msg-${message.id}.json`, jsonBlob, ['Chats', message.conversation_id]);
        }
      } catch (e) {
        console.warn('Mirroring own message to local folder failed:', e);
      }
      
      console.log('Own message saved locally (stays on server for recipient):', message.id);
    } catch (error) {
      console.error('Error saving own message locally:', error);
    }
  }, []);

  /**
   * Download attachment and store as blob
   */
  const downloadAndStoreAttachment = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await storeAttachmentLocally(url, blob);
      console.log('Attachment downloaded and stored locally');
    } catch (error) {
      console.error('Error downloading attachment:', error);
    }
  };

  /**
   * Get local attachment as object URL
   */
  const getAttachmentUrl = useCallback(async (url: string): Promise<string> => {
    const blob = await getLocalAttachment(url);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return url; // Fallback to original URL
  }, []);

  /**
   * Delete message locally (manual deletion by user)
   */
  const deleteMessageLocally = useCallback(async (messageId: string, attachmentUrl?: string) => {
    try {
      await deleteLocalMessage(messageId);
      if (attachmentUrl) {
        await deleteLocalAttachment(attachmentUrl);
      }
      console.log('Message deleted locally:', messageId);
    } catch (error) {
      console.error('Error deleting message locally:', error);
    }
  }, []);

  return {
    loadMessages,
    saveReceivedMessageAndDeleteFromServer,
    saveOwnMessageLocally,
    getAttachmentUrl,
    deleteMessageLocally,
  };
}
