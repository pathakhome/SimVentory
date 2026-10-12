/**
 * IndexedDB Database Layer for ComponentVault
 * Handles all persistent storage operations for items, images, and usage history.
 */

const DB_NAME = 'ComponentVaultDB';
const DB_VERSION = 1;

const STORES = {
  ITEMS: 'items',
  IMAGES: 'images',
  HISTORY: 'history',
};

let dbInstance = null;

/**
 * Opens (or creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Items store
      if (!db.objectStoreNames.contains(STORES.ITEMS)) {
        const itemStore = db.createObjectStore(STORES.ITEMS, { keyPath: 'id' });
        itemStore.createIndex('category', 'category', { unique: false });
        itemStore.createIndex('name', 'name', { unique: false });
        itemStore.createIndex('isFavorite', 'isFavorite', { unique: false });
        itemStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Images store (blobs keyed by item id)
      if (!db.objectStoreNames.contains(STORES.IMAGES)) {
        db.createObjectStore(STORES.IMAGES, { keyPath: 'id' });
      }

      // Usage history store
      if (!db.objectStoreNames.contains(STORES.HISTORY)) {
        const historyStore = db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
        historyStore.createIndex('itemId', 'itemId', { unique: false });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Generate a UUID v4.
 */
export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ---- SERVER API SUPPORT ----
let apiCheckPromise = null;

/**
 * Check if the central server API is available.
 */
export async function isServerAvailable() {
  if (apiCheckPromise !== null) return apiCheckPromise;
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
    apiCheckPromise = res.ok;
  } catch {
    apiCheckPromise = false;
  }
  return apiCheckPromise;
}

// ---- ITEM CRUD ----

/**
 * Get all items from the store (server or local IndexedDB).
 * @returns {Promise<Array>}
 */
export async function getAllItems() {
  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/items');
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('[DB] API error, falling back to IndexedDB', e);
    }
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ITEMS, 'readonly');
    const store = tx.objectStore(STORES.ITEMS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single item by ID.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export async function getItem(id) {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`/api/items/${id}`);
      if (res.ok) return await res.json();
      if (res.status === 404) return undefined;
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ITEMS, 'readonly');
    const store = tx.objectStore(STORES.ITEMS);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add or update an item.
 * @param {Object} item
 * @returns {Promise<string>} item id
 */
export async function saveItem(item) {
  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok) return item.id;
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ITEMS, 'readwrite');
    const store = tx.objectStore(STORES.ITEMS);
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete an item and its associated image and history.
 * @param {string} id
 */
export async function deleteItem(id) {
  if (await isServerAvailable()) {
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' });
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.ITEMS, STORES.IMAGES, STORES.HISTORY], 'readwrite');

    tx.objectStore(STORES.ITEMS).delete(id);
    tx.objectStore(STORES.IMAGES).delete(id);

    // Delete all history for this item
    const historyStore = tx.objectStore(STORES.HISTORY);
    const index = historyStore.index('itemId');
    const cursorReq = index.openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- IMAGE CRUD ----

/**
 * Save an image blob for an item.
 * @param {string} itemId
 * @param {Blob} blob
 */
