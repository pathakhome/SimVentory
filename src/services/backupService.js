/**
 * SimVentory — Automated & Periodic Backup Service
 * Supports both central server-side snapshots (Raspberry Pi/Docker)
 * and client-side offline snapshots (IndexedDB SimVentoryBackupsDB).
 */

import { isServerAvailable, exportData, importData } from '../db.js';
import { showToast } from '../toast.js';

const BACKUP_SETTINGS_KEY = 'simventory_backup_settings';
const BACKUPS_DB_NAME = 'SimVentoryBackupsDB';
const BACKUPS_STORE_NAME = 'snapshots';

export const DEFAULT_BACKUP_SETTINGS = {
  enabled: false,
  intervalDays: 1,   // 1 = Daily, 3 = Every 3 days, 7 = Weekly, 30 = Monthly
  maxBackups: 7,     // Number of snapshots to retain
  autoDownload: false, // In browser mode: prompt file download when periodic backup fires
  lastBackupAt: null,
  lastBackupFile: null,
};

let backupsDbInstance = null;

/**
 * Open or create the dedicated backup snapshot IndexedDB database.
 * Completely decoupled from main ComponentVaultDB so database wipes never affect backups.
 */
function openBackupsDB() {
  if (backupsDbInstance) return Promise.resolve(backupsDbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUPS_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(BACKUPS_STORE_NAME)) {
        const store = db.createObjectStore(BACKUPS_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = (e) => {
      backupsDbInstance = e.target.result;
      resolve(backupsDbInstance);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get current backup settings from server (if available) or localStorage.
 */
export async function getBackupSettings() {
  let localSettings = DEFAULT_BACKUP_SETTINGS;
  try {
    const raw = localStorage.getItem(BACKUP_SETTINGS_KEY);
    if (raw) localSettings = { ...DEFAULT_BACKUP_SETTINGS, ...JSON.parse(raw) };
  } catch (_) {}

  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          const merged = { ...localSettings, ...data.settings };
          localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(merged));
          return merged;
        }
      }
    } catch (_) {}
  }

  return localSettings;
}

/**
 * Save backup settings.
 */
export async function saveBackupSettings(updates) {
  const current = await getBackupSettings();
  const merged = { ...current, ...updates };

  try {
    localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(merged));
  } catch (_) {}

  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/backups/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        const data = await res.json();
        return data.settings || merged;
      }
    } catch (_) {}
  }

  return merged;
}

/**
 * Retrieve list of all available backup snapshots.
 */
