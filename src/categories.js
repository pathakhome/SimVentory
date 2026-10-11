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
 * Default item structure.
 */
export function createDefaultItem() {
  return {
    id: '',
    name: '',
    description: '',
    category: 'Other',
    tags: [],
    quantity: 0,
    lowStockThreshold: 0,
    partNumber: '',
    location: '',
    datasheetUrl: '',
    supplierInfo: '',
    notes: '',
    isFavorite: false,
    createdAt: '',
    updatedAt: '',
  };
}