export async function saveImage(itemId, blob) {
  if (await isServerAvailable()) {
    try {
      await fetch(`/api/items/${itemId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/jpeg' },
        body: blob,
      });
      return;
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.IMAGES, 'readwrite');
    const store = tx.objectStore(STORES.IMAGES);
    store.put({ id: itemId, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get an image blob for an item.
 * @param {string} itemId
 * @returns {Promise<Blob|null>}
 */
export async function getImage(itemId) {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`/api/items/${itemId}/image`);
      if (res.ok) return await res.blob();
      if (res.status === 404) return null;
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.IMAGES, 'readonly');
    const store = tx.objectStore(STORES.IMAGES);
    const request = store.get(itemId);
    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete image for an item.
 * @param {string} itemId
 */
export async function deleteImage(itemId) {
  if (await isServerAvailable()) {
    try {
      await fetch(`/api/items/${itemId}/image`, { method: 'DELETE' });
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.IMAGES, 'readwrite');
    tx.objectStore(STORES.IMAGES).delete(itemId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- USAGE HISTORY ----

/**
 * Add a usage history entry.
 * @param {string} itemId
 * @param {'added'|'used'|'restocked'|'created'|'updated'|'deleted'} action
 * @param {number} quantityChange
 */
export async function addHistory(itemId, action, quantityChange = 0) {
  if (await isServerAvailable()) {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action, quantityChange, timestamp: new Date().toISOString() }),
      });
      return;
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.HISTORY, 'readwrite');
    const store = tx.objectStore(STORES.HISTORY);
    store.put({
      id: generateId(),
      itemId,
      action,
      quantityChange,
      timestamp: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get usage history for an item.
 * @param {string} itemId
 * @returns {Promise<Array>}
 */
export async function getHistory(itemId) {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`/api/history/${itemId}`);
      if (res.ok) return await res.json();
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.HISTORY, 'readonly');
    const store = tx.objectStore(STORES.HISTORY);
    const index = store.index('itemId');
    const request = index.getAll(IDBKeyRange.only(itemId));
    request.onsuccess = () => {
      const results = request.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

// ---- EXPORT / IMPORT ----

/**
 * Export all data as a JSON-serializable object.
 * Images are exported as base64.
 */
export async function exportData() {
  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/export');
      if (res.ok) return await res.json();
    } catch (e) {}
  }

  const items = await getAllItems();
  const db = await openDB();

  // Get all images
  const images = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.IMAGES, 'readonly');
    const req = tx.objectStore(STORES.IMAGES).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  // Get all history
  const history = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.HISTORY, 'readonly');
    const req = tx.objectStore(STORES.HISTORY).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  // Convert image blobs to base64
  const imageData = await Promise.all(
    images.map(async (img) => {
      const base64 = await blobToBase64(img.blob);
      return { id: img.id, data: base64 };
    })
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
    images: imageData,
    history,
  };
}

/**
 * Import data from a JSON object (as exported by exportData).
 * @param {Object} data
 */
export async function importData(data) {
  if (!data || !data.items) throw new Error('Invalid import data');

  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) return;
    } catch (e) {}
  }

  const db = await openDB();

  // Clear existing data
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.ITEMS, STORES.IMAGES, STORES.HISTORY], 'readwrite');
    tx.objectStore(STORES.ITEMS).clear();
    tx.objectStore(STORES.IMAGES).clear();
    tx.objectStore(STORES.HISTORY).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Import items
  const tx = db.transaction([STORES.ITEMS, STORES.IMAGES, STORES.HISTORY], 'readwrite');
  const itemStore = tx.objectStore(STORES.ITEMS);
  const imageStore = tx.objectStore(STORES.IMAGES);
  const historyStore = tx.objectStore(STORES.HISTORY);

  for (const item of data.items) {
    itemStore.put(item);
  }

  // Import images (base64 -> blob)
  if (data.images) {
    for (const img of data.images) {
      const blob = await base64ToBlob(img.data);
      imageStore.put({ id: img.id, blob });
    }
  }

  // Import history
  if (data.history) {
    for (const entry of data.history) {
      historyStore.put(entry);
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Export items as CSV string.
 */
export async function exportCSV() {
  const items = await getAllItems();
  const headers = ['Name', 'Category', 'Condition', 'Quantity', 'Low Stock Threshold', 'Part Number', 'Location', 'Description', 'Tags', 'Supplier Info', 'Datasheet URL', 'Favorite', 'Notes', 'Created At'];
  const rows = items.map(item => [
    item.name,
    item.category,
    item.condition || 'Unpacked New',
    item.quantity,
    item.lowStockThreshold,
    item.partNumber || '',
    item.location || '',
    item.description || '',
    (item.tags || []).join('; '),
    item.supplierInfo || '',
    item.datasheetUrl || '',
    item.isFavorite ? 'Yes' : 'No',
    item.notes || '',
    item.createdAt,
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return csvContent;
}

// ---- Helpers ----

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64) {
  return fetch(base64).then(res => res.blob());
}

// ---- CATEGORIES CRUD ----

export const DEFAULT_CATEGORIES = [
  { name: 'Sensors', color: '#f472b6', icon: '📡', isDefault: true },
  { name: 'ICs', color: '#60a5fa', icon: '🔲', isDefault: true },
  { name: 'Resistors', color: '#a78bfa', icon: '⚡', isDefault: true },
  { name: 'Capacitors', color: '#34d399', icon: '🔋', isDefault: true },
  { name: 'LEDs', color: '#fbbf24', icon: '💡', isDefault: true },
  { name: 'Connectors', color: '#fb923c', icon: '🔌', isDefault: true },
  { name: 'Switches', color: '#f87171', icon: '🔘', isDefault: true },
  { name: 'Motors', color: '#2dd4bf', icon: '⚙️', isDefault: true },
  { name: 'Modules', color: '#818cf8', icon: '📦', isDefault: true },
  { name: 'Other', color: '#94a3b8', icon: '🔧', isDefault: true },
];

/**
 * Get all categories (defaults + custom).
 * @returns {Promise<Array>}
 */
export async function getCategories() {
  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {}
  }

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('cv_custom_categories');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  return [...DEFAULT_CATEGORIES];
}

/**
 * Add or update a category.
 * @param {Object} category { name, icon, color }
 */
export async function saveCategory(category) {
  if (!category || !category.name) throw new Error('Category name is required');

  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(category),
      });
      if (res.ok) {
        const data = await res.json();
        return data.categories;
      }
    } catch (e) {}
  }

  // Fallback to localStorage
  const current = await getCategories();
  const cleanName = category.name.trim();
  const idx = current.findIndex(c => c.name.toLowerCase() === cleanName.toLowerCase());
  const entry = {
    name: cleanName,
    icon: category.icon || '📦',
    color: category.color || '#818cf8',
    isDefault: false,
  };

  if (idx >= 0) {
    current[idx] = { ...current[idx], ...entry };
  } else {
    current.push(entry);
  }

  localStorage.setItem('cv_custom_categories', JSON.stringify(current));
  return current;
}

/**
 * Delete a category.
 * @param {string} name
 */
export async function deleteCategory(name) {
  if (name.toLowerCase() === 'other') throw new Error('Cannot delete Other category');

  if (await isServerAvailable()) {
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        return data.categories;
      }
    } catch (e) {}
  }

  // Fallback to localStorage
  let current = await getCategories();
  current = current.filter(c => c.name.toLowerCase() !== name.toLowerCase());
  localStorage.setItem('cv_custom_categories', JSON.stringify(current));
  return current;
}

// ---- STORAGE LOCATIONS CRUD ----

/**
 * Get all storage locations.
 * @returns {Promise<Array<{name: string, description: string}>>}
 */
export async function getLocations() {
  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/locations');
      if (res.ok) return await res.json();
    } catch (e) {}
  }

  // Fallback: merge custom saved locations with any used on items
  const locMap = new Map();
  try {
    const saved = localStorage.getItem('cv_custom_locations');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        parsed.forEach(l => locMap.set(l.name.toLowerCase(), l));
      }
    }
  } catch (e) {}

  const items = await getAllItems();
  items.forEach(i => {
    if (i.location && i.location.trim()) {
      const trimmed = i.location.trim();
      if (!locMap.has(trimmed.toLowerCase())) {
        locMap.set(trimmed.toLowerCase(), { name: trimmed, description: '' });
      }
    }
  });

  return Array.from(locMap.values());
}

/**
 * Add or update a storage location.
 * @param {Object} location { name, description }
 */
export async function saveLocation(location) {
  if (!location || !location.name) throw new Error('Location name is required');

  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(location),
      });
      if (res.ok) {
        const data = await res.json();
        return data.locations;
      }
    } catch (e) {}
  }

  const current = await getLocations();
  const cleanName = location.name.trim();
  const idx = current.findIndex(l => l.name.toLowerCase() === cleanName.toLowerCase());
  const entry = { name: cleanName, description: (location.description || '').trim() };

  if (idx >= 0) {
    current[idx] = entry;
  } else {
    current.push(entry);
  }

  localStorage.setItem('cv_custom_locations', JSON.stringify(current));
  return current;
}

/**
 * Delete a storage location.
 * @param {string} name
 */
export async function deleteLocation(name) {
  if (await isServerAvailable()) {
    try {
      await fetch(`/api/locations/${encodeURIComponent(name)}`, { method: 'DELETE' });
    } catch (e) {}
  }

  let current = await getLocations();
  current = current.filter(l => l.name.toLowerCase() !== name.toLowerCase());
  localStorage.setItem('cv_custom_locations', JSON.stringify(current));
  return current;
}


/**
 * Clear all items, images, and usage history.
 */
export async function clearAllData() {
  if (await isServerAvailable()) {
    try {
      await fetch('/api/clear', { method: 'POST' });
    } catch (e) {}
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.ITEMS, STORES.IMAGES, STORES.HISTORY], 'readwrite');
    tx.objectStore(STORES.ITEMS).clear();
    tx.objectStore(STORES.IMAGES).clear();
    tx.objectStore(STORES.HISTORY).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Helper to generate simple SVG blobs for demo items.
 */
function createSvgBlob(svgMarkup) {
  return new Blob([svgMarkup], { type: 'image/svg+xml' });
}

/**
 * Seed database with realistic DIY electronics components.
 */
export async function seedSampleData() {
  const sampleItems = [
    {
      id: generateId(),
      name: 'ESP32-WROOM-32',
      description: 'Dual-core 240MHz microcontroller with built-in Wi-Fi and Bluetooth BLE.',
      category: 'Modules',
      condition: 'Packed',
      tags: ['WiFi', 'Bluetooth', '3.3V', 'Microcontroller'],
      quantity: 5,
      lowStockThreshold: 2,
      partNumber: 'ESP32-WROOM-32D',
      location: 'Drawer A1',
      datasheetUrl: 'https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf',
      supplierInfo: 'Amazon — ₹320',
      notes: 'Operating voltage 3.0V - 3.6V. GPIO16/17 connected to PSRAM if present.',
      isFavorite: true,
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#1e1b4b"/><rect x="40" y="40" width="220" height="120" rx="8" fill="#312e81" stroke="#6366f1" stroke-width="2"/><rect x="60" y="60" width="80" height="80" rx="4" fill="#1e1b4b"/><text x="100" y="105" fill="#a5b4fc" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">ESP32</text><circle cx="210" cy="75" r="8" fill="#22c55e"/><circle cx="210" cy="100" r="8" fill="#3b82f6"/><text x="150" y="180" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">ESP32-WROOM-32</text></svg>`,
    },
    {
      id: generateId(),
      name: 'DHT22 Temperature & Humidity Sensor',
      description: 'High precision digital sensor module for ambient humidity and temperature sensing.',
      category: 'Sensors',
      condition: 'Unpacked New',
      tags: ['Temperature', 'Humidity', 'Digital', '1-Wire'],
      quantity: 3,
      lowStockThreshold: 2,
      partNumber: 'AM2302',
      location: 'Drawer B3',
      datasheetUrl: 'https://www.sparkfun.com/datasheets/Sensors/Temperature/DHT22.pdf',
      supplierInfo: 'Robu.in — ₹180',
      notes: 'Requires a 4.7kΩ to 10kΩ pull-up resistor between VCC and Data pin.',
      isFavorite: true,
      createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#2e1065"/><rect x="80" y="30" width="140" height="130" rx="10" fill="#4c1d95" stroke="#f472b6" stroke-width="2"/><circle cx="150" cy="80" r="30" fill="#581c87"/><text x="150" y="85" fill="#f472b6" font-family="sans-serif" font-size="20" text-anchor="middle">📡</text><text x="150" y="135" fill="#fbcfe8" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">DHT22 / AM2302</text><line x1="110" y1="160" x2="110" y2="185" stroke="#cbd5e1" stroke-width="4"/><line x1="135" y1="160" x2="135" y2="185" stroke="#cbd5e1" stroke-width="4"/><line x1="165" y1="160" x2="165" y2="185" stroke="#cbd5e1" stroke-width="4"/><line x1="190" y1="160" x2="190" y2="185" stroke="#cbd5e1" stroke-width="4"/></svg>`,
    },
    {
      id: generateId(),
      name: 'NE555P Precision Timer IC',
      description: 'Industry standard monolithic timing circuit capable of producing accurate time delays or oscillation.',
      category: 'ICs',
      condition: 'Unpacked New',
      tags: ['Timer', 'DIP-8', 'Oscillator', 'Analog'],
      quantity: 14,
      lowStockThreshold: 5,
      partNumber: 'NE555P',
      location: 'Drawer C1',
      datasheetUrl: 'https://www.ti.com/lit/ds/symlink/ne555.pdf',
      supplierInfo: 'Local Electronics Store — ₹15 each',
      notes: 'Pin 1: GND, Pin 2: TRIG, Pin 3: OUT, Pin 4: RESET, Pin 5: CTRL, Pin 6: THRES, Pin 7: DISCH, Pin 8: VCC (4.5V - 16V).',
      isFavorite: false,
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#0f172a"/><rect x="90" y="50" width="120" height="100" rx="4" fill="#1e293b" stroke="#60a5fa" stroke-width="2"/><circle cx="150" cy="50" r="10" fill="#0f172a"/><text x="150" y="105" fill="#93c5fd" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">NE555P</text><rect x="70" y="65" width="20" height="8" rx="2" fill="#94a3b8"/><rect x="70" y="85" width="20" height="8" rx="2" fill="#94a3b8"/><rect x="70" y="105" width="20" height="8" rx="2" fill="#94a3b8"/><rect x="70" y="125" width="20" height="8" rx="2" fill="#94a3b8"/><rect x="210" y="65" width="20" height="8" rx="2" fill="#94a3b8"/><rect x="210" y="85" width="20" height="8" rx="2" fill="#94a3b8"/><rect x="210" y="105" width="20" height="8" rx="2" fill="#94a3b8"/><rect x="210" y="125" width="20" height="8" rx="2" fill="#94a3b8"/></svg>`,
    },
    {
      id: generateId(),
      name: 'ATmega328P-PU Microcontroller',
      description: '8-bit AVR RISC microcontroller with 32KB flash in 28-pin DIP package. The heart of the Arduino Uno.',
      category: 'ICs',
      condition: 'Unpacked Used',
      tags: ['AVR', 'DIP-28', '16MHz', 'Arduino'],
      quantity: 1,
      lowStockThreshold: 2,
      partNumber: 'ATmega328P-PU',
      location: 'Drawer C2',
      datasheetUrl: 'https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf',
      supplierInfo: 'Mouser — ₹250',
      notes: 'Pre-burned with Optiboot 16MHz bootloader. Remember 16MHz crystal + two 22pF ceramic caps on pins 9 and 10.',
      isFavorite: true,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#022c22"/><rect x="60" y="60" width="180" height="80" rx="4" fill="#064e3b" stroke="#34d399" stroke-width="2"/><circle cx="60" cy="100" r="8" fill="#022c22"/><text x="150" y="105" fill="#6ee7b7" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">ATmega328P</text><text x="150" y="122" fill="#a7f3d0" font-family="sans-serif" font-size="9" text-anchor="middle">28-Pin DIP</text></svg>`,
    },
    {
      id: generateId(),
      name: 'MTS-102 SPDT Mini Toggle Switch',
      description: 'Miniature 3-pin ON-ON single pole double throw toggle switch with threaded bushing and hex nut.',
      category: 'Switches',
      condition: 'Packed',
      tags: ['Toggle', 'SPDT', '3-Pin', 'Panel-mount'],
      quantity: 8,
      lowStockThreshold: 3,
      partNumber: 'MTS-102',
      location: 'Bin 4',
      datasheetUrl: '',
      supplierInfo: 'AliExpress — 10 pack ~₹120',
      notes: 'Rated 6A 125VAC / 3A 250VAC. Fits 6mm panel cutout hole.',
      isFavorite: false,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#450a0a"/><rect x="100" y="80" width="100" height="80" rx="6" fill="#7f1d1d" stroke="#f87171" stroke-width="2"/><line x1="150" y1="80" x2="130" y2="35" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/><circle cx="127" cy="30" r="10" fill="#ef4444"/><line x1="120" y1="160" x2="120" y2="185" stroke="#cbd5e1" stroke-width="4"/><line x1="150" y1="160" x2="150" y2="185" stroke="#cbd5e1" stroke-width="4"/><line x1="180" y1="160" x2="180" y2="185" stroke="#cbd5e1" stroke-width="4"/></svg>`,
    },
    {
      id: generateId(),
      name: 'SG90 Micro Servo 9g',
      description: 'Tiny 9g analog servo motor with 180° rotation angle, nylon gears, and 3-pin connector.',
      category: 'Motors',
      condition: 'Unpacked Used',
      tags: ['Servo', 'PWM', '5V', 'Robotics'],
      quantity: 2,
      lowStockThreshold: 2,
      partNumber: 'TowerPro SG90',
      location: 'Box 2',
      datasheetUrl: '',
      supplierInfo: 'Amazon — ₹110',
      notes: 'Wiring: Orange (PWM Signal), Red (5V VCC), Brown (GND). Stall torque: 1.8 kg/cm at 4.8V.',
      isFavorite: false,
      createdAt: new Date(Date.now() - 43200000).toISOString(),
      updatedAt: new Date(Date.now() - 43200000).toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#042f2e"/><rect x="80" y="60" width="140" height="100" rx="8" fill="#115e59" stroke="#2dd4bf" stroke-width="2"/><circle cx="125" cy="85" r="24" fill="#0f766e" stroke="#2dd4bf" stroke-width="2"/><circle cx="125" cy="85" r="8" fill="#ffffff"/><rect x="120" y="45" width="60" height="16" rx="4" fill="#f59e0b"/><text x="175" y="125" fill="#99f6e4" font-family="sans-serif" font-size="12" font-weight="bold">SG90</text></svg>`,
    },
    {
      id: generateId(),
      name: '10kΩ 1/4W Metal Film Resistors',
      description: 'Precision 1% tolerance axial lead metal film resistors for pull-up/pull-down and voltage dividers.',
      category: 'Resistors',
      condition: 'Packed',
      tags: ['10k', 'Through-hole', '1%', 'Pull-up'],
      quantity: 85,
      lowStockThreshold: 20,
      partNumber: 'MF0207FTE52-10K',
      location: 'Drawer D1',
      datasheetUrl: '',
      supplierInfo: 'Local Store — Tape strip of 100',
      notes: 'Color bands: Brown (1), Black (0), Black (0), Red (x100), Brown (1%). Total: 10,000Ω.',
      isFavorite: false,
      createdAt: new Date(Date.now() - 21600000).toISOString(),
      updatedAt: new Date(Date.now() - 21600000).toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#2e1065"/><line x1="30" y1="100" x2="270" y2="100" stroke="#cbd5e1" stroke-width="4"/><rect x="80" y="75" width="140" height="50" rx="10" fill="#93c5fd"/><rect x="105" y="75" width="8" height="50" fill="#78350f"/><rect x="125" y="75" width="8" height="50" fill="#0f172a"/><rect x="145" y="75" width="8" height="50" fill="#0f172a"/><rect x="165" y="75" width="8" height="50" fill="#dc2626"/><rect x="195" y="75" width="8" height="50" fill="#78350f"/><text x="150" y="155" fill="#ddd6fe" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">10 kΩ 1%</text></svg>`,
    },
    {
      id: generateId(),
      name: '16x2 I2C Character LCD Module',
      description: '16 columns x 2 rows alphanumeric liquid crystal display with PCF8574 I2C adapter backpack.',
      category: 'Modules',
      condition: 'Unpacked New',
      tags: ['I2C', 'Display', 'HD44780', '5V'],
      quantity: 0,
      lowStockThreshold: 1,
      partNumber: 'LCD1602-I2C',
      location: 'Drawer E2',
      datasheetUrl: '',
      supplierInfo: 'Robu.in — ₹190',
      notes: 'Default I2C address usually 0x27 or 0x3F. Contrast adjustment potentiometer on the back of the module.',
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#172554"/><rect x="40" y="40" width="220" height="120" rx="6" fill="#1e3a8a" stroke="#60a5fa" stroke-width="2"/><rect x="65" y="55" width="170" height="70" rx="3" fill="#1d4ed8"/><text x="150" y="85" fill="#93c5fd" font-family="monospace" font-size="12" text-anchor="middle">Hello, World!</text><text x="150" y="105" fill="#93c5fd" font-family="monospace" font-size="12" text-anchor="middle">ComponentVault</text><text x="150" y="180" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">LCD1602 I2C</text></svg>`,
    },
  ];

  for (const item of sampleItems) {
    const { svg, ...itemData } = item;
    await saveItem(itemData);
    if (svg) {
      const blob = createSvgBlob(svg);
      await saveImage(item.id, blob);
    }
    await addHistory(item.id, 'created', item.quantity);
  }
}
