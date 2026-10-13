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
let isLoaded = false;
let listeners = new Set();

/**
 * Ensure queue is loaded from localStorage.
 * Only parses from disk once on initialization or when explicitly forced.
 * Auto-recovers any zombie 'processing' items back to 'queued' if not actively processing.
 */
function ensureLoaded(force = false) {
  if (isLoaded && !force && isProcessing) {
    return;
  }
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!isProcessing) {
      let changed = false;
      for (const item of parsed) {
        if (item.status === 'processing') {
          item.status = 'queued';
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(parsed));
      }
    }
    queue = parsed;
    isLoaded = true;
  } catch (e) {
    console.error('[QueueService] Error reading queue from storage:', e);
    queue = [];
    isLoaded = true;
  }
}

/**
 * Calculate current summary statistics from in-memory queue.
 */
function calculateSummary() {
  const total = queue.length;
  const queued = queue.filter(i => i.status === 'queued').length;
  const processing = queue.filter(i => i.status === 'processing').length;
  const ready = queue.filter(i => i.status === 'ready').length;
  const error = queue.filter(i => i.status === 'error').length;
  return { total, queued, processing, ready, error, isProcessing };
}

/**
 * Persist in-memory queue metadata to localStorage and notify all listeners.
 */
function persistQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('[QueueService] Failed to persist queue to localStorage:', e);
  }
  notifyListeners();
}

/**
 * Notify all registered queue listeners with current queue and summary.
 */
function notifyListeners() {
  const summary = calculateSummary();
  listeners.forEach(fn => {
    try {
      fn(queue, summary);
    } catch (e) {
      console.error('[QueueService] Error in queue listener:', e);
    }
  });
}

/**
 * Subscribe to live queue changes.
 */
export function subscribeQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Get current queue items.
 */
export function getQueueItems() {
  ensureLoaded();
  return [...queue];
}

/**
 * Get summary stats for current queue.
 */
export function getQueueSummary() {
  ensureLoaded();
  return calculateSummary();
}

/**
 * Add multiple image files or blobs to the queue.
 */
