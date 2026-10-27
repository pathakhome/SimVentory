/**
 * SimVentory — Default Item Settings Service
 * Manages default presets for new components (Location, Supplier, Category, Condition, etc.)
 * Synced across localStorage and backend server database (/api/settings).
 */

const STORAGE_KEY = 'cv_item_defaults';

export const DEFAULT_ITEM_PRESETS = {
  autoApply: true,            // Automatically preselect defaults on new item forms
  location: '',               // Default storage location (e.g. "Drawer A1")
  supplierInfo: '',           // Default supplier / distributor (e.g. "Robu.in")
  category: 'Other',          // Default category
  condition: 'Unpacked New',  // Default component condition
  lowStockThreshold: 0,       // Default reorder threshold
  quantity: 1,                // Default starting quantity
};

/**
 * Retrieve saved item defaults from localStorage (synchronous).
 * @returns {typeof DEFAULT_ITEM_PRESETS}
 */
export function getItemDefaults() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ITEM_PRESETS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ITEM_PRESETS, ...parsed };
  } catch (_) {
    return { ...DEFAULT_ITEM_PRESETS };
  }
}

/**
 * Fetch defaults from server (/api/settings) and hydrate localStorage.
 * If server has no itemDefaults yet but local does, auto-seed the server.
 * @returns {Promise<typeof DEFAULT_ITEM_PRESETS>}
 */
export async function fetchItemDefaults() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data && data.itemDefaults && typeof data.itemDefaults === 'object') {
        const serverMerged = { ...DEFAULT_ITEM_PRESETS, ...data.itemDefaults };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverMerged));
        return serverMerged;
      } else {
        // Server has no itemDefaults yet. If local has customized settings, sync them up!
        const local = getItemDefaults();
        if (local.location || local.supplierInfo || local.category !== 'Other' || local.condition !== 'Unpacked New') {
          saveItemDefaults(local).catch(() => {});
        }
      }
    }
  } catch (_) {
    // Server offline / dev mode — fallback to localStorage
  }
  return getItemDefaults();
}

/**
 * Save updated item defaults to localStorage and server database.
 * @param {Partial<typeof DEFAULT_ITEM_PRESETS>} updates
 * @returns {Promise<typeof DEFAULT_ITEM_PRESETS>}
 */
export async function saveItemDefaults(updates) {
  const merged = { ...getItemDefaults(), ...updates };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (_) {}

  // Sync to central server database
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemDefaults: merged }),
    });
  } catch (err) {
    console.warn('[ItemDefaultsService] Failed to sync defaults to server:', err.message);
  }

  return merged;
}
