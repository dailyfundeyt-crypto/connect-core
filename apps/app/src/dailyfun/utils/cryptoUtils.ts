/**
 * End-to-End Encryption Utilities using Web Crypto API
 * Keys are generated locally and private keys are encrypted before backup
 */

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedKeyBackup {
  encryptedPrivateKey: string;
  publicKey: string;
  salt: string;
}

/**
 * Generate a new RSA-OAEP key pair for encryption/decryption
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKey),
    privateKey: arrayBufferToBase64(privateKey),
  };
}

/**
 * Encrypt a message with the recipient's public key
 */
export async function encryptMessage(message: string, publicKeyBase64: string): Promise<string> {
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
  const publicKey = await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    data
  );

  return arrayBufferToBase64(encrypted);
}

/**
 * Decrypt a message with the user's private key
 */
export async function decryptMessage(encryptedMessage: string, privateKeyBase64: string): Promise<string> {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );

  const encryptedBuffer = base64ToArrayBuffer(encryptedMessage);
  
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Nachricht konnte nicht entschlüsselt werden]';
  }
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a random passphrase for key encryption
 */
export function generatePassphrase(): string {
  const words: string[] = [];
  const wordList = [
    'Apfel', 'Baum', 'Sonne', 'Mond', 'Stern', 'Wasser', 'Feuer', 'Erde',
    'Wind', 'Berg', 'Tal', 'Fluss', 'See', 'Meer', 'Wolke', 'Regen',
    'Schnee', 'Blume', 'Gras', 'Wald', 'Wiese', 'Stein', 'Sand', 'Gold'
  ];
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * wordList.length);
    words.push(wordList[randomIndex]);
  }
  
  return words.join('-');
}

/**
 * Derive an AES key from a passphrase using PBKDF2
 */
async function deriveKeyFromPassphrase(passphrase: string, salt: BufferSource): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt private key with passphrase using AES-GCM
 */
export async function encryptPrivateKey(privateKey: string, passphrase: string): Promise<EncryptedKeyBackup> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const aesKey = await deriveKeyFromPassphrase(passphrase, salt);
  
  const encoder = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    aesKey,
    encoder.encode(privateKey)
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return {
    encryptedPrivateKey: arrayBufferToBase64(combined.buffer),
    publicKey: '', // Will be set by caller
    salt: arrayBufferToBase64(salt.buffer),
  };
}

/**
 * Decrypt private key with passphrase
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: string,
  salt: string,
  passphrase: string
): Promise<string> {
  const saltBuffer = new Uint8Array(base64ToArrayBuffer(salt));
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedPrivateKey));
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const aesKey = await deriveKeyFromPassphrase(passphrase, saltBuffer);
  
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      aesKey,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Private key decryption failed:', error);
    throw new Error('Falsche Passphrase');
  }
}
