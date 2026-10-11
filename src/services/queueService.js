/**
 * SimVentory — AI Intake Queue Service
 * Manages background processing of bulk component photos, rate-limited AI vision calls,
 * staging persistence, and vault approval.
 */

import { generateId, saveImage, getImage, saveItem, addHistory, getCategories, saveLocation } from '../db.js';
import { analyzeComponentImage } from './aiService.js';
import { optimizeImage } from '../imageUtil.js';

const QUEUE_STORAGE_KEY = 'simventory_ai_intake_queue';

let queue = [];
let isProcessing = false;
let listeners = new Set();

/**
 * Load queue from localStorage on module init or state sync.
 * Auto-recovers any zombie 'processing' items back to 'queued' if not actively processing.
 */
function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    queue = raw ? JSON.parse(raw) : [];

    // Zombie check: If in-memory isProcessing is false, any item marked 'processing'
    // is a zombie from an aborted session or page refresh. Reset it to 'queued'.
    if (!isProcessing) {
      let changed = false;
      for (const item of queue) {
        if (item.status === 'processing') {
          item.status = 'queued';
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      }
    }
  } catch (_) {
    queue = [];
  }
}

/**
 * Persist queue metadata to localStorage and notify listeners
 */
function persistQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('[QueueService] Failed to persist queue:', e);
  }
  notifyListeners();
}

/**
 * Subscribe to queue changes
 */
export function subscribeQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  const summary = getQueueSummary();
  listeners.forEach(fn => {
    try { fn(queue, summary); } catch (e) { console.error(e); }
  });
}

/**
 * Get current queue items
 */
export function getQueueItems() {
  loadQueue();
  return [...queue];
}

/**
 * Get summary stats for current queue
 */
export function getQueueSummary() {
  loadQueue();
  const total = queue.length;
  const queued = queue.filter(i => i.status === 'queued').length;
  const processing = queue.filter(i => i.status === 'processing').length;
  const ready = queue.filter(i => i.status === 'ready').length;
  const error = queue.filter(i => i.status === 'error').length;
  return { total, queued, processing, ready, error, isProcessing };
}

/**
 * Add multiple image files or blobs to the queue
 */
export async function addFilesToQueue(files, { defaultLocation = 'Unsorted', defaultHint = '', defaultQuantity = 1, defaultThreshold = 0 } = {}) {
  loadQueue();
  const newItems = [];
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    const id = generateId();

    // Optimize image (compress 12MP+ camera photos to crisp ~200-400KB WebP)
    let optimizedBlob = file;
    try {
      optimizedBlob = await optimizeImage(file, 1600, 0.85);
    } catch (optErr) {
      console.warn('[QueueService] Image optimization failed, using original file:', optErr);
    }

    // Save optimized image directly to storage under item ID
    await saveImage(id, optimizedBlob);

    const item = {
      id,
      fileName: file.name || 'Component Photo',
      fileSize: optimizedBlob.size || file.size || 0,
      status: 'queued', // queued | processing | ready | error
      error: null,
      location: defaultLocation,
      hint: defaultHint,
      quantity: defaultQuantity,
      lowStockThreshold: defaultThreshold,
      aiData: null,
      createdAt: new Date().toISOString(),
    };

    queue.push(item);
    newItems.push(item);
    // Persist per-item so user sees cards staged immediately in UI
    persistQueue();
  }

  // Automatically start background processing
  processQueue();
  return newItems;
}

/**
 * Start or resume background processing of queued items
 */
export async function processQueue() {
  if (isProcessing) return;
  loadQueue();

  // Safety check: recover any zombie 'processing' items to 'queued'
  for (const item of queue) {
    if (item.status === 'processing') {
      item.status = 'queued';
    }
  }

  const nextItem = queue.find(i => i.status === 'queued');
  if (!nextItem) {
    isProcessing = false;
    notifyListeners();
    return;
  }

  isProcessing = true;
  notifyListeners();

  try {
    const categories = await getCategories();
    const catNames = categories.map(c => c.name);

    while (true) {
      const current = queue.find(i => i.status === 'queued');
      if (!current) break;

      current.status = 'processing';
      current.error = null;
      persistQueue();

      try {
        const imageBlob = await getImage(current.id);
        if (!imageBlob) {
          throw new Error('Image data not found in storage.');
        }

        // 45-second per-item safety timeout so queue never deadlocks
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI analysis timed out after 45 seconds')), 45000)
        );

        const aiResult = await Promise.race([
          analyzeComponentImage({
            image: imageBlob,
            categories: catNames,
            hint: current.hint || '',
          }),
          timeoutPromise,
        ]);

        // Verify the item wasn't discarded or queue cleared during the API request
        if (!queue.some(i => i.id === current.id)) {
          continue;
        }

        current.status = 'ready';
        current.aiData = aiResult;
        current.name = aiResult.name || 'Electronic Component';
        current.category = aiResult.category || 'Other';
        current.partNumber = aiResult.partNumber || '';
        current.description = aiResult.description || '';
        current.tags = aiResult.tags || [];
        current.notes = aiResult.notes || '';
        current.supplierInfo = aiResult.supplierInfo || '';
        current.datasheetUrl = aiResult.datasheetUrl || '';
      } catch (err) {
        console.error(`[QueueService] Error processing item ${current.id}:`, err);
        // Verify item is still in queue before setting error state
        if (queue.some(i => i.id === current.id)) {
          current.status = 'error';
          current.error = err.message || 'AI recognition failed';
        }
      }

      persistQueue();
      // Brief pause between items to respect rate-limits
      await new Promise(r => setTimeout(r, 600));
    }
  } finally {
    isProcessing = false;
    persistQueue();
  }
}

