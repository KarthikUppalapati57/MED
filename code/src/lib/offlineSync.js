/**
 * offlineSync.js
 * An IndexedDB wrapper for caching offline database mutations in a PWA environment.
 */
import { openDB } from 'idb';

const DB_NAME = 'restops_offline_db';
const STORE_NAME = 'mutation_queue';

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

/**
 * Adds an API payload to the offline queue
 * @param {string} endpoint - The API endpoint to call when back online
 * @param {object} payload - The body of the request
 */
export async function queueOfflineMutation(endpoint, payload) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.add({
    endpoint,
    payload,
    timestamp: new Date().toISOString(),
    status: 'queued'
  });
  await tx.done;
  console.log(`[Offline Sync] Queued mutation for ${endpoint}`);
}

/**
 * Retrieves all pending mutations
 */
export async function getPendingMutations() {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return store.getAll();
}

/**
 * Removes a successfully synced mutation from the queue
 * @param {number} id 
 */
export async function clearMutation(id) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.delete(id);
  await tx.done;
}