export async function addFilesToQueue(files, { defaultLocation = 'Unsorted', defaultCondition = 'Unpacked New', defaultHint = '', defaultQuantity = 1, defaultThreshold = 0 } = {}) {
  ensureLoaded();
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

    // Save optimized image directly to IndexedDB under item ID
    await saveImage(id, optimizedBlob);

    const item = {
      id,
      fileName: file.name || 'Component Photo',
      fileSize: optimizedBlob.size || file.size || 0,
      status: 'queued', // queued | processing | ready | error
      error: null,
      location: defaultLocation,
      condition: defaultCondition,
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

export const QUEUE_CONCURRENCY = 3;

/**
 * Start or resume background processing of queued items.
 * Runs up to 3 parallel recognition workers concurrently.
 */
export async function processQueue() {
  if (isProcessing) return;
  ensureLoaded();

  // Safety check: recover any zombie 'processing' items to 'queued' before starting
  for (const item of queue) {
    if (item.status === 'processing') {
      item.status = 'queued';
    }
  }

  const hasQueued = queue.some(i => i.status === 'queued');
  if (!hasQueued) {
    isProcessing = false;
    notifyListeners();
    return;
  }

  isProcessing = true;
  notifyListeners();

  try {
    const categories = await getCategories();
    const catNames = categories.map(c => c.name);

    async function worker() {
      while (true) {
        // Atomically claim the next queued item synchronously before any await
        const target = queue.find(i => i.status === 'queued');
        if (!target) break;

        const itemId = target.id;
        target.status = 'processing';
        target.error = null;
        persistQueue();

        try {
          const imageBlob = await getImage(itemId);
          if (!imageBlob) {
            throw new Error('Image data not found in storage.');
          }

          // 45-second per-item safety timeout so worker never deadlocks
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI analysis timed out after 45 seconds')), 45000)
          );

          const aiResult = await Promise.race([
            analyzeComponentImage({
              image: imageBlob,
              categories: catNames,
              hint: target.hint || '',
            }),
            timeoutPromise,
          ]);

          // Look up the live item in queue by ID
          const liveItem = queue.find(i => i.id === itemId);
          if (!liveItem) {
            // Item was discarded or queue cleared while AI was running
            continue;
          }

          liveItem.status = 'ready';
          liveItem.aiData = aiResult;
          liveItem.name = aiResult.name || 'Electronic Component';
          liveItem.category = aiResult.category || 'Other';
          liveItem.condition = aiResult.condition || liveItem.condition || 'Unpacked New';
          liveItem.quantity = (aiResult.estimatedQuantity || aiResult.quantity) || liveItem.quantity || 1;
          liveItem.partNumber = aiResult.partNumber || '';
          liveItem.description = aiResult.description || '';
          liveItem.tags = Array.isArray(aiResult.tags) ? aiResult.tags : [];
          liveItem.notes = aiResult.notes || '';
          liveItem.supplierInfo = aiResult.supplierInfo || '';
          liveItem.datasheetUrl = aiResult.datasheetUrl || '';
          liveItem.error = null;
        } catch (err) {
          console.error(`[QueueService] Error processing item ${itemId}:`, err);
          const liveItem = queue.find(i => i.id === itemId);
          if (liveItem) {
            liveItem.status = 'error';
            liveItem.error = err.message || 'AI recognition failed';
          }
        }

        persistQueue();
        // Brief pause between items per worker
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // Launch 3 workers concurrently
    const workers = [];
    for (let i = 0; i < QUEUE_CONCURRENCY; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  } finally {
    isProcessing = false;
    persistQueue();
  }
}

/**
 * Retry a failed queue item.
 */
export async function retryQueueItem(id) {
  ensureLoaded();
  const item = queue.find(i => i.id === id);
  if (item) {
    item.status = 'queued';
    item.error = null;
    persistQueue();
    processQueue();
  }
}

/**
 * Update editable fields of a queued item.
 * @param {string} id
 * @param {Object} updates
 * @param {Object} options { silent: boolean }
 */
export function updateQueueItem(id, updates, { silent = false } = {}) {
  ensureLoaded();
  const item = queue.find(i => i.id === id);
  if (item) {
    Object.assign(item, updates);
    if (silent) {
      try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      } catch (e) {
        console.error('[QueueService] Error silently saving queue:', e);
      }
    } else {
      persistQueue();
    }
  }
}

/**
 * Approve a single queued item into the main inventory.
 */
export async function approveQueueItem(id, overrides = {}) {
  ensureLoaded();
  const item = queue.find(i => i.id === id);
  if (!item) throw new Error('Queue item not found');

  const name = (overrides.name !== undefined ? overrides.name : (item.name || item.aiData?.name || '')).trim();
  const location = (overrides.location !== undefined ? overrides.location : (item.location || '')).trim();

  if (!name) throw new Error('Component Name is required.');
  if (!location) throw new Error('Storage Location is required.');

  // Auto-save location if new
  try {
    await saveLocation({ name: location });
  } catch (_) {}

  const finalItem = {
    id: item.id,
    name,
    category: overrides.category || item.category || item.aiData?.category || 'Other',
    condition: overrides.condition !== undefined ? overrides.condition : (item.condition || item.aiData?.condition || 'Unpacked New'),
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
 * Approve all items in the queue that have status === 'ready'.
 */
export async function approveAllReady(globalLocation = null) {
  ensureLoaded();
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
 * Discard / delete a single item from the queue.
 */
export function discardQueueItem(id) {
  ensureLoaded();
  queue = queue.filter(i => i.id !== id);
  if (queue.length === 0) {
    isProcessing = false;
  }
  persistQueue();
}

/**
 * Clear all items from the queue.
 */
export function clearQueue() {
  isProcessing = false;
  queue = [];
  persistQueue();
}

// Initial load & auto-resume queued items
ensureLoaded();
if (queue.some(i => i.status === 'queued')) {
  processQueue();
}
