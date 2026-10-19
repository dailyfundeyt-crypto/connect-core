import { useState, useEffect } from 'react';
import { supabase } from '@dailyfun/integrations/supabase/client';
import { useAuth } from '@dailyfun/contexts/AuthContext';
import { 
  generateKeyPair, 
  encryptMessage, 
  decryptMessage, 
  generatePassphrase,
  encryptPrivateKey,
  decryptPrivateKey 
} from '@dailyfun/utils/cryptoUtils';
import { storeKeysLocally, getPrivateKey, hasKeys } from '@dailyfun/utils/indexedDBHelper';
import { toast } from 'sonner';

export function useEncryption() {
  const { user } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [backupPassphrase, setBackupPassphrase] = useState<string | null>(null);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);

  useEffect(() => {
    if (user) {
      initializeEncryption();
    }
  }, [user]);

  const initializeEncryption = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Check if user already has keys locally
      const hasLocalKeys = await hasKeys(user.id);
      
      if (!hasLocalKeys) {
        // Check if encrypted backup exists on server
        const { data: serverKeys } = await supabase
          .from('encryption_keys')
          .select('encrypted_private_key, key_derivation_salt, public_key')
          .eq('user_id', user.id)
          .maybeSingle();

        if (serverKeys?.encrypted_private_key && serverKeys?.key_derivation_salt) {
          // User has backup but needs to restore it
          console.log('Backup found, needs passphrase to restore');
          setNeedsPassphrase(true);
          setIsLoading(false);
          return;
        }

        // Generate new key pair
        console.log('Generating new encryption keys...');
        const keyPair = await generateKeyPair();
        
        // Generate backup passphrase
        const passphrase = generatePassphrase();
        setBackupPassphrase(passphrase);
        
        // Encrypt private key with passphrase
        const encrypted = await encryptPrivateKey(keyPair.privateKey, passphrase);
        encrypted.publicKey = keyPair.publicKey;
        
        // Store private key locally
        await storeKeysLocally(user.id, keyPair.privateKey, keyPair.publicKey);
        
        // Store public key and encrypted backup on server
        const { error } = await supabase
          .from('encryption_keys')
          .upsert({
            user_id: user.id,
            public_key: keyPair.publicKey,
            encrypted_private_key: encrypted.encryptedPrivateKey,
            key_derivation_salt: encrypted.salt,
          });

        if (error) throw error;
        
        console.log('Encryption keys generated and backed up');
        toast.success('Verschlüsselung eingerichtet', {
          description: 'Bitte speichern Sie Ihre Backup-Passphrase!',
          duration: 10000,
        });
      } else {
        console.log('Using existing encryption keys');
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('Error initializing encryption:', error);
      toast.error('Verschlüsselung konnte nicht initialisiert werden');
    } finally {
      setIsLoading(false);
    }
  };

  const restoreFromPassphrase = async (passphrase: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data: serverKeys, error } = await supabase
        .from('encryption_keys')
        .select('encrypted_private_key, key_derivation_salt, public_key')
        .eq('user_id', user.id)
        .single();

      if (error || !serverKeys) {
        toast.error('Keine Backup-Daten gefunden');
        return false;
      }

      // Decrypt private key
      const privateKey = await decryptPrivateKey(
        serverKeys.encrypted_private_key!,
        serverKeys.key_derivation_salt!,
        passphrase
      );

      // Store locally
      await storeKeysLocally(user.id, privateKey, serverKeys.public_key);

      setNeedsPassphrase(false);
      setIsInitialized(true);
      toast.success('Schlüssel erfolgreich wiederhergestellt');
      return true;
    } catch (error) {
      console.error('Restore failed:', error);
      toast.error('Wiederherstellung fehlgeschlagen - falsche Passphrase?');
      return false;
    }
  };

  const getRecipientPublicKey = async (recipientId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('encryption_keys')
        .select('public_key')
        .eq('user_id', recipientId)
        .maybeSingle();

      if (error) throw error;
      return data?.public_key || null;
    } catch (error) {
      console.error('Error fetching recipient public key:', error);
      return null;
    }
  };

  const encrypt = async (message: string, recipientId: string): Promise<string | null> => {
    try {
      const publicKey = await getRecipientPublicKey(recipientId);
      if (!publicKey) {
        console.error('Recipient public key not found');
        return null;
      }

      const encrypted = await encryptMessage(message, publicKey);
      return encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      return null;
    }
  };

  const decrypt = async (encryptedMessage: string): Promise<string> => {
    if (!user) return '[Nicht angemeldet]';

    try {
      const privateKey = await getPrivateKey(user.id);
      if (!privateKey) {
        console.error('Private key not found');
        return '[Schlüssel nicht gefunden]';
      }

      const decrypted = await decryptMessage(encryptedMessage, privateKey);
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return '[Entschlüsselung fehlgeschlagen]';
    }
  };

  return {
    isInitialized,
    isLoading,
    encrypt,
    decrypt,
    getRecipientPublicKey,
    backupPassphrase,
    needsPassphrase,
    restoreFromPassphrase,
  };
}
