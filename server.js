/**
 * SimVentory — Production Server & API Backend
 * Lightweight, zero-native-compilation Node.js backend.
 * Perfect for Raspberry Pi 4 (ARM64) and standard x86/AMD64 Docker containers.
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const DB_FILE = path.join(DATA_DIR, 'inventory.json');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

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
  if (!item || !item.id || !item.name) {
    return res.status(400).json({ error: 'Item must have an id and a name' });
  }

  const existingIndex = db.items.findIndex(i => i.id === item.id);
  if (existingIndex >= 0) {
    db.items[existingIndex] = item;
  } else {
    db.items.push(item);
  }

  saveDatabase();
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
  const index = db.categories.findIndex(c => c.name.toLowerCase() === cleanName.toLowerCase());
  const entry = {
    name: cleanName,
    color: cat.color || '#818cf8',
    icon: cat.icon || '📦',
    isDefault: false,
  };

  if (index >= 0) {
    db.categories[index] = { ...db.categories[index], ...entry };
  } else {
    db.categories.push(entry);
  }

  saveDatabase();
  res.json({ success: true, category: entry, categories: db.categories });
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
  (db.locations || []).forEach(l => locMap.set(l.name.toLowerCase(), l));

  // Merge any locations currently assigned to items
  db.items.forEach(i => {
    if (i.location && i.location.trim()) {
      const locName = i.location.trim();
      if (!locMap.has(locName.toLowerCase())) {
        locMap.set(locName.toLowerCase(), { name: locName, description: '' });
      }
    }
  });

  res.json(Array.from(locMap.values()));
});

app.post('/api/locations', (req, res) => {
  const loc = req.body;
  if (!loc || !loc.name) return res.status(400).json({ error: 'Location name is required' });

  const cleanName = loc.name.trim();
  const index = (db.locations || []).findIndex(l => l.name.toLowerCase() === cleanName.toLowerCase());
  const entry = {
    name: cleanName,
    description: (loc.description || '').trim(),
  };

  if (index >= 0) {
    db.locations[index] = entry;
  } else {
    db.locations.push(entry);
  }

  saveDatabase();
  res.json({ success: true, location: entry, locations: db.locations });
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
  res.json({ success: true, entry });
});

// Export full backup (JSON format with base64 images)
app.get('/api/export', (req, res) => {
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

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    items: db.items,
    categories: db.categories,
    locations: db.locations,
    settings: db.settings || {},
    images,
    history: db.history,
  });
});

// Import full backup
app.post('/api/import', (req, res) => {
  const data = req.body;
  if (!data || !Array.isArray(data.items)) {
    return res.status(400).json({ error: 'Invalid backup data' });
  }

  // Clear existing images
  const files = fs.readdirSync(IMAGES_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(IMAGES_DIR, file));
  }

  db.items = data.items;
  db.categories = Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : [...DEFAULT_CATEGORIES];
  db.locations = Array.isArray(data.locations) ? data.locations : [];
  db.history = Array.isArray(data.history) ? data.history : [];
  if (data.settings && typeof data.settings === 'object') {
    db.settings = data.settings;
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
  res.json({ success: true, count: db.items.length });
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
  console.log(`===============================================`);
});
