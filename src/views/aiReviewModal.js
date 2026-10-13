import { ITEM_CONDITIONS, getConditionMeta } from '../categories.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Open the interactive AI Review Modal.
 * @param {Object} options
 * @param {Object} options.aiData - Extracted fields from AI
 * @param {string} options.imageSrc - Preview image URL
 * @param {Array<Object>} options.categories - Available categories list
 * @param {Object} [options.existingItem] - Existing item values if editing
 * @param {Function} options.onApply - Callback receiving { [field]: value }
 * @param {Function} [options.onCancel] - Optional callback if dismissed
 */
export function openAIReviewModal({
  aiData,
  imageSrc,
  categories = [],
  existingItem = null,
  onApply,
  onCancel = null,
}) {
  // Remove any previous instance of AI modal
  const existingModal = document.getElementById('ai-review-modal-overlay');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'ai-review-modal-overlay';
  modalOverlay.className = 'modal-overlay';
  modalOverlay.style.display = 'flex';
  modalOverlay.style.zIndex = '1100';

  const tagsString = (aiData.tags || []).join(', ');

  modalOverlay.innerHTML = `
    <div class="modal-content ai-review-modal-card" style="max-width: 720px; width: 92%; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; padding: 0;">
      <!-- Modal Header -->
      <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid var(--border-secondary); background: var(--bg-secondary);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px;">
            ✨
          </div>
          <div>
            <h2 class="modal-title" style="font-size: var(--font-size-lg); margin: 0; display: flex; align-items: center; gap: 8px;">
              AI Component Details
              ${aiData.switchedToBackup ? `
                <span class="ai-model-pill" style="font-size: 11px; font-weight: 600; background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.4); padding: 2px 8px; border-radius: 99px;" title="${escapeAttr(aiData.backupReason || 'Switched to backup model')}">
                  🛡️ ${escapeHtml(aiData.modelUsed || 'Backup Model')}
                </span>
              ` : `
                <span class="ai-model-pill" style="font-size: 11px; font-weight: 500; background: var(--bg-tertiary); color: var(--accent-primary-hover); border: 1px solid var(--border-secondary); padding: 2px 8px; border-radius: 99px;">
                  ${escapeHtml(aiData.modelUsed || 'AI Vision')}
                </span>
              `}
            </h2>
            <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 2px;">
              Review detected values below. Uncheck or edit any field before applying.
            </div>
          </div>
        </div>
        <button class="modal-close" id="ai-modal-close-btn" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body" style="padding: 16px 20px; overflow-y: auto; flex: 1;">
        ${aiData.switchedToBackup ? `
          <div style="background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11.5px; color: #facc15; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px;">⚡</span>
            <span><strong>Switched to Backup Model:</strong> ${escapeHtml(aiData.backupReason || 'Primary rate limit or failover')}</span>
          </div>
        ` : ''}

        <!-- Top Toolbar & Preview -->
        <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 16px; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 10px 14px; flex-wrap: wrap;">
          ${imageSrc ? `
            <img src="${imageSrc}" alt="Component Thumbnail" style="width: 52px; height: 52px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border-secondary); flex-shrink: 0;" />
          ` : ''}
          <div style="flex: 1; min-width: 180px;">
            <div style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-primary);">
              Automated Extraction Complete
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Choose which attributes to copy to the item form.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="ai-select-all-btn" style="padding: 4px 8px; font-size: var(--font-size-xs);">
              Select All
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="ai-deselect-all-btn" style="padding: 4px 8px; font-size: var(--font-size-xs);">
              Deselect All
            </button>
          </div>
        </div>

        <!-- Field Cards Grid -->
        <div class="ai-fields-container" style="display: flex; flex-direction: column; gap: 12px;">

          <!-- Field: Name -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="name" checked style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Component Name
              </label>
              ${existingItem?.name ? `<span style="font-size: 10px; color: var(--text-tertiary);">Current: ${escapeHtml(existingItem.name)}</span>` : ''}
            </div>
            <input type="text" id="ai-val-name" value="${escapeAttr(aiData.name || '')}" class="form-input" style="width: 100%; font-size: var(--font-size-sm);" placeholder="e.g. NE555 Timer IC" />
          </div>

          <!-- Field: Part Number / SKU -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="partNumber" ${aiData.partNumber ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                <span>Part Number / SKU</span>
                ${aiData.partNumber ? `
                  <span style="font-size: 10px; color: var(--color-success); background: var(--color-success-bg); padding: 1px 6px; border-radius: 4px; font-weight: normal;">Barcode Detected</span>
                ` : `
                  <span style="font-size: 10px; color: var(--text-tertiary); font-weight: normal;">(Barcode only)</span>
                `}
              </label>
              ${existingItem?.partNumber ? `<span style="font-size: 10px; color: var(--text-tertiary);">Current: ${escapeHtml(existingItem.partNumber)}</span>` : ''}
            </div>
            <input type="text" id="ai-val-partNumber" value="${escapeAttr(aiData.partNumber || '')}" class="form-input" style="width: 100%; font-family: monospace; font-size: var(--font-size-sm);" placeholder="${aiData.partNumber ? 'Detected barcode SKU' : 'No barcode found in image (left blank)'}" />
            <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">
              ${aiData.partNumber ? 'Extracted from physical barcode / QR code in the photo.' : 'SKU is only filled when a physical barcode or barcode label is visible in the photo.'}
            </div>
          </div>

          <!-- Field: Category -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="category" checked style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Category
              </label>
              ${existingItem?.category ? `<span style="font-size: 10px; color: var(--text-tertiary);">Current: ${escapeHtml(existingItem.category)}</span>` : ''}
            </div>
            <select id="ai-val-category" class="form-input" style="width: 100%; font-size: var(--font-size-sm);">
              ${categories.map(c => `
                <option value="${escapeAttr(c.name)}" ${c.name.toLowerCase() === (aiData.category || '').toLowerCase() ? 'selected' : ''}>
                  ${c.icon || '📦'} ${escapeHtml(c.name)}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Field: Condition -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="condition" checked style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Condition
              </label>
              ${existingItem?.condition ? `<span style="font-size: 10px; color: var(--text-tertiary);">Current: ${escapeHtml(existingItem.condition)}</span>` : ''}
            </div>
            <select id="ai-val-condition" class="form-input" style="width: 100%; font-size: var(--font-size-sm);">
              ${ITEM_CONDITIONS.map(c => `
                <option value="${escapeAttr(c)}" ${(aiData.condition || 'Unpacked New') === c ? 'selected' : ''}>
                  ${getConditionMeta(c).icon} ${escapeHtml(c)}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Field: Quantity -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="quantity" checked style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Estimated Quantity
              </label>
              ${existingItem?.quantity !== undefined && existingItem?.quantity !== null ? `<span style="font-size: 10px; color: var(--text-tertiary);">Current: ${escapeHtml(existingItem.quantity)}</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="number" id="ai-val-quantity" min="1" value="${aiData.estimatedQuantity || aiData.quantity || 1}" class="form-input" style="width: 110px; font-size: var(--font-size-sm); font-weight: 600;" />
              <span style="font-size: 11px; color: var(--text-tertiary);">Estimated visible component unit count</span>
            </div>
          </div>

          <!-- Field: Description -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="description" ${aiData.description ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Description & Physical Dimensions
              </label>
              <span style="font-size: 10px; color: var(--text-tertiary);">Includes unit dimensions</span>
            </div>
            <textarea id="ai-val-description" class="form-input" rows="4" style="width: 100%; font-size: var(--font-size-sm); resize: vertical; line-height: 1.45;" placeholder="Component overview, package type, functionality...&#10;&#10;Dimensions: L x W x H mm">${escapeHtml(aiData.description || '')}</textarea>
          </div>

          <!-- Field: Tags -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="tags" ${aiData.tags && aiData.tags.length > 0 ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Suggested Tags (Comma separated)
              </label>
            </div>
            <input type="text" id="ai-val-tags" value="${escapeAttr(tagsString)}" class="form-input" style="width: 100%; font-size: var(--font-size-sm);" placeholder="timer, analog, DIP-8, 5V-15V" />
            <div id="ai-tags-preview-pills" style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
              ${(aiData.tags || []).map(t => `<span class="tag-chip" style="font-size: 11px; padding: 2px 8px;">${escapeHtml(t)}</span>`).join('')}
            </div>
          </div>

          <!-- Field: Supplier / Brand -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="supplierInfo" ${aiData.supplierInfo ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Manufacturer / Supplier
              </label>
            </div>
            <input type="text" id="ai-val-supplierInfo" value="${escapeAttr(aiData.supplierInfo || '')}" class="form-input" style="width: 100%; font-size: var(--font-size-sm);" placeholder="e.g. Texas Instruments, Espressif" />
          </div>

          <!-- Field: Datasheet URL -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="datasheetUrl" ${aiData.datasheetUrl ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Datasheet URL
              </label>
              ${aiData.datasheetUrl ? `
                <a href="${escapeAttr(aiData.datasheetUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: var(--accent-primary-hover); text-decoration: underline;">Test Link ↗</a>
              ` : ''}
            </div>
            <input type="url" id="ai-val-datasheetUrl" value="${escapeAttr(aiData.datasheetUrl || '')}" class="form-input" style="width: 100%; font-size: var(--font-size-sm);" placeholder="https://..." />
          </div>

          <!-- Field: Notes & Specifications -->
          <div class="ai-field-card" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--border-radius-md); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer;">
                <input type="checkbox" class="ai-field-check" data-field="notes" ${aiData.notes ? 'checked' : ''} style="accent-color: var(--accent-primary); width: 16px; height: 16px;" />
                Technical Notes & Pinout
              </label>
            </div>
            <textarea id="ai-val-notes" class="form-input" rows="3" style="width: 100%; font-size: var(--font-size-sm); resize: vertical;" placeholder="Pinout details, operating limits, application notes...">${escapeHtml(aiData.notes || '')}</textarea>
          </div>

        </div>
      </div>

      <!-- Modal Footer -->
      <div class="modal-footer" style="padding: 14px 20px; border-top: 1px solid var(--border-secondary); background: var(--bg-secondary); display: flex; justify-content: space-between; align-items: center;">
        <span id="ai-selected-count" style="font-size: var(--font-size-xs); color: var(--text-secondary);">
          7 fields selected
        </span>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn btn-secondary" id="ai-btn-discard">
            Discard
          </button>
          <button type="button" class="btn btn-primary" id="ai-btn-apply" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #6366f1, #a855f7);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Apply Selected Details
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Update selected count display
  function updateCount() {
    const checkboxes = modalOverlay.querySelectorAll('.ai-field-check');
    const checked = modalOverlay.querySelectorAll('.ai-field-check:checked');
    const countEl = document.getElementById('ai-selected-count');
    if (countEl) {
      countEl.textContent = `${checked.length} of ${checkboxes.length} fields selected`;
    }
  }

  // Live tags preview updater
  const tagsInput = document.getElementById('ai-val-tags');
  const tagsPreview = document.getElementById('ai-tags-preview-pills');
  if (tagsInput && tagsPreview) {
    tagsInput.addEventListener('input', () => {
      const items = tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
      tagsPreview.innerHTML = items.map(t => `<span class="tag-chip" style="font-size: 11px; padding: 2px 8px;">${escapeHtml(t)}</span>`).join('');
    });
  }

  // Checkbox change listener
  modalOverlay.querySelectorAll('.ai-field-check').forEach(cb => {
    cb.addEventListener('change', updateCount);
  });
  updateCount();

  // Select all / Deselect all
  document.getElementById('ai-select-all-btn').addEventListener('click', () => {
    modalOverlay.querySelectorAll('.ai-field-check').forEach(cb => { cb.checked = true; });
    updateCount();
  });

  document.getElementById('ai-deselect-all-btn').addEventListener('click', () => {
    modalOverlay.querySelectorAll('.ai-field-check').forEach(cb => { cb.checked = false; });
    updateCount();
  });

  // Close / Discard handlers
  const closeModal = () => {
    modalOverlay.remove();
    if (onCancel) onCancel();
  };

  document.getElementById('ai-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('ai-btn-discard').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Apply Handler
  document.getElementById('ai-btn-apply').addEventListener('click', () => {
    const selectedData = {};

    modalOverlay.querySelectorAll('.ai-field-check:checked').forEach(cb => {
      const field = cb.dataset.field;
      if (field === 'tags') {
        const rawTags = (document.getElementById('ai-val-tags')?.value || '');
        selectedData.tags = rawTags.split(',').map(s => s.trim()).filter(Boolean);
      } else if (field === 'quantity') {
        const input = document.getElementById('ai-val-quantity');
        const num = parseInt(input?.value, 10);
        const qty = Number.isFinite(num) && num > 0 ? num : 1;
        selectedData.quantity = qty;
        selectedData.estimatedQuantity = qty;
      } else {
        const input = document.getElementById(`ai-val-${field}`);
        if (input) {
          selectedData[field] = input.value.trim();
        }
      }
    });

    modalOverlay.remove();
    if (onApply) onApply(selectedData);
  });
}
