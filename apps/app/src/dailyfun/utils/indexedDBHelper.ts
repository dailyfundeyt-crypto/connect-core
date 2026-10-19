/**
 * IndexedDB Helper for secure local storage of encryption keys and messages
 * Private keys and message data are stored locally and never sent to the server
 */

const DB_NAME = 'DailyFunE2EE';
const DB_VERSION = 2;
const KEYS_STORE = 'encryption_keys';
const MESSAGES_STORE = 'messages';
const ATTACHMENTS_STORE = 'attachments';

interface StoredKey {
  userId: string;
  privateKey: string;
  publicKey: string;
  createdAt: Date;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'pdf' | 'article';
  attachmentUrl?: string;
  articleData?: any;
  createdAt: string;
  isRead: boolean;
}

interface StoredAttachment {
  url: string;
  blob: Blob;
  createdAt: Date;
}

/**
 * Initialize IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Encryption keys store
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        const keysStore = db.createObjectStore(KEYS_STORE, { keyPath: 'userId' });
        keysStore.createIndex('userId', 'userId', { unique: true });
      }
      
      // Messages store
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const messagesStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        messagesStore.createIndex('conversationId', 'conversationId', { unique: false });
        messagesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      
      // Attachments store
      if (!db.objectStoreNames.contains(ATTACHMENTS_STORE)) {
        const attachmentsStore = db.createObjectStore(ATTACHMENTS_STORE, { keyPath: 'url' });
        attachmentsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Store encryption keys locally
 */
export async function storeKeysLocally(
  userId: string,
  privateKey: string,
  publicKey: string
): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(KEYS_STORE);
    
    const keyData: StoredKey = {
      userId,
      privateKey,
      publicKey,
      createdAt: new Date(),
    };
    
    const request = store.put(keyData);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Retrieve private key from local storage
 */
export async function getPrivateKey(userId: string): Promise<string | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE], 'readonly');
    const store = transaction.objectStore(KEYS_STORE);
    const request = store.get(userId);
    
    request.onsuccess = () => {
      const result = request.result as StoredKey | undefined;
      resolve(result?.privateKey || null);
    };
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Check if keys exist for a user
 */
export async function hasKeys(userId: string): Promise<boolean> {
  const privateKey = await getPrivateKey(userId);
  return privateKey !== null;
}

/**
 * Delete all local keys (for logout or key rotation)
 */
export async function clearAllKeys(): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(KEYS_STORE);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Store message locally after receiving from server
 */
export async function storeMessageLocally(message: StoredMessage): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], 'readwrite');
    const store = transaction.objectStore(MESSAGES_STORE);
    const request = store.put(message);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get all messages for a conversation from local storage
 */
export async function getLocalMessages(conversationId: string): Promise<StoredMessage[]> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], 'readonly');
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index('conversationId');
    const request = index.getAll(conversationId);
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Delete a specific message locally
 */
export async function deleteLocalMessage(messageId: string): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], 'readwrite');
    const store = transaction.objectStore(MESSAGES_STORE);
    const request = store.delete(messageId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Store attachment blob locally
 */
export async function storeAttachmentLocally(url: string, blob: Blob): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ATTACHMENTS_STORE], 'readwrite');
    const store = transaction.objectStore(ATTACHMENTS_STORE);
    
    const attachmentData: StoredAttachment = {
      url,
      blob,
      createdAt: new Date(),
    };
    
    const request = store.put(attachmentData);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get attachment blob from local storage
 */
export async function getLocalAttachment(url: string): Promise<Blob | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ATTACHMENTS_STORE], 'readonly');
    const store = transaction.objectStore(ATTACHMENTS_STORE);
    const request = store.get(url);
    
    request.onsuccess = () => {
      const result = request.result as StoredAttachment | undefined;
      resolve(result?.blob || null);
    };
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Delete attachment from local storage
 */
export async function deleteLocalAttachment(url: string): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ATTACHMENTS_STORE], 'readwrite');
    const store = transaction.objectStore(ATTACHMENTS_STORE);
    const request = store.delete(url);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    
    transaction.oncomplete = () => db.close();
  });
}
