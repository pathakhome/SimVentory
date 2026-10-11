import { getAllItems, getImage, saveItem, addHistory, getCategories, getLocations } from '../db.js';
import { getCategoryColor, getCategoryIcon } from '../categories.js';

let cachedImageURLs = {};

export async function renderInventory(container, { navigateTo, openItemModal, refreshView }) {
  const items = await getAllItems();
  const categories = await getCategories();
  const locations = await getLocations();

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
      <div class="view-header">
        <h1>Inventory</h1>
        <p>${items.length} component${items.length !== 1 ? 's' : ''} in your collection</p>
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
    </div>
  `;

  const searchInput = document.getElementById('inventory-search');
  const sortSelect = document.getElementById('inventory-sort');
  const locationSelect = document.getElementById('inventory-location');
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
      return;
    }

    if (mode === 'grid') {
      itemsContainer.innerHTML = `<div class="items-grid">${filtered.map(item => renderGridCard(item)).join('')}</div>`;
    } else {
      itemsContainer.innerHTML = `
        <div class="items-list">
          <div class="item-list-row header">
            <span></span>
            <span>Name</span>
            <span>Category</span>
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
  }

  function renderGridCard(item) {
    const imgSrc = cachedImageURLs[item.id] || '';
    const catColor = getCategoryColor(item.category, categories);
    const catIcon = getCategoryIcon(item.category, categories);
    const qtyClass = item.quantity === 0 ? 'out' : (item.quantity <= item.lowStockThreshold ? 'low' : '');

    return `
      <div class="item-card" data-item-id="${item.id}">
        <div class="item-card-image">
          ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(item.name)}" loading="lazy"/>` : `
            <svg class="placeholder-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          `}
          <button class="item-card-favorite ${item.isFavorite ? 'active' : ''}" data-fav-id="${item.id}" title="Toggle favorite">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${item.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        </div>
        <div class="item-card-body">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
            <span class="item-card-category" style="background: ${catColor}20; color: ${catColor};">${catIcon} ${item.category}</span>
            ${item.location ? `<span style="font-size:var(--font-size-xs); color:var(--text-tertiary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;" title="${escapeHtml(item.location)}">📍 ${escapeHtml(item.location)}</span>` : ''}
          </div>
          <div class="item-card-name">${escapeHtml(item.name)}</div>
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
    const catIcon = getCategoryIcon(item.category, categories);
    const qtyClass = item.quantity === 0 ? 'out' : (item.quantity <= item.lowStockThreshold ? 'low' : '');

    return `
      <div class="item-list-row" data-item-id="${item.id}">
        ${imgSrc ? `<img class="item-list-img" src="${imgSrc}" alt="${escapeHtml(item.name)}"/>` : `<div class="item-list-img" style="display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>`}
        <span class="item-list-name">${escapeHtml(item.name)}</span>
        <span class="item-list-category" style="color: ${catColor};">${catIcon} ${item.category}</span>
        <span class="item-list-location">${escapeHtml(item.location || '—')}</span>
        <span class="item-list-qty item-qty-value ${qtyClass}">${item.quantity}</span>
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

  function attachItemListeners() {
    // Card/row click → open detail
    container.querySelectorAll('.item-card, .item-list-row:not(.header)').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.qty-btn') || e.target.closest('.item-card-favorite') || e.target.closest('.item-list-fav')) return;
        openItemModal(el.dataset.itemId);
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
  }

  // Event listeners
  searchInput.addEventListener('input', renderItems);
  sortSelect.addEventListener('change', renderItems);
  locationSelect.addEventListener('change', renderItems);

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
