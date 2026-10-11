/**
 * Item Detail Modal renderer.
 */
import { getItem, getImage, getHistory, deleteItem } from '../db.js';
import { getCategoryColor, getCategoryIcon } from '../categories.js';
import { showToast } from '../toast.js';

/**
 * Open the item detail modal.
 * @param {string} itemId
 * @param {Object} options
 */
export async function openItemDetailModal(itemId, { navigateTo, refreshView }) {
  const item = await getItem(itemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  const imageBlob = await getImage(itemId);
  const imageSrc = imageBlob ? URL.createObjectURL(imageBlob) : null;
  const history = await getHistory(itemId);
  const catColor = getCategoryColor(item.category);
  const catIcon = getCategoryIcon(item.category);

  const modal = document.getElementById('item-modal');
  const modalContent = document.getElementById('item-modal-content');

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">${escapeHtml(item.name)}</h2>
      <button class="modal-close" id="modal-close-btn" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      ${imageSrc ? `<img class="modal-image" src="${imageSrc}" alt="${escapeHtml(item.name)}" />` : ''}

      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Category</div>
          <div class="modal-detail-value" style="color: ${catColor};">${catIcon} ${item.category}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Quantity</div>
          <div class="modal-detail-value">${item.quantity} ${item.quantity <= item.lowStockThreshold && item.quantity > 0 ? '<span style="color: var(--color-warning); font-size: var(--font-size-xs);">⚠ Low</span>' : ''}${item.quantity === 0 ? '<span style="color: var(--color-danger); font-size: var(--font-size-xs);">✕ Out</span>' : ''}</div>
        </div>
        ${item.partNumber ? `
        <div class="modal-detail-item">
          <div class="modal-detail-label">Part Number</div>
          <div class="modal-detail-value">${escapeHtml(item.partNumber)}</div>
        </div>` : ''}
        ${item.location ? `
        <div class="modal-detail-item">
          <div class="modal-detail-label">Location</div>
          <div class="modal-detail-value">📍 ${escapeHtml(item.location)}</div>
        </div>` : ''}
        ${item.supplierInfo ? `
        <div class="modal-detail-item">
          <div class="modal-detail-label">Supplier</div>
          <div class="modal-detail-value">${escapeHtml(item.supplierInfo)}</div>
        </div>` : ''}
        ${item.datasheetUrl ? `
        <div class="modal-detail-item">
          <div class="modal-detail-label">Datasheet</div>
          <div class="modal-detail-value"><a href="${escapeHtml(item.datasheetUrl)}" target="_blank" rel="noopener">Open Datasheet ↗</a></div>
        </div>` : ''}
        ${item.description ? `
        <div class="modal-detail-item full-width">
          <div class="modal-detail-label">Description</div>
          <div class="modal-detail-value">${escapeHtml(item.description)}</div>
        </div>` : ''}
        ${item.tags && item.tags.length > 0 ? `
        <div class="modal-detail-item full-width">
          <div class="modal-detail-label">Tags</div>
          <div class="modal-tags">${item.tags.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>` : ''}
        ${item.notes ? `
        <div class="modal-detail-item full-width">
          <div class="modal-detail-label">Notes</div>
          <div class="modal-detail-value" style="white-space: pre-wrap; font-size: var(--font-size-sm); color: var(--text-secondary);">${escapeHtml(item.notes)}</div>
        </div>` : ''}
      </div>

      ${history.length > 0 ? `
      <div class="usage-history">
        <div class="usage-history-title">History</div>
        ${history.slice(0, 10).map(entry => `
          <div class="usage-entry">
            <span class="usage-dot ${entry.action === 'used' ? 'used' : entry.action === 'restocked' ? 'restocked' : 'added'}"></span>
            <span>${formatAction(entry.action, entry.quantityChange)}</span>
            <span class="usage-date">${formatDate(entry.timestamp)}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary btn-sm" id="modal-edit-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>
      <button class="btn btn-danger btn-sm" id="modal-delete-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Delete
      </button>
    </div>
  `;

  modal.style.display = 'flex';

  // Close modal
  const closeModal = () => {
    modal.style.display = 'none';
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    document.removeEventListener('keydown', escHandler);
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', escHandler);

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Edit
  document.getElementById('modal-edit-btn').addEventListener('click', () => {
    closeModal();
    navigateTo('add-item', { editItemId: itemId });
  });

  // Delete
  document.getElementById('modal-delete-btn').addEventListener('click', async () => {
    if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
      await deleteItem(itemId);
      closeModal();
      showToast('Component deleted', 'info');
      refreshView();
    }
  });
}

function formatAction(action, qty) {
  switch (action) {
    case 'created': return 'Item created';
    case 'updated': return 'Item updated';
    case 'used': return `Used ${Math.abs(qty)} unit${Math.abs(qty) !== 1 ? 's' : ''}`;
    case 'restocked': return `Added ${qty} unit${qty !== 1 ? 's' : ''}`;
    case 'deleted': return 'Item deleted';
    default: return action;
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
