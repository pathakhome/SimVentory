/**
 * Settings view renderer.
 * Provides custom category management, custom storage locations management,
 * appearance preferences, and data backup / restore.
 */
import {
  exportData,
  importData,
  exportCSV,
  getAllItems,
  clearAllData,
  getCategories,
  saveCategory,
  deleteCategory,
  getLocations,
  saveLocation,
  deleteLocation,
} from '../db.js';
import { showToast } from '../toast.js';

export async function renderSettings(container, { refreshView }) {
  const items = await getAllItems();
  const categories = await getCategories();
  const locations = await getLocations();

  const EMOJI_PRESETS = ['🏷️', '🔌', '💡', '🧰', '📟', '🎛️', '🔬', '🪛', '📻', '🔋', '⚡', '🤖'];

  container.innerHTML = `
    <div class="fade-in">
      <div class="view-header">
        <h1>Settings & Preferences</h1>
        <p>Manage custom categories, storage locations, backups, and display options</p>
      </div>

      <!-- Custom Categories Management -->
      <div class="settings-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3>🏷️ Custom Categories</h3>
            <p style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:2px;">
              Create custom categories with personalized icons and accent colors for organizing your DIY parts.
            </p>
          </div>
        </div>

        <!-- Add Category Form -->
        <div style="background:var(--bg-secondary); border:1px solid var(--border-secondary); border-radius:var(--border-radius-lg); padding:16px; margin-bottom:18px;">
          <h4 style="font-size:var(--font-size-sm); font-weight:600; margin-bottom:12px; color:var(--text-primary);">
            + Add New Category
          </h4>
          <form id="add-category-form" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Category Name</label>
              <input type="text" id="new-cat-name" placeholder="e.g., Microcontrollers, Relays" required style="width:100%;" />
            </div>
            <div style="width:70px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Icon</label>
              <input type="text" id="new-cat-icon" value="📦" maxlength="4" style="width:100%; text-align:center; font-size:1.1rem;" />
            </div>
            <div style="width:65px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Color</label>
              <input type="color" id="new-cat-color" value="#818cf8" style="width:100%; height:40px; border-radius:6px; cursor:pointer; padding:2px;" />
            </div>
            <button type="submit" class="btn btn-primary btn-sm" style="height:40px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Category
            </button>
          </form>

          <!-- Emoji quick presets -->
          <div style="display:flex; gap:6px; align-items:center; margin-top:10px; flex-wrap:wrap;">
            <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Quick Icons:</span>
            ${EMOJI_PRESETS.map(e => `
              <button type="button" class="btn-preset-emoji" data-emoji="${e}" style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:4px; padding:2px 6px; font-size:13px; cursor:pointer;">${e}</button>
            `).join('')}
          </div>
        </div>

        <!-- Categories List -->
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:10px;" id="categories-list">
          ${categories.map(cat => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:8px; padding:10px 14px;">
              <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                <span style="font-size:1.25rem;">${cat.icon || '📦'}</span>
                <div style="min-width:0;">
                  <div style="font-weight:600; font-size:var(--font-size-sm); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                    <span>${escapeHtml(cat.name)}</span>
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${cat.color || '#818cf8'}; flex-shrink:0;"></span>
                  </div>
                  <span style="font-size:11px; color:var(--text-tertiary);">${cat.isDefault ? 'Default' : 'Custom'}</span>
                </div>
              </div>
              ${!cat.isDefault && cat.name.toLowerCase() !== 'other' ? `
                <button type="button" class="btn-delete-cat" data-name="${escapeAttr(cat.name)}" title="Delete category" style="background:none; border:none; color:var(--text-tertiary); cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Storage Locations Management -->
      <div class="settings-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3>📍 Custom Storage Locations</h3>
            <p style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:2px;">
              Keep track of which drawer, bin, tackle box, or shelf contains your electronics.
            </p>
          </div>
        </div>

        <!-- Add Location Form -->
        <div style="background:var(--bg-secondary); border:1px solid var(--border-secondary); border-radius:var(--border-radius-lg); padding:16px; margin-bottom:18px;">
          <h4 style="font-size:var(--font-size-sm); font-weight:600; margin-bottom:12px; color:var(--text-primary);">
            + Add New Storage Location
          </h4>
          <form id="add-location-form" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Location Name</label>
              <input type="text" id="new-loc-name" placeholder="e.g., Drawer A1, Bin 4, Shelf 2" required style="width:100%;" />
            </div>
            <div style="flex:1.5; min-width:200px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Description / Notes (Optional)</label>
              <input type="text" id="new-loc-desc" placeholder="e.g., Top acrylic organizer, ESD foam" style="width:100%;" />
            </div>
            <button type="submit" class="btn btn-primary btn-sm" style="height:40px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Location
            </button>
          </form>
        </div>

        <!-- Locations List -->
        ${locations.length === 0 ? `
          <p style="color:var(--text-tertiary); font-size:var(--font-size-sm); padding:12px; background:var(--bg-secondary); border-radius:8px;">
            No storage locations registered yet. Add locations above or type them directly when adding components.
          </p>
        ` : `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px;" id="locations-list">
            ${locations.map(loc => `
              <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:8px; padding:10px 14px;">
                <div style="min-width:0;">
                  <div style="font-weight:600; font-size:var(--font-size-sm); display:flex; align-items:center; gap:6px;">
                    <span>📍</span>
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(loc.name)}</span>
                  </div>
                  ${loc.description ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(loc.description)}</div>` : ''}
                </div>
                <button type="button" class="btn-delete-loc" data-name="${escapeAttr(loc.name)}" title="Delete location" style="background:none; border:none; color:var(--text-tertiary); cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Appearance -->
      <div class="settings-section">
        <h3>🎨 Appearance</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Theme</h4>
            <p>Switch between dark and light mode</p>
          </div>
          <select id="settings-theme" class="toolbar-btn" style="width: auto; min-width: 120px;">
            <option value="dark" ${document.documentElement.dataset.theme !== 'light' ? 'selected' : ''}>🌙 Dark</option>
            <option value="light" ${document.documentElement.dataset.theme === 'light' ? 'selected' : ''}>☀️ Light</option>
          </select>
        </div>
      </div>

      <!-- Data Management -->
      <div class="settings-section">
        <h3>💾 Data Management</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Export as JSON</h4>
            <p>Full backup including component images, custom categories, and locations — ${items.length} item${items.length !== 1 ? 's' : ''}</p>
          </div>
          <button class="btn btn-primary btn-sm" id="export-json-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export JSON
          </button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Export as CSV</h4>
            <p>Spreadsheet-friendly format (components list with stock, SKU, and locations)</p>
          </div>
          <button class="btn btn-primary btn-sm" id="export-csv-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Import from JSON</h4>
            <p>Restore a previous backup (preserves custom categories & images)</p>
          </div>
          <div>
            <input type="file" id="import-file-input" accept=".json" hidden />
            <button class="btn btn-secondary btn-sm" id="import-json-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import JSON
            </button>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="settings-section">
        <h3>⚠️ Danger Zone</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Clear All Components</h4>
            <p>Delete all component inventory records and photos. Categories and locations will be retained.</p>
          </div>
          <button class="btn btn-danger btn-sm" id="clear-all-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear Components
          </button>
        </div>
      </div>

      <!-- About -->
      <div class="settings-section">
        <h3>ℹ️ About</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Simventory</h4>
            <p>Electronics & DIY Inventory Manager — Dockerized for Raspberry Pi 4 & PC.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // ---- Add Category Form Handler ----
  const addCatForm = document.getElementById('add-category-form');
  if (addCatForm) {
    addCatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-cat-name').value.trim();
      const icon = document.getElementById('new-cat-icon').value.trim() || '📦';
      const color = document.getElementById('new-cat-color').value;

      if (!name) {
        showToast('Category name is required', 'warning');
        return;
      }

      try {
        await saveCategory({ name, icon, color });
        showToast(`Category "${name}" created!`, 'success');
        refreshView();
      } catch (err) {
        showToast('Failed to add category: ' + err.message, 'error');
      }
    });
  }

  // Preset Emoji buttons
  container.querySelectorAll('.btn-preset-emoji').forEach(btn => {
    btn.addEventListener('click', () => {
      const iconInput = document.getElementById('new-cat-icon');
      if (iconInput) iconInput.value = btn.dataset.emoji;
    });
  });

  // Delete Category handlers
  container.querySelectorAll('.btn-delete-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!confirm(`Are you sure you want to delete the "${name}" category? Items with this category will remain.`)) {
        return;
      }
      try {
        await deleteCategory(name);
        showToast(`Category "${name}" deleted`, 'info');
        refreshView();
      } catch (err) {
        showToast('Failed to delete category: ' + err.message, 'error');
      }
    });
  });

  // ---- Add Location Form Handler ----
  const addLocForm = document.getElementById('add-location-form');
  if (addLocForm) {
    addLocForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-loc-name').value.trim();
      const description = document.getElementById('new-loc-desc').value.trim();

      if (!name) {
        showToast('Location name is required', 'warning');
        return;
      }

      try {
        await saveLocation({ name, description });
        showToast(`Storage location "${name}" created!`, 'success');
        refreshView();
      } catch (err) {
        showToast('Failed to add location: ' + err.message, 'error');
      }
    });
  }

  // Delete Location handlers
  container.querySelectorAll('.btn-delete-loc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!confirm(`Remove storage location "${name}"? Components using this location will keep their text.`)) {
        return;
      }
      try {
        await deleteLocation(name);
        showToast(`Location "${name}" removed`, 'info');
        refreshView();
      } catch (err) {
        showToast('Failed to delete location: ' + err.message, 'error');
      }
    });
  });

  // Theme toggle
  document.getElementById('settings-theme').addEventListener('change', (e) => {
    const theme = e.target.value;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cv_theme', theme);
    const label = document.querySelector('.theme-label');
    if (label) label.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
  });

  // Export JSON
  document.getElementById('export-json-btn').addEventListener('click', async () => {
    try {
      showToast('Preparing export...', 'info');
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadFile(blob, `simventory-backup-${formatDateFile()}.json`);
      showToast('Backup exported!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  });

  // Export CSV
  document.getElementById('export-csv-btn').addEventListener('click', async () => {
    try {
      const csv = await exportCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      downloadFile(blob, `simventory-${formatDateFile()}.csv`);
      showToast('CSV exported!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  });

  // Import JSON
  const importInput = document.getElementById('import-file-input');
  document.getElementById('import-json-btn').addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;

    if (!confirm('This will replace current inventory items with the backup. Continue?')) {
      importInput.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
      showToast(`Imported ${data.items ? data.items.length : 0} items!`, 'success');
      refreshView();
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
    importInput.value = '';
  });

  // Clear all inventory
  document.getElementById('clear-all-btn').addEventListener('click', async () => {
    if (!confirm('Are you ABSOLUTELY sure? This will delete ALL components, photos, and usage history.')) {
      return;
    }
    try {
      await clearAllData();
      showToast('All inventory items cleared', 'info');
      refreshView();
    } catch (err) {
      showToast('Failed to clear data: ' + err.message, 'error');
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDateFile() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
