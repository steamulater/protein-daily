// Protein Daily — IndexedDB cache for PDB structure files
// localStorage is too small (~5MB limit); PDB files can be 100KB–5MB each.

class PDBCache {
    constructor() {
        this.dbName = 'ProteinDailyDB';
        this.storeName = 'pdbFiles';
        this.version = 1;
        this.db = null;
    }

    // Opens (or creates) the database. Idempotent — safe to call multiple times.
    async open() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'pdbId' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Returns the cached PDB string for pdbId, or null if not cached / on any error.
    async get(pdbId) {
        try {
            const db = await this.open();
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(pdbId);
                request.onsuccess = () => resolve(request.result ? request.result.data : null);
                request.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }

    // Stores pdbData (string) under pdbId. Silently fails — caching is best-effort.
    async set(pdbId, pdbData) {
        try {
            const db = await this.open();
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.put({ pdbId, data: pdbData, cachedAt: Date.now() });
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
            });
        } catch {
            // silent fail
        }
    }

    // Returns count of cached entries.
    async count() {
        try {
            const db = await this.open();
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(0);
            });
        } catch {
            return 0;
        }
    }
}