export async function getBackupsList() {
  if (await isServerAvailable()) {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        return data.backups || [];
      }
    } catch (_) {}
  }

  // Client-side IndexedDB snapshots fallback
  try {
    const db = await openBackupsDB();
    const snapshots = await new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUPS_STORE_NAME, 'readonly');
      const req = tx.objectStore(BACKUPS_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return snapshots
      .map(s => ({
        id: s.id,
        filename: s.filename,
        createdAt: s.createdAt,
        sizeBytes: s.sizeBytes,
        itemsCount: s.itemsCount,
        imagesCount: s.imagesCount,
        isLocal: true,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.warn('[BackupService] Failed loading local backups:', err);
    return [];
  }
}

/**
 * Trigger an immediate backup snapshot.
 */
export async function triggerBackupNow(note = 'manual') {
  if (await isServerAvailable()) {
    const res = await fetch('/api/backups/run', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Server backup failed');
    }
    const data = await res.json();
    return data.backup;
  }

  // Client-side IndexedDB snapshot
  const payload = await exportData();
  const jsonStr = JSON.stringify(payload);
  const sizeBytes = new Blob([jsonStr]).size;
  const now = new Date().toISOString();
  const dateStr = now.replace(/[:.]/g, '-');
  const filename = `simventory-backup-${dateStr}.json`;
  const id = `backup_${Date.now()}`;

  const record = {
    id,
    filename,
    createdAt: now,
    sizeBytes,
    itemsCount: Array.isArray(payload.items) ? payload.items.length : 0,
    imagesCount: Array.isArray(payload.images) ? payload.images.length : 0,
    payload,
    note,
  };

  const db = await openBackupsDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUPS_STORE_NAME, 'readwrite');
    tx.objectStore(BACKUPS_STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Prune local snapshots
  const settings = await getBackupSettings();
  const maxKeep = Number(settings.maxBackups) || 7;
  await pruneLocalBackups(maxKeep);

  // Update last backup timestamp
  await saveBackupSettings({
    lastBackupAt: now,
    lastBackupFile: filename,
  });

  // If user enabled auto-download, download file
  if (settings.autoDownload) {
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename);
  }

  return {
    id,
    filename,
    createdAt: now,
    sizeBytes,
    itemsCount: record.itemsCount,
    imagesCount: record.imagesCount,
    isLocal: true,
  };
}

/**
 * Prune client-side IndexedDB snapshots.
 */
async function pruneLocalBackups(maxKeep) {
  try {
    const db = await openBackupsDB();
    const snapshots = await new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUPS_STORE_NAME, 'readonly');
      const req = tx.objectStore(BACKUPS_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (snapshots.length > maxKeep) {
      snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const toDelete = snapshots.slice(maxKeep);
      const tx = db.transaction(BACKUPS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BACKUPS_STORE_NAME);
      for (const item of toDelete) {
        store.delete(item.id);
      }
    }
  } catch (_) {}
}

/**
 * Download a backup snapshot file to user's computer.
 */
export async function downloadBackup(identifier) {
  if (await isServerAvailable()) {
    // Direct server file download
    const link = document.createElement('a');
    link.href = `/api/backups/download/${encodeURIComponent(identifier)}`;
    link.download = identifier;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  // Client-side snapshot retrieval
  const db = await openBackupsDB();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUPS_STORE_NAME, 'readonly');
    const store = tx.objectStore(BACKUPS_STORE_NAME);
    const req = store.get(identifier);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!record || !record.payload) {
    throw new Error('Local backup snapshot payload not found');
  }

  const blob = new Blob([JSON.stringify(record.payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, record.filename || `simventory-backup-${identifier}.json`);
}

/**
 * Restore an existing snapshot.
 */
export async function restoreBackup(identifier) {
  if (await isServerAvailable()) {
    const res = await fetch(`/api/backups/restore/${encodeURIComponent(identifier)}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Server restore failed');
    }
    const data = await res.json();
    return data;
  }

  // Client-side snapshot restore
  const db = await openBackupsDB();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUPS_STORE_NAME, 'readonly');
    const store = tx.objectStore(BACKUPS_STORE_NAME);
    const req = store.get(identifier);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!record || !record.payload) {
    throw new Error('Local snapshot payload not found');
  }

  await importData(record.payload);
  return { count: record.itemsCount || record.payload.items?.length || 0 };
}

/**
 * Delete a specific backup snapshot.
 */
export async function deleteBackup(identifier) {
  if (await isServerAvailable()) {
    const res = await fetch(`/api/backups/${encodeURIComponent(identifier)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Server deletion failed');
    }
    return true;
  }

  const db = await openBackupsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUPS_STORE_NAME, 'readwrite');
    tx.objectStore(BACKUPS_STORE_NAME).delete(identifier);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Helper to download a Blob as a file.
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Initialize background scheduler in the browser.
 * Checks on app startup if a periodic backup is due and runs it without interrupting the user.
 */
let isSchedulerInitialized = false;

export async function initBackupScheduler() {
  if (isSchedulerInitialized) return;
  isSchedulerInitialized = true;

  async function checkAndRun() {
    try {
      const settings = await getBackupSettings();
      if (!settings.enabled) return;

      const intervalDays = Number(settings.intervalDays) || 1;
      const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
      const lastBackupTime = settings.lastBackupAt ? new Date(settings.lastBackupAt).getTime() : 0;
      const now = Date.now();

      if (now - lastBackupTime >= intervalMs) {
        console.log(`[BackupScheduler] Scheduled backup interval reached (${intervalDays}d). Running backup...`);
        const result = await triggerBackupNow('periodic');
        showToast(`✓ Scheduled backup completed (${result.itemsCount} components)`, 'info');
      }
    } catch (err) {
      console.warn('[BackupScheduler] Auto-backup check warning:', err.message);
    }
  }

  // Check 4 seconds after page load
  setTimeout(checkAndRun, 4000);

  // Check every 30 minutes while tab remains open
  setInterval(checkAndRun, 30 * 60 * 1000);
}
