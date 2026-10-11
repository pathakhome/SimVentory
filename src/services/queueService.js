/**
 * SimVentory — AI Intake Queue Service
 * Manages background processing of bulk component photos, rate-limited AI vision calls,
 * staging persistence, and vault approval.
 */

import { generateId, saveImage, getImage, saveItem, addHistory, getCategories, saveLocation } from '../db.js';
import { analyzeComponentImage } from './aiService.js';

const QUEUE_STORAGE_KEY = 'simventory_ai_intake_queue';

let queue = [];
let isProcessing = false;
let listeners = new Set();

/**
 * Load queue from localStorage on module init
 */
function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    queue = raw ? JSON.parse(raw) : [];
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
export async function addFilesToQueue(files, { defaultLocation = 'Unsorted', defaultQuantity = 1, defaultThreshold = 0 } = {}) {
  loadQueue();
  const newItems = [];

  for (const file of files) {
    const id = generateId();
    // Save image directly to database under item ID
    await saveImage(id, file);

    const item = {
      id,
      fileName: file.name || 'Component Photo',
      fileSize: file.size || 0,
      status: 'queued', // queued | processing | ready | error
      error: null,
      location: defaultLocation,
      quantity: defaultQuantity,
      lowStockThreshold: defaultThreshold,
      aiData: null,
      createdAt: new Date().toISOString(),
    };

    queue.push(item);
    newItems.push(item);
  }

  persistQueue();
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

        const aiResult = await analyzeComponentImage({
          image: imageBlob,
          categories: catNames,
        });

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
        current.status = 'error';
        current.error = err.message || 'AI recognition failed';
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
  persistQueue();
}

/**
 * Clear all items from the queue
 */
export function clearQueue() {
  queue = [];
  persistQueue();
}

// Initial load
loadQueue();
