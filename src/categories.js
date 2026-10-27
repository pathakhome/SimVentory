/**
 * Category definitions with colors and icons.
 * Supports default electronics categories and user-defined custom categories.
 */

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

export let CATEGORIES = [...DEFAULT_CATEGORIES];

export function setCategories(list) {
  if (Array.isArray(list) && list.length > 0) {
    CATEGORIES = list;
  }
}

/**
 * Get category color by name.
 */
export function getCategoryColor(name, customList = null) {
  const list = customList || CATEGORIES;
  const cat = list.find(c => c.name.toLowerCase() === (name || '').toLowerCase());
  return cat ? cat.color : '#94a3b8';
}

/**
 * Get category icon by name.
 */
export function getCategoryIcon(name, customList = null) {
  const list = customList || CATEGORIES;
  const cat = list.find(c => c.name.toLowerCase() === (name || '').toLowerCase());
  return cat ? cat.icon : '🔧';
}

/**
 * Storage location colors and helpers.
 */
export const DEFAULT_LOCATION_COLOR = '#6366f1';
export const LOCATION_COLOR_PRESETS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#ef4444', // Red
  '#64748b', // Slate
];

/**
 * Get location color by name from a locations array.
 */
export function getLocationColor(name, locationsList = []) {
  if (!name) return DEFAULT_LOCATION_COLOR;
  const clean = String(name).trim().toLowerCase();
  const loc = (locationsList || []).find(l => (l.name || '').trim().toLowerCase() === clean);
  return loc?.color || DEFAULT_LOCATION_COLOR;
}

/**
 * Component Condition definitions and metadata.
 */
export const ITEM_CONDITIONS = [
  'Unpacked New',
  'Unpacked Used',
  'Partially Working',
  'Packed',
  'Damaged',
];

export const DEFAULT_CONDITION = 'Unpacked New';

/**
 * Get visual metadata (icon, color, background) for an item condition.
 */
export function getConditionMeta(condition) {
  switch (condition) {
    case 'Unpacked New':
      return { label: 'Unpacked New', icon: '✨', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
    case 'Unpacked Used':
      return { label: 'Unpacked Used', icon: '🔄', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
    case 'Partially Working':
      return { label: 'Partially Working', icon: '⚠️', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
    case 'Packed':
      return { label: 'Packed', icon: '📦', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.15)' };
    case 'Damaged':
      return { label: 'Damaged', icon: '✕', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
    default:
      return { label: condition || 'Unpacked New', icon: '✨', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
  }
}

/**
 * Default item structure.
 * @param {Object} [customDefaults]
 */
export function createDefaultItem(customDefaults = {}) {
  return {
    id: '',
    name: '',
    description: '',
    category: customDefaults.category || 'Other',
    condition: customDefaults.condition || DEFAULT_CONDITION,
    tags: Array.isArray(customDefaults.tags) ? [...customDefaults.tags] : [],
    quantity: customDefaults.quantity !== undefined ? customDefaults.quantity : 0,
    lowStockThreshold: customDefaults.lowStockThreshold !== undefined ? customDefaults.lowStockThreshold : 0,
    partNumber: customDefaults.partNumber || '',
    location: customDefaults.location || '',
    usedIn: '',
    datasheetUrl: '',
    supplierInfo: customDefaults.supplierInfo || '',
    notes: '',
    isFavorite: false,
    createdAt: '',
    updatedAt: '',
  };
}
