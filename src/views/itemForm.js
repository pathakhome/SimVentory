/**
 * Add / Edit Item form view.
 */
import { generateId, saveItem, getItem, getAllItems, saveImage, getImage, deleteImage, addHistory, getCategories, saveCategory, getLocations, saveLocation } from '../db.js';
import { createDefaultItem, ITEM_CONDITIONS, getConditionMeta, DEFAULT_CONDITION } from '../categories.js';
import { showToast } from '../toast.js';
import { optimizeImage } from '../imageUtil.js';
import { openCameraModal } from './cameraModal.js';
import { openCropperModal } from './cropperModal.js';
import { getAISettings, analyzeComponentImage } from '../services/aiService.js';
import { openAIReviewModal } from './aiReviewModal.js';

/**
 * Render the add/edit item form.
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {string|null} options.editItemId - If set, we're editing an existing item
 * @param {string|null} options.prefillPartNumber - Pre-fill part number from scanner
 */
export async function renderItemForm(container, { navigateTo, refreshView, openScanner, editItemId = null, prefillPartNumber = null }) {
  let item = createDefaultItem();
  let imageFile = null;     // New file selected by user
  let existingImageUrl = null; // Object URL of existing image from DB
  let removeImage = false;

  const isEdit = !!editItemId;

  if (isEdit) {
    const existing = await getItem(editItemId);
    if (existing) {
      item = { ...item, ...existing };
      const blob = await getImage(editItemId);
      if (blob) {
        existingImageUrl = URL.createObjectURL(blob);
      }
    }
  } else if (prefillPartNumber) {
    item.partNumber = prefillPartNumber;
  }

  let categories = await getCategories();
  let locations = await getLocations();
  const allItems = await getAllItems();
  const allUniqueTags = Array.from(new Set(
    allItems.flatMap(i => (Array.isArray(i.tags) ? i.tags : []))
      .map(t => (t || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  container.innerHTML = `
    <div class="fade-in">
      <div class="view-header">
        <h1>${isEdit ? 'Edit Component' : 'Add Component'}</h1>
        <p>${isEdit ? `Editing: ${item.name}` : 'Add a new electronic component to your inventory'}</p>
      </div>

      <form class="item-form" id="item-form">
        <div class="form-grid">
          <!-- Image Upload -->
          <div class="form-group full-width">
            <label class="form-label">Image</label>
            <div class="image-upload-area ${existingImageUrl ? 'has-image' : ''}" id="image-upload-area">
              <input type="file" id="image-file-input" accept="image/*" style="position:fixed; top:-1000px; left:-1000px; opacity:0; pointer-events:none;" />
              <input type="file" id="camera-file-input" accept="image/*" capture="environment" style="position:fixed; top:-1000px; left:-1000px; opacity:0; pointer-events:none;" />
              ${existingImageUrl ? `
                <div class="image-preview-container">
                  <img class="image-preview" src="${existingImageUrl}" alt="Preview" id="image-preview" />
                  <div class="image-preview-actions">
                    <button type="button" class="image-ai-btn" id="image-ai-btn" title="Identify component and autofill details with AI">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      AI Autofill
                    </button>
                    <button type="button" class="image-crop-btn" id="image-crop-btn" title="Crop image">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
                      Crop
                    </button>
                    <button type="button" class="image-remove-btn" id="image-remove-btn" title="Remove image">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              ` : `
                <div class="upload-placeholder" id="upload-placeholder">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <div class="upload-placeholder-text">Click, tap, or drag & drop to add component photo</div>
                  <div class="upload-actions-row" style="display: flex; gap: 10px; margin-top: 8px; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary btn-sm" id="btn-camera" style="pointer-events: auto;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      Take Photo
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-browse" style="pointer-events: auto;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      Choose File / Gallery
                    </button>
                  </div>
                  <div class="upload-placeholder-hint" style="margin-top: 6px;">Live camera viewfinder or direct photo upload</div>
                </div>
              `}
            </div>
            <!-- AI Photo Identification Banner with Hint Field -->
            <div id="ai-photo-hint-banner" style="display: flex; flex-direction: column; gap: 8px; background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.12)); border: 1px solid rgba(99,102,241,0.3); border-radius: var(--border-radius-md); padding: 10px 12px; margin-top: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 16px;">✨</span>
                  <div>
                    <div style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-primary);">AI Component Agent</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">Identify IC markings, footprint, pinout & specs</div>
                  </div>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btn-trigger-ai" style="padding: 6px 14px; font-size: var(--font-size-xs); font-weight: 600; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(99,102,241,0.35);">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  Auto-Fill with AI
                </button>
              </div>
              <div style="display: flex; align-items: center; gap: 8px; background: var(--bg-card); padding: 5px 8px 5px 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-secondary);">
                <span style="font-size: 11.5px; color: var(--accent-primary); font-weight: 600; white-space: nowrap;">💡 AI Prompt Hint:</span>
                <input type="text" id="ai-component-hint" placeholder="Add optional clue to boost AI accuracy (e.g. SMD 0805, 3.3V LDO, rotary encoder, 7805)..." style="width: 100%; border: none; background: transparent; font-size: 11.5px; color: var(--text-primary); outline: none; padding: 2px 0;" title="Optional hint added to AI prompt" />
              </div>
            </div>
          </div>

          <!-- Name -->
          <div class="form-group">
            <label class="form-label" for="item-name">Name <span class="required">*</span></label>
            <input type="text" id="item-name" placeholder="e.g., ESP32-WROOM-32" value="${escapeAttr(item.name)}" required />
          </div>

          <!-- Category -->
          <div class="form-group">
            <label class="form-label" for="item-category" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Category</span>
              <button type="button" class="btn btn-secondary" id="btn-quick-add-cat" style="padding: 2px 8px; font-size: var(--font-size-xs); line-height: 1.2;">
                + Custom Category
              </button>
            </label>
            <select id="item-category">
              ${categories.map(c => `<option value="${escapeAttr(c.name)}" ${item.category === c.name ? 'selected' : ''}>${c.icon || '📦'} ${c.name}</option>`).join('')}
            </select>
          </div>

          <!-- Condition -->
          <div class="form-group">
            <label class="form-label" for="item-condition">Condition</label>
            <select id="item-condition">
              ${ITEM_CONDITIONS.map(cond => `<option value="${escapeAttr(cond)}" ${(item.condition || DEFAULT_CONDITION) === cond ? 'selected' : ''}>${getConditionMeta(cond).icon} ${escapeHtml(cond)}</option>`).join('')}
            </select>
          </div>

          <!-- Quantity Stepper -->
          <div class="form-group">
            <label class="form-label" for="item-quantity">Quantity <span class="required">*</span></label>
            <div style="display: flex; align-items: stretch; border: 1px solid var(--border-secondary); border-radius: var(--border-radius-md); overflow: hidden; background: var(--bg-card);">
              <button type="button" class="btn btn-secondary stepper-btn" id="btn-qty-minus" style="border-radius: 0; border: none; padding: 0 16px; font-size: 1.25rem; font-weight: 700; background: var(--bg-secondary); cursor: pointer;" aria-label="Decrease quantity">−</button>
              <input type="number" id="item-quantity" min="0" value="${item.quantity}" required style="border: none; border-radius: 0; text-align: center; font-weight: 700; font-size: 1.05rem; background: transparent; width: 100%; box-shadow: none;" />
              <button type="button" class="btn btn-secondary stepper-btn" id="btn-qty-plus" style="border-radius: 0; border: none; padding: 0 16px; font-size: 1.25rem; font-weight: 700; background: var(--bg-secondary); cursor: pointer;" aria-label="Increase quantity">+</button>
            </div>
            <!-- Quick preset counters -->
            <div style="display: flex; gap: 6px; margin-top: 6px; align-items: center; flex-wrap: wrap;">
              <span style="font-size: 11px; color: var(--text-tertiary);">Quick add:</span>
              <button type="button" class="btn-qty-delta" data-delta="1" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">+1</button>
              <button type="button" class="btn-qty-delta" data-delta="5" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">+5</button>
              <button type="button" class="btn-qty-delta" data-delta="10" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">+10</button>
              <button type="button" class="btn-qty-delta" data-delta="50" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">+50</button>
              <button type="button" class="btn-qty-delta" data-delta="100" style="background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;">+100</button>
            </div>
          </div>

          <!-- Low Stock Threshold Stepper -->
          <div class="form-group">
            <label class="form-label" for="item-threshold">Low Stock Threshold</label>
            <div style="display: flex; align-items: stretch; border: 1px solid var(--border-secondary); border-radius: var(--border-radius-md); overflow: hidden; background: var(--bg-card);">
              <button type="button" class="btn btn-secondary stepper-btn" id="btn-thresh-minus" style="border-radius: 0; border: none; padding: 0 16px; font-size: 1.25rem; font-weight: 700; background: var(--bg-secondary); cursor: pointer;" aria-label="Decrease threshold">−</button>
              <input type="number" id="item-threshold" min="0" value="${item.lowStockThreshold !== undefined && item.lowStockThreshold !== null ? item.lowStockThreshold : 0}" style="border: none; border-radius: 0; text-align: center; font-weight: 700; font-size: 1.05rem; background: transparent; width: 100%; box-shadow: none;" />
              <button type="button" class="btn btn-secondary stepper-btn" id="btn-thresh-plus" style="border-radius: 0; border: none; padding: 0 16px; font-size: 1.25rem; font-weight: 700; background: var(--bg-secondary); cursor: pointer;" aria-label="Increase threshold">+</button>
            </div>
          </div>

          <!-- Part Number with Scanner Button -->
          <div class="form-group">
            <label class="form-label" for="item-partnum" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Part Number / SKU</span>
              <button type="button" class="btn btn-secondary" id="btn-scan-partnum" style="padding: 2px 8px; font-size: var(--font-size-xs); line-height: 1.2; display:flex; align-items:center; gap:4px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
                Scan Barcode
              </button>
            </label>
            <input type="text" id="item-partnum" placeholder="e.g., ESP32-WROOM-32D" value="${escapeAttr(item.partNumber)}" />
          </div>

          <!-- Location with Datalist -->
          <div class="form-group">
            <label class="form-label" for="item-location" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Storage Location <span class="required">*</span></span>
              <button type="button" class="btn btn-secondary" id="btn-quick-add-loc" style="padding: 2px 8px; font-size: var(--font-size-xs); line-height: 1.2;">
                + New Location
              </button>
            </label>
            <input type="text" id="item-location" list="storage-locations-list" placeholder="e.g., Drawer A1, Bin 4, Shelf 2" value="${escapeAttr(item.location)}" required />
            <datalist id="storage-locations-list">
              ${locations.map(l => `<option value="${escapeAttr(l.name)}">${escapeAttr(l.description ? `${l.name} - ${l.description}` : l.name)}</option>`).join('')}
            </datalist>
          </div>

          <!-- Datasheet URL -->
          <div class="form-group">
            <label class="form-label" for="item-datasheet">Datasheet URL</label>
            <input type="url" id="item-datasheet" placeholder="https://..." value="${escapeAttr(item.datasheetUrl)}" />
          </div>

          <!-- Supplier Info -->
          <div class="form-group">
            <label class="form-label" for="item-supplier">Supplier Info</label>
            <input type="text" id="item-supplier" placeholder="e.g., Amazon — ₹350" value="${escapeAttr(item.supplierInfo)}" />
          </div>

          <!-- Description -->
          <div class="form-group full-width">
            <label class="form-label" for="item-desc">Description</label>
            <textarea id="item-desc" placeholder="Brief description of the component..." rows="3">${escapeHtml(item.description)}</textarea>
          </div>

          <!-- Tags -->
          <div class="form-group full-width">
            <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Tags</span>
              <span style="font-weight:400; font-size:var(--font-size-xs); color:var(--text-tertiary);">Type & tap + Add, or select suggestions</span>
            </label>
            <div style="display:flex; gap:8px; align-items:stretch;">
              <div class="tag-input-container" id="tag-container" style="flex:1;">
                ${(item.tags || []).map(t => `<span class="tag-chip" data-tag="${escapeAttr(t)}">${escapeHtml(t)}<button type="button">&times;</button></span>`).join('')}
                <input type="text" class="tag-input" id="tag-input" list="existing-tags-datalist" placeholder="Add tag (e.g. smd, 3.3v, i2c)..." autocomplete="off" enterkeyhint="done" />
                <datalist id="existing-tags-datalist">
                  ${allUniqueTags.map(t => `<option value="${escapeAttr(t)}"></option>`).join('')}
                </datalist>
              </div>
              <button type="button" class="btn btn-secondary" id="btn-add-tag-manual" style="padding:0 16px; font-weight:600; font-size:var(--font-size-sm); display:inline-flex; align-items:center; gap:4px; flex-shrink:0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add
              </button>
            </div>
            <div class="existing-tags-wrapper" id="existing-tags-wrapper" style="margin-top: 8px;">
              <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: 6px;">
                Existing tags in your vault (tap to add):
              </div>
              <div class="existing-tags-cloud" id="existing-tags-cloud" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            </div>
          </div>

          <!-- Notes -->
          <div class="form-group full-width">
            <label class="form-label" for="item-notes">Notes</label>
            <textarea id="item-notes" placeholder="Pin diagrams, wiring tips, project notes..." rows="3">${escapeHtml(item.notes)}</textarea>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="form-submit-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              ${isEdit ? 'Save Changes' : 'Add Component'}
            </button>
            <button type="button" class="btn btn-secondary" id="form-cancel-btn">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  `;

  // ---- Image Upload & Camera Handling ----
  const uploadArea = document.getElementById('image-upload-area');

  function bindUploadEvents() {
    const fileInput = document.getElementById('image-file-input');
    const cameraInput = document.getElementById('camera-file-input');
    const btnCamera = document.getElementById('btn-camera');
    const btnBrowse = document.getElementById('btn-browse');

    if (btnCamera) {
      btnCamera.addEventListener('click', (e) => {
        e.stopPropagation();
        openCameraModal({
          onCapture: (blobOrFile) => handleImageFile(blobOrFile),
        });
      });
    }

    if (btnBrowse && fileInput) {
      btnBrowse.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) handleImageFile(fileInput.files[0]);
      });
    }

    if (cameraInput) {
      cameraInput.addEventListener('change', () => {
        if (cameraInput.files.length > 0) handleImageFile(cameraInput.files[0]);
      });
    }
  }

  uploadArea.addEventListener('click', (e) => {
    if (e.target.closest('.image-remove-btn') || e.target.closest('button') || e.target.closest('label')) return;
    const fileInput = document.getElementById('image-file-input');
    if (fileInput) fileInput.click();
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--accent-primary)';
    uploadArea.style.background = 'var(--accent-primary-glow)';
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '';
    uploadArea.style.background = '';
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    uploadArea.style.background = '';
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleImageFile(files[0]);
    }
  });

  async function handleImageFile(file) {
    if (!file) return;
    // Automatically open interactive cropper modal so user can frame component
    openCropperModal({
      image: file,
      onDone: async (croppedBlob) => {
        await applyCroppedImage(croppedBlob);
      },
    });
  }

  async function applyCroppedImage(blob) {
    try {
      showToast('Optimizing photo...', 'info');
      const optimized = await optimizeImage(blob);
      imageFile = optimized;
      removeImage = false;

      const url = URL.createObjectURL(optimized);
      existingImageUrl = url;
      uploadArea.classList.add('has-image');
      uploadArea.innerHTML = `
        <div class="image-preview-container">
          <img class="image-preview" src="${url}" alt="Preview" id="image-preview" />
          <div class="image-preview-actions">
            <button type="button" class="image-ai-btn" id="image-ai-btn" title="Identify component and autofill details with AI">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              AI Autofill
            </button>
            <button type="button" class="image-crop-btn" id="image-crop-btn" title="Crop / reframe image">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
              Crop
            </button>
            <button type="button" class="image-remove-btn" id="image-remove-btn" title="Remove image">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      `;
      const banner = document.getElementById('ai-photo-hint-banner');
      if (banner) banner.style.display = 'flex';
      showToast('Photo framed and attached!', 'success');
    } catch (err) {
      showToast('Failed to process image: ' + err.message, 'error');
    }
  }

  // Image actions (Crop & Remove buttons via event delegation)
  uploadArea.addEventListener('click', (e) => {
    // 1. AI Autofill action from preview overlay
    if (e.target.closest('.image-ai-btn')) {
      e.stopPropagation();
      handleAIAutofill(e.target.closest('.image-ai-btn'));
      return;
    }

    // 2. Re-crop existing image
    if (e.target.closest('.image-crop-btn')) {
      e.stopPropagation();
      const targetImage = imageFile || existingImageUrl;
      if (targetImage) {
        openCropperModal({
          image: targetImage,
          onDone: async (croppedBlob) => {
            await applyCroppedImage(croppedBlob);
          },
        });
      }
      return;
    }

    // 3. Remove image
    if (e.target.closest('.image-remove-btn')) {
      e.stopPropagation();
      imageFile = null;
      removeImage = true;
      existingImageUrl = null;
      uploadArea.classList.remove('has-image');
      uploadArea.innerHTML = `
        <input type="file" id="image-file-input" accept="image/*" style="position:fixed; top:-1000px; left:-1000px; opacity:0; pointer-events:none;" />
        <input type="file" id="camera-file-input" accept="image/*" capture="environment" style="position:fixed; top:-1000px; left:-1000px; opacity:0; pointer-events:none;" />
        <div class="upload-placeholder" id="upload-placeholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div class="upload-placeholder-text">Click, tap, or drag & drop to add component photo</div>
          <div class="upload-actions-row" style="display: flex; gap: 10px; margin-top: 8px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-camera" style="pointer-events: auto;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Take Photo
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-browse" style="pointer-events: auto;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              Choose File / Gallery
            </button>
          </div>
          <div class="upload-placeholder-hint" style="margin-top: 6px;">Live camera viewfinder or direct photo upload</div>
        </div>
      `;
      bindUploadEvents();
    }
  });

  // AI Autofill Button from Banner
  const btnTriggerAI = document.getElementById('btn-trigger-ai');
  if (btnTriggerAI) {
    btnTriggerAI.addEventListener('click', () => {
      handleAIAutofill(btnTriggerAI);
    });
  }

  const aiHintInput = document.getElementById('ai-component-hint');
  if (aiHintInput && btnTriggerAI) {
    aiHintInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAIAutofill(btnTriggerAI);
      }
    });
  }

  // AI Autofill Core Handler
  async function handleAIAutofill(triggerBtn) {
    const targetImage = imageFile || existingImageUrl;
    if (!targetImage) {
      showToast('Please take or upload a component photo first', 'warning');
      return;
    }

    const aiSettings = getAISettings();
    if (!aiSettings.enabled) {
      showToast('AI recognition is disabled in Settings', 'warning');
      return;
    }

    const userHint = (document.getElementById('ai-component-hint')?.value || '').trim();

    const originalHTML = triggerBtn ? triggerBtn.innerHTML : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = `
        <svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Analyzing...
      `;
    }
    showToast(userHint ? `Analyzing photo with hint "${userHint}"...` : 'AI is identifying markings & specifications...', 'info');

    try {
      const detected = await analyzeComponentImage({
        image: targetImage,
        categories: categories.map(c => c.name),
        hint: userHint,
        existingItem: {
          name: document.getElementById('item-name')?.value,
          partNumber: document.getElementById('item-partnum')?.value,
          category: document.getElementById('item-category')?.value,
        },
      });

      const previewSrc = typeof targetImage === 'string' ? targetImage : URL.createObjectURL(targetImage);

      openAIReviewModal({
        aiData: detected,
        imageSrc: previewSrc,
        categories,
        existingItem: {
          name: document.getElementById('item-name')?.value,
          partNumber: document.getElementById('item-partnum')?.value,
          category: document.getElementById('item-category')?.value,
          quantity: document.getElementById('item-quantity')?.value,
        },
        onApply: (applied) => {
          if (applied.name !== undefined) {
            const el = document.getElementById('item-name');
            if (el) el.value = applied.name;
          }
          if (applied.partNumber !== undefined) {
            const el = document.getElementById('item-partnum');
            if (el) el.value = applied.partNumber;
          }
          if (applied.category !== undefined) {
            const el = document.getElementById('item-category');
            if (el) el.value = applied.category;
          }
          if (applied.condition !== undefined) {
            const el = document.getElementById('item-condition');
            if (el) el.value = applied.condition;
          }
          if (applied.quantity !== undefined) {
            const el = document.getElementById('item-quantity');
            if (el) el.value = applied.quantity;
          }
          if (applied.description !== undefined) {
            const el = document.getElementById('item-desc');
            if (el) el.value = applied.description;
          }
          if (applied.supplierInfo !== undefined) {
            const el = document.getElementById('item-supplier');
            if (el) el.value = applied.supplierInfo;
          }
          if (applied.datasheetUrl !== undefined) {
            const el = document.getElementById('item-datasheet');
            if (el) el.value = applied.datasheetUrl;
          }
          if (applied.notes !== undefined) {
            const el = document.getElementById('item-notes');
            if (el) {
              const cur = el.value.trim();
              el.value = cur ? `${cur}\n\n${applied.notes}` : applied.notes;
            }
          }
          if (Array.isArray(applied.tags)) {
            for (const t of applied.tags) {
              addTag(t);
            }
          }
          showToast('✨ AI details applied to form!', 'success');
        },
      });
    } catch (err) {
      console.error('AI Recognition Error:', err);
      showToast(err.message || 'AI recognition failed', 'error');
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = originalHTML;
      }
    }
  }

  // Initial event bindings
  bindUploadEvents();

  // ---- Quantity & Threshold Stepper Controls ----
  const qtyInput = document.getElementById('item-quantity');
  const btnQtyMinus = document.getElementById('btn-qty-minus');
  const btnQtyPlus = document.getElementById('btn-qty-plus');

  if (btnQtyMinus && qtyInput) {
    btnQtyMinus.addEventListener('click', () => {
      const current = parseInt(qtyInput.value, 10) || 0;
      qtyInput.value = Math.max(0, current - 1);
    });
  }

  if (btnQtyPlus && qtyInput) {
    btnQtyPlus.addEventListener('click', () => {
      const current = parseInt(qtyInput.value, 10) || 0;
      qtyInput.value = current + 1;
    });
  }

  // Quick preset buttons for quantity (+1, +5, +10, +50, +100)
  container.querySelectorAll('.btn-qty-delta').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10) || 0;
      const current = parseInt(qtyInput.value, 10) || 0;
      qtyInput.value = Math.max(0, current + delta);
    });
  });

  const threshInput = document.getElementById('item-threshold');
  const btnThreshMinus = document.getElementById('btn-thresh-minus');
  const btnThreshPlus = document.getElementById('btn-thresh-plus');

  if (btnThreshMinus && threshInput) {
    btnThreshMinus.addEventListener('click', () => {
      const current = parseInt(threshInput.value, 10) || 0;
      threshInput.value = Math.max(0, current - 1);
    });
  }

  if (btnThreshPlus && threshInput) {
    btnThreshPlus.addEventListener('click', () => {
      const current = parseInt(threshInput.value, 10) || 0;
      threshInput.value = current + 1;
    });
  }

  // ---- Tags ----
  const tagContainer = document.getElementById('tag-container');
  const tagInput = document.getElementById('tag-input');
  const existingTagsCloud = document.getElementById('existing-tags-cloud');
  const existingTagsWrapper = document.getElementById('existing-tags-wrapper');
  let tags = [...(item.tags || [])];

  function renderExistingTagsCloud() {
    if (!existingTagsCloud || !existingTagsWrapper) return;
    const available = allUniqueTags.filter(t => !tags.includes(t));
    if (available.length === 0) {
      existingTagsWrapper.style.display = 'none';
      return;
    }
    existingTagsWrapper.style.display = 'block';
    existingTagsCloud.innerHTML = available.map(t => `
      <button type="button" class="btn-existing-tag-chip" data-tag="${escapeAttr(t)}" style="background: var(--bg-card); border: 1px solid var(--border-secondary); color: var(--text-secondary); border-radius: var(--border-radius-full); padding: 3px 10px; font-size: var(--font-size-xs); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all var(--transition-fast);">
        <span style="color: var(--accent-primary); font-weight: 700;">+</span> <span>${escapeHtml(t)}</span>
      </button>
    `).join('');
  }

  renderExistingTagsCloud();

  if (existingTagsCloud) {
    existingTagsCloud.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-existing-tag-chip');
      if (btn && btn.dataset.tag) {
        addTag(btn.dataset.tag);
        renderExistingTagsCloud();
        tagInput.focus();
      }
    });
  }

  tagContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.parentElement.classList.contains('tag-chip')) {
      const tag = e.target.parentElement.dataset.tag;
      tags = tags.filter(t => t !== tag);
      e.target.parentElement.remove();
      renderExistingTagsCloud();
    } else {
      tagInput.focus();
    }
  });

  function commitInputTag() {
    if (!tagInput) return;
    const val = tagInput.value.trim().replace(/^,+|,+$/g, '');
    if (val) {
      // Split by comma if user typed or pasted multiple tags
      const parts = val.split(',').map(s => s.trim()).filter(Boolean);
      parts.forEach(p => addTag(p));
      tagInput.value = '';
      renderExistingTagsCloud();
    }
  }

  // Manual "+ Add" button (Essential for mobile browsers)
  const btnAddTagManual = document.getElementById('btn-add-tag-manual');
  if (btnAddTagManual) {
    btnAddTagManual.addEventListener('click', (e) => {
      e.preventDefault();
      commitInputTag();
      tagInput.focus();
    });
  }

  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13 || e.key === ',') {
      e.preventDefault();
      commitInputTag();
    }
    if (e.key === 'Backspace' && !tagInput.value && tags.length > 0) {
      const removed = tags.pop();
      const chips = tagContainer.querySelectorAll('.tag-chip');
      if (chips.length > 0) chips[chips.length - 1].remove();
      renderExistingTagsCloud();
    }
  });

  // Handle typing comma on mobile keyboards
  tagInput.addEventListener('input', () => {
    if (tagInput.value.includes(',')) {
      commitInputTag();
    }
  });

  // Handle mobile blur (when tapping away to another field)
  tagInput.addEventListener('blur', () => {
    commitInputTag();
  });

  // Handle selecting from browser datalist autocomplete
  tagInput.addEventListener('change', () => {
    commitInputTag();
  });

  function addTag(tag) {
    const clean = tag.trim();
    if (!clean || tags.includes(clean)) return;
    tags.push(clean);
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.dataset.tag = clean;
    chip.innerHTML = `${escapeHtml(clean)}<button type="button">&times;</button>`;
    tagContainer.insertBefore(chip, tagInput);
  }

  // Quick Add Category
  const btnQuickCat = document.getElementById('btn-quick-add-cat');
  if (btnQuickCat) {
    btnQuickCat.addEventListener('click', async () => {
      const catName = prompt('Enter new category name:');
      if (!catName || !catName.trim()) return;
      const cleanName = catName.trim();
      const icon = prompt('Enter category icon / emoji (e.g. 🔌, 💡, 🧰, 📟):', '📦') || '📦';
      const color = prompt('Enter category color hex (e.g. #f43f5e, #10b981):', '#818cf8') || '#818cf8';

      try {
        const updated = await saveCategory({ name: cleanName, icon: icon.trim(), color: color.trim() });
        const select = document.getElementById('item-category');
        select.innerHTML = updated.map(c => `<option value="${escapeAttr(c.name)}" ${c.name.toLowerCase() === cleanName.toLowerCase() ? 'selected' : ''}>${c.icon || '📦'} ${c.name}</option>`).join('');
        select.value = cleanName;
        showToast(`Category "${cleanName}" added!`, 'success');
      } catch (err) {
        showToast('Failed to add category: ' + err.message, 'error');
      }
    });
  }

  // Quick Add Location
  const btnQuickLoc = document.getElementById('btn-quick-add-loc');
  if (btnQuickLoc) {
    btnQuickLoc.addEventListener('click', async () => {
      const locName = prompt('Enter storage location name (e.g. Drawer A1, Bin 3, Shelf 2):');
      if (!locName || !locName.trim()) return;
      const cleanName = locName.trim();
      const desc = prompt('Enter location notes / description (optional):', '') || '';

      try {
        const updated = await saveLocation({ name: cleanName, description: desc.trim() });
        const datalist = document.getElementById('storage-locations-list');
        datalist.innerHTML = updated.map(l => `<option value="${escapeAttr(l.name)}">${escapeAttr(l.description ? `${l.name} - ${l.description}` : l.name)}</option>`).join('');
        document.getElementById('item-location').value = cleanName;
        showToast(`Storage location "${cleanName}" added!`, 'success');
      } catch (err) {
        showToast('Failed to add location: ' + err.message, 'error');
      }
    });
  }

  // Scan SKU / Barcode Button
  const btnScanSku = document.getElementById('btn-scan-partnum');
  if (btnScanSku && openScanner) {
    btnScanSku.addEventListener('click', () => {
      openScanner({
        onScanResult: (code) => {
          const input = document.getElementById('item-partnum');
          if (input) {
            input.value = code;
            showToast(`Scanned code: ${code}`, 'success');
          }
        },
      });
    });
  }

  // ---- Form Submit ----
  document.getElementById('item-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Auto-commit any tag typed into the input before saving
    commitInputTag();

    const name = document.getElementById('item-name').value.trim();
    if (!name) {
      showToast('Name is required', 'warning');
      return;
    }

    const locationInput = document.getElementById('item-location');
    const locationVal = locationInput ? locationInput.value.trim() : '';
    if (!locationVal) {
      showToast('Storage location is required', 'warning');
      if (locationInput) locationInput.focus();
      return;
    }

    const now = new Date().toISOString();
    const id = isEdit ? editItemId : generateId();

    // Auto-save location if new
    try {
      await saveLocation({ name: locationVal });
    } catch (e) {}

    const rawThreshold = document.getElementById('item-threshold').value.trim();
    const parsedThreshold = parseInt(rawThreshold, 10);
    const lowStockThreshold = isNaN(parsedThreshold) ? 0 : Math.max(0, parsedThreshold);

    const rawQty = document.getElementById('item-quantity').value.trim();
    const parsedQty = parseInt(rawQty, 10);
    const quantity = isNaN(parsedQty) ? 0 : Math.max(0, parsedQty);

    const savedItem = {
      id,
      name,
      description: document.getElementById('item-desc').value.trim(),
      category: document.getElementById('item-category').value,
      condition: document.getElementById('item-condition').value || DEFAULT_CONDITION,
      tags,
      quantity,
      lowStockThreshold,
      partNumber: document.getElementById('item-partnum').value.trim(),
      location: locationVal,
      datasheetUrl: document.getElementById('item-datasheet').value.trim(),
      supplierInfo: document.getElementById('item-supplier').value.trim(),
      notes: document.getElementById('item-notes').value.trim(),
      isFavorite: item.isFavorite,
      createdAt: isEdit ? item.createdAt : now,
      updatedAt: now,
    };

    await saveItem(savedItem);

    // Handle image
    if (imageFile) {
      await saveImage(id, imageFile);
    } else if (removeImage) {
      await deleteImage(id);
    }

    await addHistory(id, isEdit ? 'updated' : 'created', savedItem.quantity);

    showToast(isEdit ? 'Component updated!' : 'Component added!', 'success');
    navigateTo('inventory');
  });

  // Cancel
  document.getElementById('form-cancel-btn').addEventListener('click', () => {
    navigateTo(isEdit ? 'inventory' : 'dashboard');
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
