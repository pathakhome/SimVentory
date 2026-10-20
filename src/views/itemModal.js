/**
 * Item Detail Modal renderer.
 */
import { getItem, getImage, getHistory, deleteItem, saveItem, addHistory, getCategories, getLocations, saveLocation } from '../db.js';
import { getCategoryColor, getCategoryIcon, getConditionMeta, getLocationColor } from '../categories.js';
import { showToast } from '../toast.js';
import { getAISettings, analyzeComponentImage } from '../services/aiService.js';
import { openAIReviewModal } from './aiReviewModal.js';

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
  const locations = await getLocations();
  const catColor = getCategoryColor(item.category);
  const catIcon = getCategoryIcon(item.category);
  const condMeta = getConditionMeta(item.condition);
  const locColor = getLocationColor(item.location, locations);

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
      ${imageSrc ? `
        <div style="margin-bottom: 14px; border-radius: var(--border-radius-md); overflow: hidden; border: 1px solid var(--border-secondary); background: var(--bg-card); box-shadow: var(--shadow-sm);">
          <div style="position: relative;">
            <img class="modal-image" src="${imageSrc}" alt="${escapeHtml(item.name)}" style="margin-bottom: 0; width: 100%; display: block; max-height: 260px; object-fit: contain; background: #000;" />
          </div>
          <!-- AI Analysis Card Bar with Hint Box -->
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08)); border-top: 1px solid var(--border-primary); flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 190px; background: var(--bg-primary); padding: 6px 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-secondary);">
              <span style="font-size: 11.5px; color: var(--accent-primary); font-weight: 600; white-space: nowrap;">💡 AI Hint:</span>
              <input type="text" id="modal-ai-hint-input" placeholder="Optional clue (e.g. SMD 0805, 3.3V LDO, ESP32)..." style="width: 100%; border: none; background: transparent; font-size: 11.5px; color: var(--text-primary); outline: none; padding: 1px 0;" title="Optional clue passed to AI to improve identification" />
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="modal-ai-analyze-btn" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; font-size: var(--font-size-xs); font-weight: 600; padding: 7px 14px; white-space: nowrap; box-shadow: 0 2px 8px rgba(99,102,241,0.35);">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              AI Re-analyze
            </button>
          </div>
        </div>
      ` : ''}

      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <div class="modal-detail-label">Category</div>
          <div class="modal-detail-value" style="color: ${catColor};">${catIcon} ${item.category}</div>
        </div>
        <div class="modal-detail-item">
          <div class="modal-detail-label">Condition</div>
          <div class="modal-detail-value">
            <span style="display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:99px; font-size:11.5px; font-weight:600; background:${condMeta.bg}; color:${condMeta.color}; border:1px solid ${condMeta.color}33;">
              <span>${condMeta.icon}</span> ${escapeHtml(item.condition || 'Unpacked New')}
            </span>
          </div>
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
        <div class="modal-detail-item">
          <div class="modal-detail-label">Location</div>
          <div class="modal-detail-value" style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <span style="color: ${locColor}; font-weight: 600;">📍 ${escapeHtml(item.location || 'Unassigned')}</span>
            <button type="button" class="btn btn-secondary btn-sm" id="modal-move-btn" style="padding: 2px 8px; font-size: 11px;" title="Move to another storage location">Move</button>
          </div>
        </div>
        ${item.usedIn ? `
        <div class="modal-detail-item">
          <div class="modal-detail-label">Used In</div>
          <div class="modal-detail-value">${escapeHtml(item.usedIn)}</div>
        </div>` : ''}
        ${item.supplierInfo ? `
        <div class="modal-detail-item">
          <div class="modal-detail-label">Supplier</div>
          <div class="modal-detail-value" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>${escapeHtml(item.supplierInfo)}</span>
            ${(item.supplierInfo.toLowerCase().includes('robu') && item.partNumber) ? `
              <a href="https://robu.in/?s=${encodeURIComponent(item.partNumber)}" target="_blank" rel="noopener" style="font-size:11px; color:#0284c7; background:rgba(2,132,199,0.1); border:1px solid rgba(2,132,199,0.25); padding:1px 6px; border-radius:4px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:3px;">
                🛒 Robu SKU ↗
              </a>
            ` : ''}
            ${(item.supplierInfo.toLowerCase().includes('hubtronics')) ? `
              <a href="https://hubtronics.in/index.php?route=product/search&search=${encodeURIComponent(item.name || item.partNumber)}" target="_blank" rel="noopener" style="font-size:11px; color:#f59e0b; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.25); padding:1px 6px; border-radius:4px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:3px;">
                🛒 Hubtronics ↗
              </a>
            ` : ''}
          </div>
        </div>` : ''}
        ${item.datasheetUrl ? `
        <div class="modal-detail-item">
          <div class="modal-detail-label">${(item.datasheetUrl.includes('robu.in') || item.datasheetUrl.includes('hubtronics.in')) ? 'Product Link' : 'Datasheet'}</div>
          <div class="modal-detail-value">
            <a href="${escapeHtml(item.datasheetUrl.includes('robu.in') ? item.datasheetUrl.replace(/[?&]post_type=product/g, '').replace('?&', '?') : item.datasheetUrl)}" target="_blank" rel="noopener" style="${(item.datasheetUrl.includes('robu.in') || item.datasheetUrl.includes('hubtronics.in')) ? 'font-weight:600; display:inline-flex; align-items:center; gap:4px;' : ''}">
              ${item.datasheetUrl.includes('robu.in') ? '🛒 View on Robu.in ↗' : item.datasheetUrl.includes('hubtronics.in') ? '🛒 View on Hubtronics ↗' : 'Open Datasheet ↗'}
            </a>
          </div>
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
    <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      ${imageSrc ? `
        <button class="btn btn-secondary btn-sm" id="modal-ai-footer-btn" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15)); border: 1px solid rgba(99,102,241,0.3); color: var(--text-primary);" title="Re-analyze image and update component details">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          AI Re-analyze Photo
        </button>
      ` : `<span></span>`}
      <div style="display: flex; gap: 8px; margin-left: auto;">
        <button class="btn btn-secondary btn-sm" id="modal-duplicate-btn" title="Duplicate component (new condition, location, or batch)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Duplicate
        </button>
        <button class="btn btn-primary btn-sm" id="modal-edit-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="btn btn-danger btn-sm" id="modal-delete-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete
        </button>
      </div>
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

  // AI Re-analysis Handler
  const handleAIAnalysis = async (triggerBtn) => {
    if (!imageBlob && !imageSrc) {
      showToast('No photo found for this component', 'warning');
      return;
    }

    const aiSettings = getAISettings();
    if (!aiSettings.enabled) {
      showToast('AI recognition is disabled in Settings', 'warning');
      return;
    }

    const origContent = triggerBtn ? triggerBtn.innerHTML : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = `
        <svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Analyzing Photo...
      `;
    }
    showToast(`Analyzing ${item.name || 'component'} with AI...`, 'info');

    try {
      const hintVal = document.getElementById('modal-ai-hint-input')?.value.trim() || '';
      const categories = await getCategories();
      const detected = await analyzeComponentImage({
        image: imageBlob || imageSrc,
        categories: categories.map(c => c.name),
        existingItem: item,
        hint: hintVal,
      });

      openAIReviewModal({
        aiData: detected,
        imageSrc,
        categories,
        existingItem: item,
        onApply: async (applied) => {
          const updatedItem = {
            ...item,
            ...applied,
            updatedAt: new Date().toISOString(),
          };

          if (applied.notes !== undefined) {
            updatedItem.notes = applied.notes;
          }

          if (Array.isArray(applied.tags)) {
            // Replace previous tags with newly generated AI tags
            updatedItem.tags = applied.tags;
          }

          await saveItem(updatedItem);
          await addHistory({
            itemId: item.id,
            action: 'updated',
            notes: `AI generated details applied (${detected.modelUsed || 'AI vision'})`,
          });

          showToast(`✨ AI details updated for "${updatedItem.name}"!`, 'success');
          closeModal();
          if (refreshView) refreshView();
          // Re-open detail modal with newly saved values
          openItemDetailModal(itemId, { navigateTo, refreshView });
        },
      });
    } catch (err) {
      console.error('AI Analysis Error:', err);
      showToast(err.message || 'AI analysis failed', 'error');
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = origContent;
      }
    }
  };

  const btnAi = document.getElementById('modal-ai-analyze-btn');
  if (btnAi) btnAi.addEventListener('click', () => handleAIAnalysis(btnAi));

  const btnAiFooter = document.getElementById('modal-ai-footer-btn');
  if (btnAiFooter) btnAiFooter.addEventListener('click', () => handleAIAnalysis(btnAiFooter));

  // Quick Move Location
  const btnMove = document.getElementById('modal-move-btn');
  if (btnMove) {
    btnMove.addEventListener('click', async () => {
      const newLoc = prompt(`Relocate "${item.name}" to:`, item.location || '');
      if (newLoc === null) return;
      const cleanLoc = newLoc.trim();
      if (!cleanLoc) {
        showToast('Storage location cannot be empty', 'warning');
        return;
      }
      if (cleanLoc === item.location) return;

      item.location = cleanLoc;
      item.updatedAt = new Date().toISOString();
      await saveItem(item);
      try { await saveLocation({ name: cleanLoc }); } catch (_) {}
      await addHistory(item.id, 'moved', 0);
      showToast(`✓ Relocated "${item.name}" to "${cleanLoc}"!`, 'success');
      closeModal();
      if (refreshView) refreshView();
      openItemDetailModal(itemId, { navigateTo, refreshView });
    });
  }

  // Duplicate
  document.getElementById('modal-duplicate-btn')?.addEventListener('click', () => {
    closeModal();
    navigateTo('add-item', { cloneItemId: itemId });
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
