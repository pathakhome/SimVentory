import { getAllItems, getImage, saveItem, addHistory, getCategories, getLocations, saveLocation } from '../db.js';
import { getCategoryColor, getCategoryIcon, getConditionMeta, ITEM_CONDITIONS, getLocationColor } from '../categories.js';
import { showToast } from '../toast.js';

let cachedImageURLs = {};

export async function renderInventory(container, { navigateTo, openItemModal, refreshView }) {
  let items = await getAllItems();
  const categories = await getCategories();
  let locations = await getLocations();

  const selectedItemIds = new Set();

  // Get saved preferences
  const viewMode = localStorage.getItem('cv_viewMode') || 'grid';
  let activeCategory = localStorage.getItem('cv_filterCategory') || 'All';
  let activeLocation = localStorage.getItem('cv_filterLocation') || 'All';
  const sortBy = localStorage.getItem('cv_sortBy') || 'name';

  // Sanitize stale category/location filters if they no longer exist
  if (activeCategory !== 'All' && activeCategory !== 'Favorites' && !categories.some(c => c.name.toLowerCase() === activeCategory.toLowerCase())) {
    activeCategory = 'All';
    localStorage.setItem('cv_filterCategory', 'All');
  }
  if (activeLocation !== 'All' && !locations.some(l => l.name.toLowerCase() === activeLocation.toLowerCase())) {
    activeLocation = 'All';
    localStorage.setItem('cv_filterLocation', 'All');
  }

  container.innerHTML = `
    <div class="fade-in">
      <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h1>Inventory</h1>
          <p>${items.length} component${items.length !== 1 ? 's' : ''} in your collection</p>
        </div>
        <button class="btn btn-primary btn-sm" id="inventory-add-item-btn" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          + Add Item
        </button>
      </div>

      <div class="inventory-toolbar">
        <div class="search-wrapper">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="search-input" id="inventory-search" placeholder="Search components..." autocomplete="off" />
        </div>
        <div class="toolbar-controls">
          <select class="toolbar-btn" id="inventory-location" style="appearance:none; cursor:pointer;" title="Filter by storage location">
            <option value="All" ${activeLocation === 'All' ? 'selected' : ''}>📍 All Locations</option>
            ${locations.map(loc => `<option value="${escapeHtml(loc.name)}" ${activeLocation === loc.name ? 'selected' : ''}>📍 ${escapeHtml(loc.name)}</option>`).join('')}
          </select>
          <select class="toolbar-btn" id="inventory-condition-filter" style="appearance:none; cursor:pointer;" title="Filter by condition">
            <option value="All">✨ All Conditions</option>
            ${ITEM_CONDITIONS.map(c => `<option value="${escapeHtml(c)}">${getConditionMeta(c).icon} ${escapeHtml(c)}</option>`).join('')}
          </select>
          <select class="toolbar-btn" id="inventory-sort" style="appearance:none; cursor:pointer;">
            <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Name A-Z</option>
            <option value="name-desc" ${sortBy === 'name-desc' ? 'selected' : ''}>Name Z-A</option>
            <option value="qty-asc" ${sortBy === 'qty-asc' ? 'selected' : ''}>Qty: Low → High</option>
            <option value="qty-desc" ${sortBy === 'qty-desc' ? 'selected' : ''}>Qty: High → Low</option>
            <option value="newest" ${sortBy === 'newest' ? 'selected' : ''}>Newest First</option>
            <option value="oldest" ${sortBy === 'oldest' ? 'selected' : ''}>Oldest First</option>
          </select>
          <div class="view-toggle">
            <button class="view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}" data-mode="grid" id="view-grid-btn" title="Grid view">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button class="view-toggle-btn ${viewMode === 'list' ? 'active' : ''}" data-mode="list" id="view-list-btn" title="List view">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="filter-pills" id="filter-pills">
        <button class="filter-pill ${activeCategory === 'All' ? 'active' : ''}" data-category="All">All</button>
        <button class="filter-pill ${activeCategory === 'Favorites' ? 'active' : ''}" data-category="Favorites">⭐ Favorites</button>
        ${categories.map(cat => `
          <button class="filter-pill ${activeCategory === cat.name ? 'active' : ''}" data-category="${cat.name}">${cat.icon || '📦'} ${cat.name}</button>
        `).join('')}
      </div>

      <div id="items-container"></div>

      <!-- Floating Batch Actions Bar -->
      <div id="batch-actions-bar" class="batch-actions-bar" style="display:none;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="batch-badge" id="batch-selected-count">0</span>
          <span style="font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary);">selected</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="btn-batch-move" style="background: linear-gradient(135deg, #6366f1, #4f46e5); border: none; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(99,102,241,0.3);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Move
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-batch-category" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); border: none; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(139,92,246,0.3);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Change Category
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-batch-condition" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); border: none; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(14,165,233,0.3);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Change Condition
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-batch-select-all">
            Select All Filtered
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-batch-clear" title="Clear selection">
            ✕ Clear
          </button>
        </div>
      </div>

      <!-- Batch Move Modal Dialog -->
      <div id="batch-move-modal" class="modal-overlay" style="display:none;">
        <div class="modal-content" style="max-width: 480px; border-radius: var(--border-radius-lg); overflow: hidden;">
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-primary);">
            <h2 class="modal-title" style="font-size: var(--font-size-lg); font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>📍</span> Move Components
            </h2>
            <button class="modal-close" id="batch-move-modal-close" aria-label="Close" style="background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 18px;">✕</button>
          </div>
          <div class="modal-body" style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">
              Relocating <strong id="batch-move-count-text" style="color: var(--accent-primary);">0</strong> selected components to a new storage location.
            </div>
            
            <div>
              <label for="batch-move-dest-input" style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-primary); display: block; margin-bottom: 6px;">
                Destination Storage Location <span class="required" style="color: var(--accent-danger);">*</span>
              </label>
              <input type="text" id="batch-move-dest-input" list="batch-move-locations-datalist" placeholder="e.g. Drawer A1, Bin 3, Shelf 2" required style="width: 100%; padding: 8px 12px; font-size: var(--font-size-sm); border-radius: var(--border-radius-md); border: 1px solid var(--border-secondary); background: var(--bg-card); color: var(--text-primary);" />
              <datalist id="batch-move-locations-datalist">
                ${locations.map(l => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`).join('')}
              </datalist>
            </div>

            <div id="batch-move-chips-wrapper" style="${locations.length === 0 ? 'display:none;' : ''}">
              <span style="font-size: 11px; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Or click an existing location:</span>
              <div id="batch-move-chips-container" style="display: flex; gap: 6px; flex-wrap: wrap; max-height: 80px; overflow-y: auto;">
                ${locations.map(l => `
                  <button type="button" class="btn-location-chip" data-loc="${escapeAttr(l.name)}" style="font-size: 11.5px; padding: 3px 8px; border-radius: 99px; background: var(--bg-secondary); border: 1px solid var(--border-secondary); color: var(--text-secondary); cursor: pointer; transition: all 0.15s ease;">
                    📍 ${escapeHtml(l.name)}
                  </button>
                `).join('')}
              </div>
            </div>

            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Items to relocate:</span>
              <div id="batch-move-items-preview" style="max-height: 120px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary);">
              </div>
            </div>
          </div>

          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary);">
            <button type="button" class="btn btn-secondary" id="batch-move-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="batch-move-confirm-btn" style="background: linear-gradient(135deg, #6366f1, #4f46e5); border: none;">
              Confirm Move
            </button>
          </div>
        </div>
      </div>

      <!-- Batch Category Modal Dialog -->
      <div id="batch-category-modal" class="modal-overlay" style="display:none;">
        <div class="modal-content" style="max-width: 480px; border-radius: var(--border-radius-lg); overflow: hidden;">
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-primary);">
            <h2 class="modal-title" style="font-size: var(--font-size-lg); font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>🏷️</span> Change Category
            </h2>
            <button class="modal-close" id="batch-category-modal-close" aria-label="Close" style="background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 18px;">✕</button>
          </div>
          <div class="modal-body" style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">
              Updating category for <strong id="batch-category-count-text" style="color: var(--accent-primary);">0</strong> selected components.
            </div>
            
            <div>
              <label for="batch-category-select" style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-primary); display: block; margin-bottom: 6px;">
                New Category <span class="required" style="color: var(--accent-danger);">*</span>
              </label>
              <select id="batch-category-select" required style="width: 100%; padding: 8px 12px; font-size: var(--font-size-sm); border-radius: var(--border-radius-md); border: 1px solid var(--border-secondary); background: var(--bg-card); color: var(--text-primary);">
                <option value="">-- Choose Category --</option>
                ${categories.map(c => `<option value="${escapeHtml(c.name)}">${c.icon || '📦'} ${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>

            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Or click a category chip:</span>
              <div id="batch-category-chips-container" style="display: flex; gap: 6px; flex-wrap: wrap; max-height: 100px; overflow-y: auto;">
                ${categories.map(c => `
                  <button type="button" class="btn-batch-cat-chip" data-cat="${escapeAttr(c.name)}" style="font-size: 11.5px; padding: 4px 10px; border-radius: 99px; background: var(--bg-secondary); border: 1px solid var(--border-secondary); color: var(--text-secondary); cursor: pointer; transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 4px;">
                    <span>${c.icon || '📦'}</span> <span>${escapeHtml(c.name)}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Items to update:</span>
              <div id="batch-category-items-preview" style="max-height: 120px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary);">
              </div>
            </div>
          </div>

          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary);">
            <button type="button" class="btn btn-secondary" id="batch-category-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="batch-category-confirm-btn" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); border: none;">
              Apply Category
            </button>
          </div>
        </div>
      </div>

      <!-- Batch Condition Modal Dialog -->
      <div id="batch-condition-modal" class="modal-overlay" style="display:none;">
        <div class="modal-content" style="max-width: 480px; border-radius: var(--border-radius-lg); overflow: hidden;">
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-primary);">
            <h2 class="modal-title" style="font-size: var(--font-size-lg); font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>✨</span> Change Condition
            </h2>
            <button class="modal-close" id="batch-condition-modal-close" aria-label="Close" style="background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 18px;">✕</button>
          </div>
          <div class="modal-body" style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
            <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">
              Updating condition for <strong id="batch-condition-count-text" style="color: var(--accent-primary);">0</strong> selected components.
            </div>
            
            <div>
              <label for="batch-condition-select" style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-primary); display: block; margin-bottom: 6px;">
                New Condition <span class="required" style="color: var(--accent-danger);">*</span>
              </label>
              <select id="batch-condition-select" required style="width: 100%; padding: 8px 12px; font-size: var(--font-size-sm); border-radius: var(--border-radius-md); border: 1px solid var(--border-secondary); background: var(--bg-card); color: var(--text-primary);">
                <option value="">-- Choose Condition --</option>
                ${ITEM_CONDITIONS.map(c => {
                  const meta = getConditionMeta(c);
                  return `<option value="${escapeHtml(c)}">${meta.icon} ${escapeHtml(c)}</option>`;
                }).join('')}
              </select>
            </div>

            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Or click a condition badge:</span>
              <div id="batch-condition-chips-container" style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${ITEM_CONDITIONS.map(c => {
                  const meta = getConditionMeta(c);
                  return `
                    <button type="button" class="btn-batch-cond-chip" data-cond="${escapeAttr(c)}" style="font-size: 11.5px; padding: 5px 12px; border-radius: 99px; background: ${meta.bg}; border: 1px solid ${meta.border}; color: ${meta.color}; font-weight: 600; cursor: pointer; transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 5px;">
                      <span>${meta.icon}</span> <span>${escapeHtml(c)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Items to update:</span>
              <div id="batch-condition-items-preview" style="max-height: 120px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary);">
              </div>
            </div>
          </div>

          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary);">
            <button type="button" class="btn btn-secondary" id="batch-condition-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="batch-condition-confirm-btn" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); border: none;">
              Apply Condition
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const addItemBtn = document.getElementById('inventory-add-item-btn');
  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => navigateTo('add-item'));
  }

  const searchInput = document.getElementById('inventory-search');
  const sortSelect = document.getElementById('inventory-sort');
  const locationSelect = document.getElementById('inventory-location');
  const conditionSelect = document.getElementById('inventory-condition-filter');
  const itemsContainer = document.getElementById('items-container');

  // Pre-load all images
  cachedImageURLs = {};
  for (const item of items) {
    const blob = await getImage(item.id);
    if (blob) {
      cachedImageURLs[item.id] = URL.createObjectURL(blob);
    }
  }

  function getFilteredItems() {
    let filtered = [...items];
    const query = searchInput.value.toLowerCase().trim();
    const category = localStorage.getItem('cv_filterCategory') || 'All';
    const location = locationSelect.value;
    const condition = conditionSelect ? conditionSelect.value : 'All';
    const sort = sortSelect.value;

    // Filter by category
    if (category === 'Favorites') {
      filtered = filtered.filter(i => i.isFavorite);
    } else if (category !== 'All') {
      filtered = filtered.filter(i => (i.category || '').toLowerCase() === category.toLowerCase());
    }

    // Filter by location
    if (location !== 'All') {
      filtered = filtered.filter(i => (i.location || '').toLowerCase() === location.toLowerCase());
    }

    // Filter by condition
    if (condition !== 'All') {
      filtered = filtered.filter(i => (i.condition || 'Unpacked New').toLowerCase() === condition.toLowerCase());
    }

    // Filter by search
    if (query) {
      filtered = filtered.filter(i =>
        i.name.toLowerCase().includes(query) ||
        (i.description || '').toLowerCase().includes(query) ||
        (i.category || '').toLowerCase().includes(query) ||
        (i.partNumber || '').toLowerCase().includes(query) ||
        (i.location || '').toLowerCase().includes(query) ||
        (i.tags || []).some(t => t.toLowerCase().includes(query))
      );
    }

    // Sort
    switch (sort) {
      case 'name': filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': filtered.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'qty-asc': filtered.sort((a, b) => a.quantity - b.quantity); break;
      case 'qty-desc': filtered.sort((a, b) => b.quantity - a.quantity); break;
      case 'newest': filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
      case 'oldest': filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
    }

    localStorage.setItem('cv_sortBy', sort);
    localStorage.setItem('cv_filterLocation', location);
    return filtered;
  }

  function renderItems() {
    const filtered = getFilteredItems();
    const mode = localStorage.getItem('cv_viewMode') || 'grid';

    if (filtered.length === 0) {
      itemsContainer.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          <h3>${searchInput.value ? 'No matches found' : 'No components yet'}</h3>
          <p>${searchInput.value ? 'Try a different search term' : 'Add your first electronic component to get started'}</p>
          ${!searchInput.value ? '<button class="btn btn-primary" id="empty-add-btn">Add Component</button>' : ''}
        </div>
      `;
      const emptyBtn = document.getElementById('empty-add-btn');
      if (emptyBtn) emptyBtn.addEventListener('click', () => navigateTo('add-item'));
      updateBatchBar();
      return;
    }

    if (mode === 'grid') {
      itemsContainer.innerHTML = `<div class="items-grid">${filtered.map(item => renderGridCard(item)).join('')}</div>`;
    } else {
      const isAllChecked = filtered.length > 0 && filtered.every(i => selectedItemIds.has(i.id));
      itemsContainer.innerHTML = `
        <div class="items-list">
          <div class="item-list-row header">
            <span><input type="checkbox" id="select-all-header-checkbox" ${isAllChecked ? 'checked' : ''} title="Select all filtered items" style="width:18px; height:18px; cursor:pointer;" /></span>
            <span></span>
            <span>Name</span>
            <span>Category</span>
            <span>Condition</span>
            <span>Location</span>
            <span>Qty</span>
            <span>Fav</span>
            <span>Actions</span>
          </div>
          ${filtered.map(item => renderListRow(item)).join('')}
        </div>
      `;
    }

    // Attach event listeners
    attachItemListeners();
    updateBatchBar();
  }

  function renderGridCard(item) {
    const imgSrc = cachedImageURLs[item.id] || '';
    const catColor = getCategoryColor(item.category, categories);
    const condMeta = getConditionMeta(item.condition);
    const locColor = getLocationColor(item.location, locations);
    const qtyClass = item.quantity === 0 ? 'out' : (item.quantity <= item.lowStockThreshold ? 'low' : '');
    const isSelected = selectedItemIds.has(item.id);

    return `
      <div class="item-card ${isSelected ? 'is-selected' : ''}" data-item-id="${item.id}">
        <div class="item-card-image">
          <input type="checkbox" class="item-select-checkbox" data-select-id="${item.id}" ${isSelected ? 'checked' : ''} title="Select item" />
          ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(item.name)}" loading="lazy"/>` : `
            <svg class="placeholder-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          `}
          <button class="item-card-duplicate" data-dup-id="${item.id}" title="Duplicate this component (different condition / location)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="item-card-favorite ${item.isFavorite ? 'active' : ''}" data-fav-id="${item.id}" title="Toggle favorite">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${item.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        </div>
        <div class="item-card-body">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
            <select class="card-inline-select card-inline-cat" data-item-id="${item.id}" title="Quick edit category" style="background: ${catColor}18; color: ${catColor}; border-color: ${catColor}55;">
              ${categories.map(c => `<option value="${escapeHtml(c.name)}" ${item.category === c.name ? 'selected' : ''}>${c.icon || '📦'} ${escapeHtml(c.name)}</option>`).join('')}
            </select>
            <select class="card-inline-select card-inline-cond" data-item-id="${item.id}" title="Quick edit condition" style="background: ${condMeta.bg}; color: ${condMeta.color}; border-color: ${condMeta.color}55;">
              ${ITEM_CONDITIONS.map(c => {
                const cm = getConditionMeta(c);
                return `<option value="${escapeHtml(c)}" ${(item.condition || 'Unpacked New') === c ? 'selected' : ''}>${cm.icon} ${escapeHtml(c)}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="item-card-name">${escapeHtml(item.name)}</div>
          <div class="item-card-location" style="display:flex; align-items:center; gap:6px; margin: 4px 0 6px 0;">
            <span style="font-size:12px; color: ${locColor};">📍</span>
            <select class="card-inline-select card-inline-loc" data-item-id="${item.id}" title="Quick edit location" style="background: ${locColor}18; color: ${locColor}; border-color: ${locColor}55; flex: 1;">
              ${!locations.some(l => l.name === item.location) ? `<option value="${escapeHtml(item.location || '')}" selected>${escapeHtml(item.location || 'Assign Location')}</option>` : ''}
              ${locations.map(loc => `<option value="${escapeHtml(loc.name)}" ${item.location === loc.name ? 'selected' : ''}>📍 ${escapeHtml(loc.name)}</option>`).join('')}
            </select>
          </div>
          <div class="item-card-desc">${escapeHtml(item.description || 'No description')}</div>
          <div class="item-card-footer">
            <div class="item-qty">
              <span class="item-qty-label">Qty:</span>
              <span class="item-qty-value ${qtyClass}">${item.quantity}</span>
            </div>
            <div class="item-qty-controls">
              <button class="qty-btn minus" data-qty-id="${item.id}" data-qty-action="decrease" title="Use one">−</button>
              <button class="qty-btn plus" data-qty-id="${item.id}" data-qty-action="increase" title="Add one">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderListRow(item) {
    const imgSrc = cachedImageURLs[item.id] || '';
    const catColor = getCategoryColor(item.category, categories);
    const condMeta = getConditionMeta(item.condition);
    const locColor = getLocationColor(item.location, locations);
    const qtyClass = item.quantity === 0 ? 'out' : (item.quantity <= item.lowStockThreshold ? 'low' : '');
    const isSelected = selectedItemIds.has(item.id);

    return `
      <div class="item-list-row ${isSelected ? 'is-selected' : ''}" data-item-id="${item.id}">
        <input type="checkbox" class="item-select-checkbox-list" data-select-id="${item.id}" ${isSelected ? 'checked' : ''} title="Select item" style="width:18px; height:18px; cursor:pointer;" />
        ${imgSrc ? `<img class="item-list-img" src="${imgSrc}" alt="${escapeHtml(item.name)}"/>` : `<div class="item-list-img" style="display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>`}
        <span class="item-list-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <select class="card-inline-select card-inline-cat" data-item-id="${item.id}" title="Quick edit category" style="background: ${catColor}18; color: ${catColor}; border-color: ${catColor}55;">
          ${categories.map(c => `<option value="${escapeHtml(c.name)}" ${item.category === c.name ? 'selected' : ''}>${c.icon || '📦'} ${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <select class="card-inline-select card-inline-cond" data-item-id="${item.id}" title="Quick edit condition" style="background: ${condMeta.bg}; color: ${condMeta.color}; border-color: ${condMeta.color}55;">
          ${ITEM_CONDITIONS.map(c => {
            const cm = getConditionMeta(c);
            return `<option value="${escapeHtml(c)}" ${(item.condition || 'Unpacked New') === c ? 'selected' : ''}>${cm.icon} ${escapeHtml(c)}</option>`;
          }).join('')}
        </select>
        <select class="card-inline-select card-inline-loc" data-item-id="${item.id}" title="Quick edit location" style="background: ${locColor}18; color: ${locColor}; border-color: ${locColor}55;">
          ${!locations.some(l => l.name === item.location) ? `<option value="${escapeHtml(item.location || '')}" selected>${escapeHtml(item.location || 'Assign Location')}</option>` : ''}
          ${locations.map(loc => `<option value="${escapeHtml(loc.name)}" ${item.location === loc.name ? 'selected' : ''}>📍 ${escapeHtml(loc.name)}</option>`).join('')}
        </select>
        <span class="item-list-qty item-qty-value ${qtyClass}">${item.quantity}</span>
        <span class="item-list-dup" data-dup-id="${item.id}" title="Duplicate component (new condition/location)" style="cursor: pointer; color: var(--text-tertiary); display: flex; align-items: center; padding: 4px; border-radius: 4px; transition: color 0.15s ease;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </span>
        <span class="item-list-fav ${item.isFavorite ? 'active' : ''}" data-fav-id="${item.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${item.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </span>
        <div class="item-qty-controls">
          <button class="qty-btn minus" data-qty-id="${item.id}" data-qty-action="decrease" title="Use one">−</button>
          <button class="qty-btn plus" data-qty-id="${item.id}" data-qty-action="increase" title="Add one">+</button>
        </div>
      </div>
    `;
  }

  function updateBatchBar() {
    const bar = document.getElementById('batch-actions-bar');
    const countBadge = document.getElementById('batch-selected-count');
    const selectAllBtn = document.getElementById('btn-batch-select-all');

    if (bar) {
      bar.style.display = selectedItemIds.size > 0 ? 'flex' : 'none';
    }
    if (countBadge) {
      countBadge.textContent = selectedItemIds.size;
    }
    if (selectAllBtn) {
      const filtered = getFilteredItems();
      const isAll = filtered.length > 0 && filtered.every(i => selectedItemIds.has(i.id));
      selectAllBtn.textContent = isAll ? 'Deselect All' : 'Select All Filtered';
    }

    // Update row/card styles and checkboxes
    container.querySelectorAll('.item-card, .item-list-row:not(.header)').forEach(el => {
      const id = el.dataset.itemId;
      const isSelected = selectedItemIds.has(id);
      el.classList.toggle('is-selected', isSelected);
      const chk = el.querySelector('.item-select-checkbox, .item-select-checkbox-list');
      if (chk) chk.checked = isSelected;
    });

    const selectAllHeader = container.querySelector('#select-all-header-checkbox');
    if (selectAllHeader) {
      const filtered = getFilteredItems();
      selectAllHeader.checked = filtered.length > 0 && filtered.every(i => selectedItemIds.has(i.id));
    }
  }

  function attachItemListeners() {
    // Card/row click → open detail (ignore clicks on checkboxes and buttons)
    container.querySelectorAll('.item-card, .item-list-row:not(.header)').forEach(el => {
      el.addEventListener('click', (e) => {
        if (
          e.target.closest('.qty-btn') ||
          e.target.closest('.item-card-favorite') ||
          e.target.closest('.item-list-fav') ||
          e.target.closest('.item-card-duplicate') ||
          e.target.closest('.item-list-dup') ||
          e.target.closest('.item-select-checkbox') ||
          e.target.closest('.item-select-checkbox-list') ||
          e.target.closest('.card-inline-select')
        ) return;
        openItemModal(el.dataset.itemId);
      });
    });

    // Checkboxes click
    container.querySelectorAll('.item-select-checkbox, .item-select-checkbox-list').forEach(chk => {
      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = chk.dataset.selectId;
        if (chk.checked) {
          selectedItemIds.add(id);
        } else {
          selectedItemIds.delete(id);
        }
        updateBatchBar();
      });
    });

    // Header Select All Checkbox
    const selectAllHeader = container.querySelector('#select-all-header-checkbox');
    if (selectAllHeader) {
      selectAllHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const filtered = getFilteredItems();
        if (selectAllHeader.checked) {
          filtered.forEach(i => selectedItemIds.add(i.id));
        } else {
          filtered.forEach(i => selectedItemIds.delete(i.id));
        }
        updateBatchBar();
      });
    }

    // Inline quick edit: Category
    container.querySelectorAll('.card-inline-cat').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const id = sel.dataset.itemId;
        const item = items.find(i => i.id === id);
        if (!item) return;
        const oldVal = item.category;
        const newVal = sel.value;
        if (oldVal === newVal) return;
        item.category = newVal;
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        await addHistory(id, 'category_changed', `Category updated from "${oldVal}" to "${newVal}"`);
        showToast(`Category updated to "${newVal}"`, 'success');
        renderItems();
      });
    });

    // Inline quick edit: Condition
    container.querySelectorAll('.card-inline-cond').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const id = sel.dataset.itemId;
        const item = items.find(i => i.id === id);
        if (!item) return;
        const oldVal = item.condition || 'Unpacked New';
        const newVal = sel.value;
        if (oldVal === newVal) return;
        item.condition = newVal;
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        await addHistory(id, 'condition_changed', `Condition updated to "${newVal}"`);
        showToast(`Condition updated to "${newVal}"`, 'success');
        renderItems();
      });
    });

    // Inline quick edit: Location
    container.querySelectorAll('.card-inline-loc').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const id = sel.dataset.itemId;
        const item = items.find(i => i.id === id);
        if (!item) return;
        const oldVal = item.location || 'None';
        const newVal = sel.value;
        if (oldVal === newVal) return;
        item.location = newVal;
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        await addHistory(id, 'moved', `Moved from "${oldVal}" to "${newVal}"`);
        showToast(`Moved to "${newVal}"`, 'success');
        renderItems();
      });
    });

    // Quantity buttons
    container.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.qtyId;
        const action = btn.dataset.qtyAction;
        const item = items.find(i => i.id === id);
        if (!item) return;

        if (action === 'decrease' && item.quantity <= 0) return;

        item.quantity = action === 'increase' ? item.quantity + 1 : item.quantity - 1;
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        await addHistory(id, action === 'increase' ? 'restocked' : 'used', action === 'increase' ? 1 : -1);
        renderItems();
      });
    });

    // Favorite toggle
    container.querySelectorAll('[data-fav-id]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.favId;
        const item = items.find(i => i.id === id);
        if (!item) return;
        item.isFavorite = !item.isFavorite;
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        renderItems();
      });
    });

    // Duplicate component click
    container.querySelectorAll('[data-dup-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.dupId;
        if (id && navigateTo) {
          navigateTo('add-item', { cloneItemId: id });
        }
      });
    });
  }

  // Batch actions bar buttons
  const btnBatchMove = document.getElementById('btn-batch-move');
  if (btnBatchMove) {
    btnBatchMove.addEventListener('click', () => {
      openBatchMoveModal();
    });
  }

  const btnBatchCategory = document.getElementById('btn-batch-category');
  if (btnBatchCategory) {
    btnBatchCategory.addEventListener('click', () => {
      openBatchCategoryModal();
    });
  }

  const btnBatchCondition = document.getElementById('btn-batch-condition');
  if (btnBatchCondition) {
    btnBatchCondition.addEventListener('click', () => {
      openBatchConditionModal();
    });
  }

  const btnBatchSelectAll = document.getElementById('btn-batch-select-all');
  if (btnBatchSelectAll) {
    btnBatchSelectAll.addEventListener('click', () => {
      const filtered = getFilteredItems();
      const isAll = filtered.length > 0 && filtered.every(i => selectedItemIds.has(i.id));
      if (isAll) {
        filtered.forEach(i => selectedItemIds.delete(i.id));
      } else {
        filtered.forEach(i => selectedItemIds.add(i.id));
      }
      updateBatchBar();
    });
  }

  const btnBatchClear = document.getElementById('btn-batch-clear');
  if (btnBatchClear) {
    btnBatchClear.addEventListener('click', () => {
      selectedItemIds.clear();
      updateBatchBar();
    });
  }

  // Batch Move Modal Handling
  function openBatchMoveModal() {
    if (selectedItemIds.size === 0) return;
    const modal = document.getElementById('batch-move-modal');
    if (!modal) return;

    const countText = document.getElementById('batch-move-count-text');
    if (countText) countText.textContent = selectedItemIds.size;

    const input = document.getElementById('batch-move-dest-input');
    if (input) input.value = '';

    // Selected items preview
    const previewContainer = document.getElementById('batch-move-items-preview');
    if (previewContainer) {
      const selectedItems = items.filter(i => selectedItemIds.has(i.id));
      previewContainer.innerHTML = selectedItems.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <span style="font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.name)}</span>
          <span style="font-size:11px; color:var(--text-tertiary); white-space:nowrap;">📍 ${escapeHtml(item.location || 'Unsorted')}</span>
        </div>
      `).join('');
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      input?.focus();
    }, 60);
  }

  function closeBatchMoveModal() {
    const modal = document.getElementById('batch-move-modal');
    if (modal) modal.style.display = 'none';
  }

  document.getElementById('batch-move-modal-close')?.addEventListener('click', closeBatchMoveModal);
  document.getElementById('batch-move-cancel-btn')?.addEventListener('click', closeBatchMoveModal);
  document.getElementById('batch-move-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'batch-move-modal') closeBatchMoveModal();
  });

  // Location chip click inside modal
  container.querySelectorAll('.btn-location-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const loc = chip.dataset.loc;
      const input = document.getElementById('batch-move-dest-input');
      if (input) {
        input.value = loc;
        input.focus();
      }
    });
  });

  // Confirm move button
  document.getElementById('batch-move-confirm-btn')?.addEventListener('click', async () => {
    const destInput = document.getElementById('batch-move-dest-input');
    const newLocation = (destInput?.value || '').trim();

    if (!newLocation) {
      showToast('Destination storage location is required', 'warning');
      destInput?.focus();
      return;
    }

    const count = selectedItemIds.size;
    showToast(`Relocating ${count} component${count !== 1 ? 's' : ''} to "${newLocation}"...`, 'info');

    try {
      await saveLocation({ name: newLocation });

      for (const id of selectedItemIds) {
        const item = items.find(i => i.id === id);
        if (item) {
          item.location = newLocation;
          item.updatedAt = new Date().toISOString();
          await saveItem(item);
          await addHistory(item.id, 'moved', 0);
        }
      }

      selectedItemIds.clear();
      closeBatchMoveModal();
      showToast(`✓ Successfully moved ${count} component${count !== 1 ? 's' : ''} to "${newLocation}"!`, 'success');

      // Refresh locations list & items
      locations = await getLocations();
      items = await getAllItems();
      updateLocationSelect();
      renderItems();
    } catch (err) {
      console.error('Batch move error:', err);
      showToast('Failed to move components: ' + err.message, 'error');
    }
  });

  // Batch Category Modal Handling
  function openBatchCategoryModal() {
    if (selectedItemIds.size === 0) return;
    const modal = document.getElementById('batch-category-modal');
    if (!modal) return;

    const countText = document.getElementById('batch-category-count-text');
    if (countText) countText.textContent = selectedItemIds.size;

    const select = document.getElementById('batch-category-select');
    if (select) select.value = '';

    container.querySelectorAll('.btn-batch-cat-chip').forEach(c => {
      c.style.borderColor = 'var(--border-secondary)';
      c.style.background = 'var(--bg-secondary)';
    });

    const previewContainer = document.getElementById('batch-category-items-preview');
    if (previewContainer) {
      const selectedItems = items.filter(i => selectedItemIds.has(i.id));
      previewContainer.innerHTML = selectedItems.map(item => {
        const catColor = getCategoryColor(item.category, categories);
        const catIcon = getCategoryIcon(item.category, categories);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span style="font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.name)}</span>
            <span style="font-size:11px; color:${catColor}; white-space:nowrap;">${catIcon} ${escapeHtml(item.category || 'Uncategorized')}</span>
          </div>
        `;
      }).join('');
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      select?.focus();
    }, 60);
  }

  function closeBatchCategoryModal() {
    const modal = document.getElementById('batch-category-modal');
    if (modal) modal.style.display = 'none';
  }

  document.getElementById('batch-category-modal-close')?.addEventListener('click', closeBatchCategoryModal);
  document.getElementById('batch-category-cancel-btn')?.addEventListener('click', closeBatchCategoryModal);
  document.getElementById('batch-category-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'batch-category-modal') closeBatchCategoryModal();
  });

  // Category chip click inside modal
  container.querySelectorAll('.btn-batch-cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      const select = document.getElementById('batch-category-select');
      if (select) {
        select.value = cat;
      }
      container.querySelectorAll('.btn-batch-cat-chip').forEach(c => {
        const isMatch = c.dataset.cat === cat;
        c.style.borderColor = isMatch ? 'var(--accent-primary)' : 'var(--border-secondary)';
        c.style.background = isMatch ? 'var(--accent-primary-dim, rgba(99,102,241,0.15))' : 'var(--bg-secondary)';
      });
    });
  });

  document.getElementById('batch-category-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    container.querySelectorAll('.btn-batch-cat-chip').forEach(c => {
      const isMatch = c.dataset.cat === val;
      c.style.borderColor = isMatch ? 'var(--accent-primary)' : 'var(--border-secondary)';
      c.style.background = isMatch ? 'var(--accent-primary-dim, rgba(99,102,241,0.15))' : 'var(--bg-secondary)';
    });
  });

  // Confirm category change button
  document.getElementById('batch-category-confirm-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('batch-category-select');
    const newCategory = (select?.value || '').trim();

    if (!newCategory) {
      showToast('Please select a category', 'warning');
      select?.focus();
      return;
    }

    const count = selectedItemIds.size;
    showToast(`Updating category for ${count} component${count !== 1 ? 's' : ''} to "${newCategory}"...`, 'info');

    try {
      for (const id of selectedItemIds) {
        const item = items.find(i => i.id === id);
        if (item) {
          item.category = newCategory;
          item.updatedAt = new Date().toISOString();
          await saveItem(item);
          await addHistory(item.id, 'updated', 0);
        }
      }

      selectedItemIds.clear();
      closeBatchCategoryModal();
      showToast(`✓ Successfully updated category to "${newCategory}" for ${count} component${count !== 1 ? 's' : ''}!`, 'success');

      items = await getAllItems();
      renderItems();
    } catch (err) {
      console.error('Batch category update error:', err);
      showToast('Failed to update category: ' + err.message, 'error');
    }
  });

  // Batch Condition Modal Handling
  function openBatchConditionModal() {
    if (selectedItemIds.size === 0) return;
    const modal = document.getElementById('batch-condition-modal');
    if (!modal) return;

    const countText = document.getElementById('batch-condition-count-text');
    if (countText) countText.textContent = selectedItemIds.size;

    const select = document.getElementById('batch-condition-select');
    if (select) select.value = '';

    container.querySelectorAll('.btn-batch-cond-chip').forEach(c => {
      c.style.boxShadow = 'none';
    });

    const previewContainer = document.getElementById('batch-condition-items-preview');
    if (previewContainer) {
      const selectedItems = items.filter(i => selectedItemIds.has(i.id));
      previewContainer.innerHTML = selectedItems.map(item => {
        const meta = getConditionMeta(item.condition);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span style="font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.name)}</span>
            <span style="font-size:11px; padding:2px 7px; border-radius:99px; background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border}; font-weight:600; white-space:nowrap;">${meta.icon} ${escapeHtml(item.condition || 'Unpacked New')}</span>
          </div>
        `;
      }).join('');
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      select?.focus();
    }, 60);
  }

  function closeBatchConditionModal() {
    const modal = document.getElementById('batch-condition-modal');
    if (modal) modal.style.display = 'none';
  }

  document.getElementById('batch-condition-modal-close')?.addEventListener('click', closeBatchConditionModal);
  document.getElementById('batch-condition-cancel-btn')?.addEventListener('click', closeBatchConditionModal);
  document.getElementById('batch-condition-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'batch-condition-modal') closeBatchConditionModal();
  });

  // Condition chip click inside modal
  container.querySelectorAll('.btn-batch-cond-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cond = chip.dataset.cond;
      const select = document.getElementById('batch-condition-select');
      if (select) {
        select.value = cond;
      }
      container.querySelectorAll('.btn-batch-cond-chip').forEach(c => {
        c.style.boxShadow = c.dataset.cond === cond ? '0 0 0 2px var(--accent-primary)' : 'none';
      });
    });
  });

  document.getElementById('batch-condition-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    container.querySelectorAll('.btn-batch-cond-chip').forEach(c => {
      c.style.boxShadow = c.dataset.cond === val ? '0 0 0 2px var(--accent-primary)' : 'none';
    });
  });

  // Confirm condition change button
  document.getElementById('batch-condition-confirm-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('batch-condition-select');
    const newCondition = (select?.value || '').trim();

    if (!newCondition) {
      showToast('Please select a condition', 'warning');
      select?.focus();
      return;
    }

    const count = selectedItemIds.size;
    showToast(`Updating condition for ${count} component${count !== 1 ? 's' : ''} to "${newCondition}"...`, 'info');

    try {
      for (const id of selectedItemIds) {
        const item = items.find(i => i.id === id);
        if (item) {
          item.condition = newCondition;
          item.updatedAt = new Date().toISOString();
          await saveItem(item);
          await addHistory(item.id, 'updated', 0);
        }
      }

      selectedItemIds.clear();
      closeBatchConditionModal();
      showToast(`✓ Successfully updated condition to "${newCondition}" for ${count} component${count !== 1 ? 's' : ''}!`, 'success');

      items = await getAllItems();
      renderItems();
    } catch (err) {
      console.error('Batch condition update error:', err);
      showToast('Failed to update condition: ' + err.message, 'error');
    }
  });

  function updateLocationSelect() {
    const curVal = locationSelect.value;
    locationSelect.innerHTML = `
      <option value="All" ${curVal === 'All' ? 'selected' : ''}>📍 All Locations</option>
      ${locations.map(loc => `<option value="${escapeHtml(loc.name)}" ${curVal === loc.name ? 'selected' : ''}>📍 ${escapeHtml(loc.name)}</option>`).join('')}
    `;

    // Also update datalist for modal
    const datalist = document.getElementById('batch-move-locations-datalist');
    if (datalist) {
      datalist.innerHTML = locations.map(l => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`).join('');
    }
  }

  // Event listeners
  searchInput.addEventListener('input', renderItems);
  sortSelect.addEventListener('change', renderItems);
  locationSelect.addEventListener('change', renderItems);
  conditionSelect?.addEventListener('change', renderItems);

  // Category filter pills
  document.getElementById('filter-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    localStorage.setItem('cv_filterCategory', pill.dataset.category);
    renderItems();
  });

  // View toggle
  document.getElementById('view-grid-btn').addEventListener('click', () => {
    localStorage.setItem('cv_viewMode', 'grid');
    document.getElementById('view-grid-btn').classList.add('active');
    document.getElementById('view-list-btn').classList.remove('active');
    renderItems();
  });
  document.getElementById('view-list-btn').addEventListener('click', () => {
    localStorage.setItem('cv_viewMode', 'list');
    document.getElementById('view-list-btn').classList.add('active');
    document.getElementById('view-grid-btn').classList.remove('active');
    renderItems();
  });

  // Initial render
  renderItems();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