/**
 * Retry a failed queue item
 */
export async function retryQueueItem(id) {
  loadQueue();
  const item = queue.find(i => i.id === id);
  if (item) {
    item.status = 'queued';
    item.error = null;
    persistQueue();
    processQueue();
  }
}

/**
 * Update editable fields of a queued item
 */
export function updateQueueItem(id, updates) {
  loadQueue();
  const item = queue.find(i => i.id === id);
  if (item) {
    Object.assign(item, updates);
    persistQueue();
  }
}

/**
 * Approve a single queued item into the main inventory
 */
export async function approveQueueItem(id, overrides = {}) {
  loadQueue();
  const item = queue.find(i => i.id === id);
  if (!item) throw new Error('Queue item not found');

  const name = (overrides.name !== undefined ? overrides.name : (item.name || item.aiData?.name || '')).trim();
  const location = (overrides.location !== undefined ? overrides.location : (item.location || '')).trim();

  if (!name) throw new Error('Component Name is required.');
  if (!location) throw new Error('Storage Location is required.');

  // Auto-save location if new
  try { await saveLocation({ name: location }); } catch (_) {}

  const finalItem = {
    id: item.id,
    name,
    category: overrides.category || item.category || item.aiData?.category || 'Other',
    partNumber: overrides.partNumber !== undefined ? overrides.partNumber : (item.partNumber || item.aiData?.partNumber || ''),
    location,
    quantity: overrides.quantity !== undefined ? overrides.quantity : (item.quantity !== undefined ? item.quantity : 1),
    lowStockThreshold: overrides.lowStockThreshold !== undefined ? overrides.lowStockThreshold : (item.lowStockThreshold || 0),
    description: overrides.description !== undefined ? overrides.description : (item.description || item.aiData?.description || ''),
    tags: Array.isArray(overrides.tags) ? overrides.tags : (item.tags || item.aiData?.tags || []),
    supplierInfo: overrides.supplierInfo !== undefined ? overrides.supplierInfo : (item.supplierInfo || item.aiData?.supplierInfo || ''),
    datasheetUrl: overrides.datasheetUrl !== undefined ? overrides.datasheetUrl : (item.datasheetUrl || item.aiData?.datasheetUrl || ''),
    notes: overrides.notes !== undefined ? overrides.notes : (item.notes || item.aiData?.notes || ''),
    isFavorite: false,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveItem(finalItem);
  await addHistory({
    itemId: item.id,
    action: 'added',
    notes: `Added via AI Intake Queue (${item.aiData?.modelUsed || 'AI vision'})`,
  });

  // Remove from queue
  queue = queue.filter(i => i.id !== id);
  persistQueue();
  return finalItem;
}

/**
 * Approve all items in the queue that have status === 'ready'
 */
export async function approveAllReady(globalLocation = null) {
  loadQueue();
  const readyItems = queue.filter(i => i.status === 'ready');
  const approved = [];

  for (const item of readyItems) {
    try {
      const loc = (globalLocation && globalLocation.trim()) ? globalLocation.trim() : (item.location || 'Default Storage');
      const saved = await approveQueueItem(item.id, { location: loc });
      approved.push(saved);
    } catch (e) {
      console.error(`[QueueService] Failed to auto-approve ${item.id}:`, e);
    }
  }

  return approved;
}

/**
 * Discard / delete a single item from the queue
 */
export function discardQueueItem(id) {
  loadQueue();
  queue = queue.filter(i => i.id !== id);
  if (queue.length === 0) {
    isProcessing = false;
  }
  persistQueue();
}

/**
 * Clear all items from the queue
 */
export function clearQueue() {
  isProcessing = false;
  queue = [];
  persistQueue();
}

// Initial load & auto-resume queued items
loadQueue();
if (queue.some(i => i.status === 'queued')) {
  processQueue();
}
