/**
 * SimVentory — Production Server & API Backend
 * Lightweight, zero-native-compilation Node.js backend.
 * Perfect for Raspberry Pi 4 (ARM64) and standard x86/AMD64 Docker containers.
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testRemoteStorage, uploadToRemoteStorage } from './server/remoteStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'inventory.json');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const DEFAULT_CATEGORIES = [
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

// Load or initialize in-memory database
let db = { items: [], categories: [...DEFAULT_CATEGORIES], locations: [], history: [], settings: {} };

function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(content);
      if (!Array.isArray(db.items)) db.items = [];
      if (!Array.isArray(db.history)) db.history = [];
      if (!Array.isArray(db.categories) || db.categories.length === 0) {
        db.categories = [...DEFAULT_CATEGORIES];
      }
      if (!Array.isArray(db.locations)) db.locations = [];
      if (!db.settings || typeof db.settings !== 'object') db.settings = {};
      console.log(`[SimVentory] Loaded ${db.items.length} items, ${db.categories.length} categories, ${db.locations.length} locations, and server settings.`);
    } catch (err) {
      console.error('[SimVentory] Error reading database file:', err.message);
    }
  } else {
    saveDatabase();
  }
}

// Atomic database file save
function saveDatabase() {
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

loadDatabase();

const app = express();

// Parse JSON payloads up to 50MB (for bulk imports/backups)
app.use(express.json({ limit: '50mb' }));

// Parse raw binary bodies for direct image uploads (up to 20MB)
app.use(express.raw({ type: ['image/*', 'application/octet-stream'], limit: '20mb' }));

// CORS headers for development flexibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging middleware (shows activity in Docker/Portainer logs)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // Keep logs readable by suppressing repetitive 200 OK Docker healthcheck pings
    if (req.path === '/api/health' && res.statusCode === 200) return;
    const duration = Date.now() - start;
    const time = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${time}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ---- REST API Routes ----

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    itemCount: db.items.length,
    timestamp: new Date().toISOString(),
  });
});

// Get all items
app.get('/api/items', (req, res) => {
  res.json(db.items);
});

// Get single item
app.get('/api/items/:id', (req, res) => {
  const item = db.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// Add or update item
app.post('/api/items', (req, res) => {
  const item = req.body;
  if (!item || !item.id || !item.name || !item.location || !String(item.location).trim()) {
    return res.status(400).json({ error: 'Item must have an id, name, and storage location' });
  }

  const existingIndex = db.items.findIndex(i => i.id === item.id);
  if (existingIndex >= 0) {
    db.items[existingIndex] = item;
  } else {
    db.items.push(item);
  }

  saveDatabase();
  recordWorkshopActivity('save_item');
  res.json({ success: true, item });
});

// Delete item
app.delete('/api/items/:id', (req, res) => {
  const id = req.params.id;
  db.items = db.items.filter(i => i.id !== id);
  db.history = db.history.filter(h => h.itemId !== id);

  // Delete associated image file if exists
  deleteImageFile(id);

  saveDatabase();
  recordWorkshopActivity('delete_item');
  res.json({ success: true });
});

// ---- Categories API ----
app.get('/api/categories', (req, res) => {
  res.json(db.categories);
});

app.post('/api/categories', (req, res) => {
  const cat = req.body;
  if (!cat || !cat.name) return res.status(400).json({ error: 'Category name is required' });

  const cleanName = cat.name.trim();
  const oldName = (cat.oldName || '').trim();

  // If renaming an existing category
  if (oldName && oldName.toLowerCase() !== cleanName.toLowerCase()) {
    const oldIndex = db.categories.findIndex(c => c.name.toLowerCase() === oldName.toLowerCase());
    if (oldIndex >= 0) {
      db.categories[oldIndex] = {
        ...db.categories[oldIndex],
        name: cleanName,
        color: cat.color || db.categories[oldIndex].color || '#818cf8',
        icon: cat.icon || db.categories[oldIndex].icon || '📦',
      };
    } else {
      db.categories.push({
        name: cleanName,
        color: cat.color || '#818cf8',
        icon: cat.icon || '📦',
        isDefault: false,
      });
    }

    // Cascade rename to items
    db.items.forEach(i => {
      if ((i.category || '').toLowerCase() === oldName.toLowerCase()) {
        i.category = cleanName;
      }
    });
  } else {
    const index = db.categories.findIndex(c => c.name.toLowerCase() === cleanName.toLowerCase());
    const entry = {
      name: cleanName,
      color: cat.color || '#818cf8',
      icon: cat.icon || '📦',
      isDefault: index >= 0 ? !!db.categories[index].isDefault : false,
    };

    if (index >= 0) {
      db.categories[index] = { ...db.categories[index], ...entry };
    } else {
      db.categories.push(entry);
    }
  }

  saveDatabase();
  res.json({ success: true, categories: db.categories });
});

app.delete('/api/categories/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name).trim();
  if (name.toLowerCase() === 'other') {
    return res.status(400).json({ error: 'Cannot delete the default "Other" category' });
  }

  db.categories = db.categories.filter(c => c.name.toLowerCase() !== name.toLowerCase());
  saveDatabase();
  res.json({ success: true, categories: db.categories });
});

// ---- Storage Locations API ----
app.get('/api/locations', (req, res) => {
  const locMap = new Map();
  (db.locations || []).forEach(l => locMap.set(l.name.toLowerCase(), {
    name: l.name,
    description: l.description || '',
    color: l.color || '#6366f1',
  }));

  // Merge any locations currently assigned to items
  db.items.forEach(i => {
    if (i.location && i.location.trim()) {
      const locName = i.location.trim();
      if (!locMap.has(locName.toLowerCase())) {
        locMap.set(locName.toLowerCase(), { name: locName, description: '', color: '#6366f1' });
      }
    }
  });

  res.json(Array.from(locMap.values()));
});

app.post('/api/locations', (req, res) => {
  const loc = req.body;
  if (!loc || !loc.name) return res.status(400).json({ error: 'Location name is required' });

  const cleanName = loc.name.trim();
  const oldName = (loc.oldName || '').trim();
  const color = (loc.color || '#6366f1').trim();
  const description = (loc.description || '').trim();

  // If renaming an existing location
  if (oldName && oldName.toLowerCase() !== cleanName.toLowerCase()) {
    const oldIndex = (db.locations || []).findIndex(l => l.name.toLowerCase() === oldName.toLowerCase());
    const entry = { name: cleanName, description, color };
    if (oldIndex >= 0) {
      db.locations[oldIndex] = entry;
    } else {
      db.locations.push(entry);
    }

    // Cascade rename to items
    db.items.forEach(i => {
      if ((i.location || '').toLowerCase() === oldName.toLowerCase()) {
        i.location = cleanName;
      }
    });
  } else {
    const index = (db.locations || []).findIndex(l => l.name.toLowerCase() === cleanName.toLowerCase());
    const entry = { name: cleanName, description, color };

    if (index >= 0) {
      db.locations[index] = entry;
    } else {
      db.locations.push(entry);
    }
  }

  saveDatabase();
  res.json({ success: true, locations: db.locations });
});

app.delete('/api/locations/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name).toLowerCase().trim();
  db.locations = (db.locations || []).filter(l => l.name.toLowerCase() !== name);
  saveDatabase();
  res.json({ success: true, locations: db.locations });
});

// Upload image for item
app.post('/api/items/:id/image', (req, res) => {
  const id = req.params.id;
  const contentType = req.headers['content-type'] || 'image/jpeg';
  const ext = getExtensionFromMime(contentType);
  const filePath = path.join(IMAGES_DIR, `${id}.${ext}`);

  // Clean any old image variations for this id
  deleteImageFile(id);

  try {
    fs.writeFileSync(filePath, req.body);

    // Save mime type in metadata file
    const metaPath = path.join(IMAGES_DIR, `${id}.meta`);
    fs.writeFileSync(metaPath, JSON.stringify({ contentType, ext }), 'utf-8');

    res.json({ success: true, imageUrl: `/api/items/${id}/image` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save image: ' + err.message });
  }
});

// Serve image for item
app.get('/api/items/:id/image', (req, res) => {
  const id = req.params.id;
  const imageInfo = findImageFile(id);
  if (!imageInfo) return res.status(404).send('Image not found');

  res.setHeader('Content-Type', imageInfo.contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 1-day cache with ETag
  res.sendFile(imageInfo.filePath);
});

// Delete image for item
app.delete('/api/items/:id/image', (req, res) => {
  const id = req.params.id;
  deleteImageFile(id);
  res.json({ success: true });
});

// Get usage history for item
app.get('/api/history/:itemId', (req, res) => {
  const itemId = req.params.itemId;
  const history = db.history
    .filter(h => h.itemId === itemId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(history);
});

// Add history entry
app.post('/api/history', (req, res) => {
  const entry = req.body;
  if (!entry || !entry.itemId) return res.status(400).json({ error: 'Invalid history entry' });

  entry.id = entry.id || crypto.randomUUID();
  entry.timestamp = entry.timestamp || new Date().toISOString();
  db.history.push(entry);

  saveDatabase();
  recordWorkshopActivity('history_entry');
  res.json({ success: true, entry });
});

// Helper: generate full backup JSON structure
function generateBackupPayload() {
  const images = [];
  for (const item of db.items) {
    const imageInfo = findImageFile(item.id);
    if (imageInfo) {
      try {
        const fileBuf = fs.readFileSync(imageInfo.filePath);
        const base64 = `data:${imageInfo.contentType};base64,${fileBuf.toString('base64')}`;
        images.push({ id: item.id, data: base64 });
      } catch (err) {
        console.error(`Failed reading image for ${item.id}:`, err.message);
      }
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: db.items,
    categories: db.categories,
    locations: db.locations,
    settings: db.settings || {},
    images,
    history: db.history,
  };
}

// Helper: restore database and images from backup payload
function restoreFromPayload(data) {
  if (!data || !Array.isArray(data.items)) {
    throw new Error('Invalid backup data: items array missing');
  }

  // Clear existing images
  if (fs.existsSync(IMAGES_DIR)) {
    const files = fs.readdirSync(IMAGES_DIR);
    for (const file of files) {
      try { fs.unlinkSync(path.join(IMAGES_DIR, file)); } catch (_) {}
    }
  }

  db.items = data.items;
  db.categories = Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : [...DEFAULT_CATEGORIES];
  db.locations = Array.isArray(data.locations) ? data.locations : [];
  db.history = Array.isArray(data.history) ? data.history : [];
  if (data.settings && typeof data.settings === 'object') {
    db.settings = { ...db.settings, ...data.settings };
  }

  // Restore images from base64
  if (Array.isArray(data.images)) {
    for (const img of data.images) {
      if (!img.id || !img.data) continue;
      try {
        const matches = img.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches) {
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const ext = getExtensionFromMime(contentType);
          fs.writeFileSync(path.join(IMAGES_DIR, `${img.id}.${ext}`), buffer);
          fs.writeFileSync(path.join(IMAGES_DIR, `${img.id}.meta`), JSON.stringify({ contentType, ext }));
        }
      } catch (err) {
        console.error(`Failed to restore image ${img.id}:`, err.message);
      }
    }
  }

  saveDatabase();
  return { itemsCount: db.items.length };
}

// Workshop level activity tracker
function recordWorkshopActivity(action = 'change') {
  db.settings = db.settings || {};
  db.settings.backup = db.settings.backup || {};
  db.settings.backup.activityCounter = (db.settings.backup.activityCounter || 0) + 1;

  const backupSettings = db.settings.backup;
  if (backupSettings.activityBased && Number(backupSettings.activityThreshold) > 0) {
    if (db.settings.backup.activityCounter >= Number(backupSettings.activityThreshold)) {
      console.log(`[SimVentory Backup] Workshop activity threshold (${backupSettings.activityThreshold} changes) reached. Running automated backup...`);
      db.settings.backup.activityCounter = 0;
      saveDatabase();
      performServerBackup('activity');
      return;
    }
  }
  saveDatabase();
}

// Helper: perform snapshot save to data/backups/ and sync to remote FTP/SFTP/SMB
function performServerBackup(note = 'auto') {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const payload = generateBackupPayload();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `simventory-backup-${dateStr}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  const stat = fs.statSync(filePath);

  db.settings = db.settings || {};
  db.settings.backup = db.settings.backup || {};
  db.settings.backup.lastBackupAt = payload.exportedAt;
  db.settings.backup.lastBackupFile = filename;
  db.settings.backup.activityCounter = 0; // reset counter after successful backup
  saveDatabase();

  const maxBackups = Number(db.settings.backup.maxBackups) || 7;
  pruneServerBackups(maxBackups);

  // If remote FTP/SFTP/SMB backup is configured and enabled:
  if (db.settings.backup.remote?.enabled && db.settings.backup.remote?.protocol && db.settings.backup.remote?.host) {
    const remoteCfg = db.settings.backup.remote;
    console.log(`[SimVentory Backup] Uploading snapshot to remote ${remoteCfg.protocol.toUpperCase()} server (${remoteCfg.host})...`);
    uploadToRemoteStorage(remoteCfg, filePath, filename, maxBackups)
      .then(() => {
        console.log(`[SimVentory Backup] ✓ Remote ${remoteCfg.protocol.toUpperCase()} upload & prune completed.`);
        db.settings.backup.remote.lastUploadAt = new Date().toISOString();
        db.settings.backup.remote.lastStatus = 'success';
        db.settings.backup.remote.lastError = null;
        saveDatabase();
      })
      .catch((err) => {
        console.error(`[SimVentory Backup] ⚠️ Remote ${remoteCfg.protocol.toUpperCase()} upload error:`, err.message);
        db.settings.backup.remote.lastStatus = 'error';
        db.settings.backup.remote.lastError = err.message;
        saveDatabase();
      });
  }

  return {
    filename,
    sizeBytes: stat.size,
    createdAt: payload.exportedAt,
    itemsCount: payload.items.length,
    imagesCount: payload.images.length,
    note,
  };
}

// Helper: prune old backups exceeding retention limit
function pruneServerBackups(maxKeep = 7) {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('simventory-backup-') && f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fullPath);
        return { filename: f, fullPath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      for (const f of toDelete) {
        try {
          fs.unlinkSync(f.fullPath);
          console.log(`[SimVentory Backup] Rotated old backup snapshot: ${f.filename}`);
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[SimVentory Backup] Backup prune warning:', err.message);
  }
}

// Helper: list server-side snapshots
function listServerBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('simventory-backup-') && f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fullPath);
        let itemsCount = null;
        let imagesCount = null;
        let exportedAt = stat.mtime.toISOString();
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.items)) itemsCount = parsed.items.length;
          if (Array.isArray(parsed.images)) imagesCount = parsed.images.length;
          if (parsed.exportedAt) exportedAt = parsed.exportedAt;
        } catch (_) {}

        return {
          filename: f,
          sizeBytes: stat.size,
          createdAt: exportedAt,
          itemsCount: itemsCount !== null ? itemsCount : db.items.length,
          imagesCount: imagesCount !== null ? imagesCount : 0,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return files;
  } catch (_) {
    return [];
  }
}

// Periodic automated backup check (Interval + User-Decided Time of Day)
function checkPeriodicBackup() {
  try {
    const backupSettings = db.settings?.backup;
    if (!backupSettings || !backupSettings.enabled) return;

    const now = new Date();
    const intervalDays = Number(backupSettings.intervalDays) || 1;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    const lastBackupTime = backupSettings.lastBackupAt ? new Date(backupSettings.lastBackupAt).getTime() : 0;

    // Check if user set a specific preferred time of day (e.g. "02:00")
    if (backupSettings.preferredTime && /^\d{2}:\d{2}$/.test(backupSettings.preferredTime)) {
      const [targetH, targetM] = backupSettings.preferredTime.split(':').map(Number);
      const currentH = now.getHours();
      const currentM = now.getMinutes();

      const lastDateStr = backupSettings.lastBackupAt ? backupSettings.lastBackupAt.slice(0, 10) : '';
      const todayDateStr = now.toISOString().slice(0, 10);

      // If at least intervalDays elapsed or not run on today's scheduled window
      if (now.getTime() - lastBackupTime >= (intervalDays - 0.5) * 24 * 60 * 60 * 1000) {
        if (todayDateStr !== lastDateStr && (currentH > targetH || (currentH === targetH && currentM >= targetM))) {
          console.log(`[SimVentory Backup] Scheduled time (${backupSettings.preferredTime}) reached. Running daily backup...`);
          performServerBackup('scheduled_time');
          return;
        }
      }
    } else {
      // Standard elapsed interval check
      if (now.getTime() - lastBackupTime >= intervalMs) {
        console.log(`[SimVentory Backup] Running periodic backup (${intervalDays} day interval)...`);
        performServerBackup('periodic');
      }
    }
  } catch (err) {
    console.error('[SimVentory Backup] Periodic check error:', err.message);
  }
}

// Export full backup (JSON format with base64 images)
app.get('/api/export', (req, res) => {
  res.json(generateBackupPayload());
});

// Import full backup
app.post('/api/import', (req, res) => {
  try {
    const result = restoreFromPayload(req.body);
    res.json({ success: true, count: result.itemsCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Backups API (Periodic & Snapshots) ----
app.get('/api/backups', (req, res) => {
  const settings = db.settings?.backup || {
    enabled: false,
    intervalDays: 1,
    maxBackups: 7,
    autoDownload: false,
    lastBackupAt: null,
  };
  const backups = listServerBackups();
  res.json({ settings, backups });
});

app.post('/api/backups/settings', (req, res) => {
  const updates = req.body || {};
  db.settings = db.settings || {};
  db.settings.backup = {
    ...(db.settings.backup || { enabled: false, intervalDays: 1, maxBackups: 7, autoDownload: false }),
    ...updates,
  };
  saveDatabase();
  if (db.settings.backup.enabled) {
    setTimeout(checkPeriodicBackup, 1000);
  }
  res.json({ success: true, settings: db.settings.backup });
});

app.post('/api/backups/run', (req, res) => {
  try {
    const record = performServerBackup('manual');
    res.json({ success: true, backup: record });
  } catch (err) {
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

app.get('/api/backups/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(BACKUPS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }
  res.download(filePath, filename);
});

app.post('/api/backups/restore/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(BACKUPS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const result = restoreFromPayload(data);
    res.json({ success: true, count: result.itemsCount, filename });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

app.delete('/api/backups/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(BACKUPS_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return res.json({ success: true, filename });
    } catch (err) {
      return res.status(500).json({ error: 'Delete failed: ' + err.message });
    }
  }
  res.status(404).json({ error: 'Backup file not found' });
});

// Test remote FTP/SFTP/SMB connection and write permission
app.post('/api/backups/test-remote', async (req, res) => {
  try {
    const config = req.body;
    const result = await testRemoteStorage(config);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Clear all data
app.post('/api/clear', (req, res) => {
  db.items = [];
  db.history = [];
  const files = fs.readdirSync(IMAGES_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(IMAGES_DIR, file));
  }
  saveDatabase();
  res.json({ success: true });
});

// ---- Settings API ----
app.get('/api/settings', (req, res) => {
  res.json(db.settings || {});
});

app.post('/api/settings', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Invalid settings object' });
  }

  db.settings = {
    ...(db.settings || {}),
    ...updates,
  };

  saveDatabase();
  res.json({ success: true, settings: db.settings });
});

// AI Proxy endpoint (bypasses browser CORS for local Ollama, LM Studio, or external endpoints)
app.post('/api/ai/proxy', async (req, res) => {
  try {
    const { url, method = 'POST', headers = {}, body } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL provided' });
    }

    const fetchHeaders = { ...headers };
    // Remove host header if forwarded
    delete fetchHeaders['host'];

    const response = await fetch(parsedUrl.toString(), {
      method,
      headers: fetchHeaders,
      body: typeof body === 'object' ? JSON.stringify(body) : body,
    });

    const responseText = await response.text();
    let json = null;
    try {
      json = JSON.parse(responseText);
    } catch (_) {}

    if (!response.ok) {
      return res.status(response.status).json(json || { error: responseText || response.statusText });
    }

    res.json(json || { text: responseText });
  } catch (err) {
    console.error('AI Proxy Error:', err.message);
    res.status(500).json({ error: 'AI proxy request failed: ' + err.message });
  }
});

// Helpers for image files
function getExtensionFromMime(mime) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function findImageFile(id) {
  const metaPath = path.join(IMAGES_DIR, `${id}.meta`);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const filePath = path.join(IMAGES_DIR, `${id}.${meta.ext}`);
      if (fs.existsSync(filePath)) {
        return { filePath, contentType: meta.contentType };
      }
    } catch (e) {}
  }

  // Fallback scan
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'svg'];
  for (const ext of exts) {
    const p = path.join(IMAGES_DIR, `${id}.${ext}`);
    if (fs.existsSync(p)) {
      const mime = ext === 'svg' ? 'image/svg+xml' : (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
      return { filePath: p, contentType: mime };
    }
  }
  return null;
}

function deleteImageFile(id) {
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'meta'];
  for (const ext of exts) {
    const p = path.join(IMAGES_DIR, `${id}.${ext}`);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

// Serve static frontend files from 'dist' in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  console.log(`[SimVentory] Serving static production files from: ${distPath}`);
  app.use(express.static(distPath));

  // SPA fallback for non-API routes in Express 5
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`  ⚡ SimVentory Server Running`);
  console.log(`  📍 Local:   http://localhost:${PORT}`);
  console.log(`  🌐 Network: http://0.0.0.0:${PORT}`);
  console.log(`  💾 Storage: ${DATA_DIR}`);
  console.log(`  📦 Backups: ${BACKUPS_DIR}`);
  console.log(`===============================================`);

  // Start periodic backup ticker (every 15 minutes) and initial check (5s)
  setInterval(checkPeriodicBackup, 15 * 60 * 1000);
  setTimeout(checkPeriodicBackup, 5000);
});
