import { getAllItems, getImage, getCategories } from '../db.js';
import { getCategoryColor, getCategoryIcon } from '../categories.js';

export async function renderDashboard(container, { navigateTo, openItemModal, openScanner, refreshView }) {
  const items = await getAllItems();
  const allCategories = await getCategories();

  const totalItems = items.length;
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const lowStockItems = items.filter(i => i.quantity > 0 && i.quantity <= i.lowStockThreshold);
  const outOfStock = items.filter(i => i.quantity === 0);
  const favoriteCount = items.filter(i => i.isFavorite).length;

  // Category breakdown
  const catCounts = {};
  items.forEach(item => {
    catCounts[item.category] = (catCounts[item.category] || 0) + 1;
  });
  const maxCatCount = Math.max(...Object.values(catCounts), 1);

  // Recent items (last 5 added)
  const recentItems = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  container.innerHTML = `
    <div class="fade-in">
      <div class="view-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your electronics inventory</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" id="dash-quick-queue">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            AI Intake Queue
          </button>
          <button class="btn btn-primary btn-sm" id="dash-quick-add">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            + Add Component
          </button>
        </div>
      </div>

      ${totalItems === 0 ? `
      <div class="empty-state" style="margin-bottom: var(--space-6); background: var(--bg-card); border: 1px dashed var(--border-secondary); border-radius: var(--radius-xl); padding: var(--space-8);">
        <div style="font-size: 2.5rem; margin-bottom: var(--space-2);">⚡</div>
        <h3 style="font-size: var(--font-size-xl); margin-bottom: var(--space-2);">Your Inventory is Ready</h3>
        <p style="max-width: 460px; margin: 0 auto var(--space-5); color: var(--text-secondary); line-height: 1.6;">Start tracking your sensors, ICs, modules, and switches. Add items manually or bulk upload component photos into the AI intake queue.</p>
        <div style="display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary" id="dash-add-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Add Component
          </button>
          <button class="btn btn-secondary" id="dash-queue-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Bulk AI Intake Queue
          </button>
        </div>
      </div>
      ` : ''}

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
          <div class="stat-info">
            <div class="stat-label">Unique Components</div>
            <div class="stat-value">${totalItems}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Quantity</div>
            <div class="stat-value">${totalQuantity}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="stat-info">
            <div class="stat-label">Low Stock</div>
            <div class="stat-value">${lowStockItems.length}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div class="stat-info">
            <div class="stat-label">Favorites</div>
            <div class="stat-value">${favoriteCount}</div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-section">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Category Breakdown
          </div>
          <div class="category-bars" id="dashboard-categories">
            ${allCategories.filter(c => catCounts[c.name]).map(cat => `
              <div class="category-bar-item">
                <span class="category-bar-label">${cat.icon} ${cat.name}</span>
                <div class="category-bar-track">
                  <div class="category-bar-fill" style="width: ${(catCounts[cat.name] / maxCatCount) * 100}%; background: ${cat.color};" data-width="${(catCounts[cat.name] / maxCatCount) * 100}"></div>
                </div>
                <span class="category-bar-count">${catCounts[cat.name]}</span>
              </div>
            `).join('')}
            ${Object.keys(catCounts).length === 0 ? '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">No items yet. Add your first component or scan a barcode!</p>' : ''}
          </div>
        </div>

        <div class="dashboard-section">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Recently Added
          </div>
          <div class="recent-items-list" id="dashboard-recent">
            ${recentItems.length === 0 ? '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">No items yet.</p>' : ''}
          </div>
        </div>

        ${lowStockItems.length > 0 || outOfStock.length > 0 ? `
        <div class="dashboard-section" style="grid-column: 1 / -1;">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Stock Alerts
          </div>
          <div class="low-stock-list">
            ${outOfStock.map(item => `
              <div class="low-stock-item" data-item-id="${item.id}" style="background: var(--color-danger-bg);">
                <span class="low-stock-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </span>
                <div class="low-stock-info">
                  <div class="low-stock-name">${item.name}</div>
                  <div class="low-stock-qty" style="color: var(--color-danger);">Out of stock!</div>
                </div>
              </div>
            `).join('')}
            ${lowStockItems.map(item => `
              <div class="low-stock-item" data-item-id="${item.id}">
                <span class="low-stock-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </span>
                <div class="low-stock-info">
                  <div class="low-stock-name">${item.name}</div>
                  <div class="low-stock-qty">Only ${item.quantity} left (threshold: ${item.lowStockThreshold})</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // Load recent item images
  const recentContainer = document.getElementById('dashboard-recent');
  for (const item of recentItems) {
    const imgBlob = await getImage(item.id);
    const imgSrc = imgBlob ? URL.createObjectURL(imgBlob) : '';
    const el = document.createElement('div');
    el.className = 'recent-item';
    el.dataset.itemId = item.id;
    el.innerHTML = `
      ${imgSrc ? `<img class="recent-item-img" src="${imgSrc}" alt="${item.name}"/>` : `<div class="recent-item-img" style="display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`}
      <div class="recent-item-info">
        <div class="recent-item-name">${item.name}</div>
        <div class="recent-item-meta">${item.category} · Qty: ${item.quantity}</div>
      </div>
    `;
    el.addEventListener('click', () => openItemModal(item.id));
    recentContainer.appendChild(el);
  }

  // Click handlers for low-stock items
  container.querySelectorAll('.low-stock-item[data-item-id]').forEach(el => {
    el.addEventListener('click', () => openItemModal(el.dataset.itemId));
  });

  // Quick action buttons
  const quickAdd = document.getElementById('dash-quick-add');
  if (quickAdd) quickAdd.addEventListener('click', () => navigateTo('add-item'));

  const quickQueue = document.getElementById('dash-quick-queue');
  if (quickQueue) quickQueue.addEventListener('click', () => navigateTo('queue'));

  // Empty state buttons
  const dashAddBtn = document.getElementById('dash-add-btn');
  if (dashAddBtn) {
    dashAddBtn.addEventListener('click', () => navigateTo('add-item'));
  }

  const dashQueueBtn = document.getElementById('dash-queue-btn');
  if (dashQueueBtn) {
    dashQueueBtn.addEventListener('click', () => navigateTo('queue'));
  }

  // Animate category bars
  requestAnimationFrame(() => {
    container.querySelectorAll('.category-bar-fill').forEach(bar => {
      const w = bar.dataset.width;
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        bar.style.width = w + '%';
      });
    });
  });
}
