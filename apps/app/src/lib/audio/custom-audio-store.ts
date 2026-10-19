/**
 * IndexedDB storage for custom user-uploaded audio tracks.
 * Allows storing audio Blob/File data with persistent playback URLs.
 */

export interface CustomAudioTrack {
  id: string;
  title: string;
  filename: string;
  size: number;
  type: string;
  createdAt: number;
  blob: Blob;
  duration?: number;
}

const DB_NAME = "openbot_user_audio";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCustomAudioTrack(
  file: File,
): Promise<CustomAudioTrack> {
  const db = await openDB();
  const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const title = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

  const track: CustomAudioTrack = {
    id,
    title,
    filename: file.name,
    size: file.size,
    type: file.type || "audio/mpeg",
    createdAt: Date.now(),
    blob: file,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(track);
    req.onsuccess = () => resolve(track);
    req.onerror = () => reject(req.error);
  });
}

export async function listCustomAudioTracks(): Promise<CustomAudioTrack[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = (req.result as CustomAudioTrack[]) || [];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteCustomAudioTrack(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
