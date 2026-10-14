/**
 * SimVentory — AI Intake Queue View
 * Allows bulk photo upload, background AI vision processing, and staged review before vault commit.
 */

import { getLocations, getCategories, getImage } from '../db.js';
import { ITEM_CONDITIONS, getConditionMeta, DEFAULT_CONDITION } from '../categories.js';
import {
  getQueueItems,
  getQueueSummary,
  addFilesToQueue,
  processQueue,
  approveQueueItem,
  approveAllReady,
  discardQueueItem,
  clearQueue,
  retryQueueItem,
  duplicateQueueItem,
  subscribeQueue,
  updateQueueItem,
} from '../services/queueService.js';
import { openAIReviewModal } from './aiReviewModal.js';
import { showToast } from '../toast.js';

let activeUnsubscribe = null;
let cachedThumbnailURLs = {};

export async function renderQueue(container, { navigateTo, refreshView }) {
  const locations = await getLocations();
  const categories = await getCategories();

  // Clean previous listener
  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }

  // Pre-load thumbnail Object URLs for images in queue
  async function syncThumbnails(items) {
    for (const item of items) {
      if (!cachedThumbnailURLs[item.id]) {
        try {
          const blob = await getImage(item.id);
          if (blob) {
            cachedThumbnailURLs[item.id] = URL.createObjectURL(blob);
          }
        } catch (_) {}
      }
    }
  }

  function getRobuLinkUrl(item) {
    const rawUrl = item.aiData?.datasheetUrl;
    if (rawUrl && rawUrl.includes('robu.in')) {
      return rawUrl.replace(/[?&]post_type=product/g, '').replace('?&', '?');
    }
    const sku = (item.aiData?.partNumber || item.partNumber || '').trim();
    const numericSku = sku.match(/\b(\d{4,8})\b/);
    const cleanSku = numericSku ? numericSku[1] : sku;
    return `https://robu.in/?s=${encodeURIComponent(cleanSku)}`;
  }

  function render() {
    const items = getQueueItems();
    const summary = getQueueSummary();
    const percent = summary.total > 0 ? Math.round(((summary.ready + summary.error) / summary.total) * 100) : 0;

    container.innerHTML = `
      <div class="fade-in">
        <!-- View Header -->
        <div class="view-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
          <div>
            <h1>AI Intake Queue</h1>
            <p>Upload photos in bulk, process with AI in the background, and review before adding to inventory</p>
          </div>
          <div id="queue-header-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${summary.ready > 0 ? `
              <button class="btn btn-primary btn-sm" id="btn-approve-all" style="background: linear-gradient(135deg, #10b981, #059669); border: none; display: inline-flex; align-items: center; gap: 6px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Approve All Ready (${summary.ready})
              </button>
            ` : ''}
            ${summary.total > 0 ? `
              <button class="btn btn-secondary btn-sm" id="btn-clear-queue" style="display: inline-flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Clear Queue
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Workflow Guide Banner -->
        <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.22); border-radius: var(--border-radius-md); padding: 10px 16px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div style="font-size: var(--font-size-xs); color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">💡</span>
            <span><strong>Intake Workflow:</strong> Upload photos ➔ AI auto-extracts component specs in background ➔ Review & edit staged cards below ➔ Click <strong>"Approve & Add"</strong> to commit them to your <strong>Main Inventory</strong>.</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-goto-inventory" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px;">
            <span>Main Inventory</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <!-- Bulk Upload Dropzone & Batch Defaults -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-secondary); border-radius: var(--border-radius-lg); padding: 20px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h3 style="font-size: var(--font-size-base); font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>📸</span> Upload Component Photos
              </h3>
              <p style="font-size: var(--font-size-xs); color: var(--text-secondary); margin: 2px 0 0 0;">
                Select single or multiple photos from your workbench or camera roll
              </p>
            </div>
            
            <!-- Batch Mandatory Storage Location & Batch AI Hint -->
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border-primary); padding: 6px 12px; border-radius: var(--border-radius-md);">
                <label for="queue-batch-location" style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-primary); white-space: nowrap;">
                  📍 Batch Location <span class="required" style="color: var(--accent-danger);">*</span>:
                </label>
                <input type="text" id="queue-batch-location" list="batch-locations-list" placeholder="e.g. Drawer A1, Bin 3" style="font-size: var(--font-size-xs); padding: 4px 8px; width: 150px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-card); color: var(--text-primary);" />
                <datalist id="batch-locations-list">
                  ${locations.map(l => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`).join('')}
                </datalist>
                <datalist id="queue-locations-datalist">
                  ${locations.map(l => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`).join('')}
                </datalist>
              </div>

              <div style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border-primary); padding: 6px 12px; border-radius: var(--border-radius-md);">
                <label for="queue-batch-condition" style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-primary); white-space: nowrap;">
                  ✨ Condition:
                </label>
                <select id="queue-batch-condition" style="font-size: var(--font-size-xs); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-card); color: var(--text-primary);">
                  ${ITEM_CONDITIONS.map(c => `<option value="${escapeAttr(c)}">${getConditionMeta(c).icon} ${escapeHtml(c)}</option>`).join('')}
                </select>
              </div>

              <div style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border-primary); padding: 6px 12px; border-radius: var(--border-radius-md);">
                <label for="queue-batch-hint" style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-primary); white-space: nowrap;">
                  💡 Batch AI Hint:
                </label>
                <input type="text" id="queue-batch-hint" placeholder="e.g. SMD 0805, 3.3V sensors" style="font-size: var(--font-size-xs); padding: 4px 8px; width: 170px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-card); color: var(--text-primary);" title="Optional hint provided to AI vision for all photos in this batch" />
              </div>
            </div>
          </div>

          <!-- Drag and drop zone -->
          <div id="queue-dropzone" style="border: 2px dashed var(--border-secondary); border-radius: var(--border-radius-md); padding: 28px 20px; text-align: center; cursor: pointer; transition: all 0.2s ease; background: rgba(99,102,241,0.03);">
            <input type="file" id="queue-file-input" accept="image/*" multiple style="display: none;" />
            <input type="file" id="queue-camera-input" accept="image/*" capture="environment" style="display: none;" />
            
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" style="margin-bottom: 8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div style="font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
              Drop component photos here, or click to choose files
            </div>
            <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: 12px;">
              Supports JPG, PNG, WEBP — upload up to 50 photos at once
            </div>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-browse-queue" style="pointer-events: auto;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                Select Photos
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-camera-queue" style="pointer-events: auto;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Snap with Camera
              </button>
            </div>
          </div>
        </div>

        <!-- Processing Progress & Summary Bar -->
        ${summary.total > 0 ? `
          <div id="queue-summary-box" style="background: var(--bg-card); border: 1px solid var(--border-secondary); border-radius: var(--border-radius-md); padding: 14px 18px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
              <div id="queue-status-text" style="font-size: var(--font-size-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${summary.isProcessing ? `
                  <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <span>Processing queue: <strong>${summary.ready + summary.error} / ${summary.total}</strong> (${percent}%)</span>
                  <span style="font-size: 10px; background: rgba(99,102,241,0.12); color: var(--accent-primary); border: 1px solid rgba(99,102,241,0.25); border-radius: 4px; padding: 1px 6px; font-weight: 600;">⚡ 3 Parallel Workers</span>
                ` : `
                  <span>Queue Status: <strong>${summary.total} component${summary.total !== 1 ? 's' : ''}</strong> staged</span>
                `}
              </div>
              <div id="queue-status-counts" style="display: flex; gap: 12px; font-size: 11.5px; color: var(--text-secondary);">
                <span>✅ <strong>${summary.ready}</strong> Ready</span>
                <span>⏳ <strong>${summary.queued}</strong> Queued</span>
                ${summary.error > 0 ? `<span style="color: var(--accent-danger);">⚠️ <strong>${summary.error}</strong> Failed</span>` : ''}
              </div>
            </div>
            
            <!-- Progress Bar -->
            <div style="width: 100%; height: 6px; background: var(--bg-tertiary); border-radius: 99px; overflow: hidden;">
              <div id="queue-progress-bar-fill" style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #6366f1, #10b981); transition: width 0.3s ease;"></div>
            </div>
          </div>
        ` : ''}

        <!-- Staged Items Deck -->
        <div id="queue-items-container">
          ${items.length === 0 ? `
            <div class="empty-state" style="padding: 48px 20px; background: var(--bg-card); border: 1px dashed var(--border-secondary); border-radius: var(--border-radius-lg);">
              <div style="font-size: 2.5rem; margin-bottom: 8px;">✨</div>
              <h3>Intake Queue is Empty</h3>
              <p>Drag component photos above or click "Select Photos" to catalog items in bulk.</p>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 14px;">
              ${items.map(item => renderQueueItemCard(item, categories)).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderQueueItemCard(item, categories) {
    const thumb = cachedThumbnailURLs[item.id] || '';
    const isReady = item.status === 'ready';
    const isProcessing = item.status === 'processing';
    const isError = item.status === 'error';
    const isRobu = Boolean((item.aiData?.datasheetUrl && item.aiData.datasheetUrl.includes('robu.in')) ||
                           (String(item.aiData?.supplierInfo || item.supplierInfo || '').toLowerCase().includes('robu') && (item.aiData?.partNumber || item.partNumber)));
    const isHubtronics = Boolean((item.aiData?.datasheetUrl && item.aiData.datasheetUrl.includes('hubtronics.in')) ||
                                 (String(item.aiData?.supplierInfo || item.supplierInfo || '').toLowerCase().includes('hubtronics')));

    return `
      <div class="queue-card" data-item-id="${item.id}" style="background: var(--bg-card); border: 1px solid ${isReady ? 'rgba(16,185,129,0.3)' : (isError ? 'rgba(239,68,68,0.3)' : 'var(--border-secondary)')}; border-radius: var(--border-radius-md); padding: 16px; display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; transition: all 0.2s ease;">
        <!-- Thumbnail -->
        <div style="width: 80px; height: 80px; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); border: 1px solid var(--border-secondary); flex-shrink: 0; display: flex; align-items: center; justify-content: center; position: relative;">
          ${thumb ? `
            <img src="${thumb}" alt="${escapeHtml(item.name || 'Component')}" style="width: 100%; height: 100%; object-fit: cover;" />
          ` : `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          `}
          ${item.aiData?.switchedToBackup ? `
            <span style="position: absolute; bottom: 2px; right: 2px; font-size: 10px; background: rgba(0,0,0,0.8); border-radius: 4px; padding: 1px 3px;" title="Analyzed by Backup Model">🛡️</span>
          ` : ''}
        </div>

        <!-- Main Details Form / Status -->
        <div style="flex: 1; min-width: 250px;">
          <!-- Top Row: Status Pill & Model -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <div class="queue-card-status-pill" style="display: flex; align-items: center; gap: 6px;">
              ${isReady ? `
                <span style="font-size: 11px; font-weight: 600; color: #10b981; background: rgba(16,185,129,0.12); padding: 2px 8px; border-radius: 99px; display: inline-flex; align-items: center; gap: 4px;">
                  ✓ Ready for Vault
                </span>
                <span style="font-size: 10.5px; color: var(--text-tertiary);">
                  • ${escapeHtml(item.aiData?.modelUsed || 'AI Vision')}
                </span>
              ` : isProcessing ? `
                <span style="font-size: 11px; font-weight: 600; color: var(--accent-primary); background: rgba(99,102,241,0.12); padding: 2px 8px; border-radius: 99px; display: inline-flex; align-items: center; gap: 4px;">
                  <svg class="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Analyzing with AI...
                </span>
              ` : isError ? `
                <span style="font-size: 11px; font-weight: 600; color: var(--accent-danger); background: rgba(239,68,68,0.12); padding: 2px 8px; border-radius: 99px;">
                  ⚠️ Error: ${escapeHtml(item.error || 'Failed')}
                </span>
              ` : `
                <span style="font-size: 11px; font-weight: 500; color: var(--text-secondary); background: var(--bg-tertiary); padding: 2px 8px; border-radius: 99px;">
                  ⏳ In Queue...
                </span>
              `}
            </div>

            <div class="queue-card-links" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              ${item.aiData?.partNumber ? `
                <span style="font-size: 10px; color: #10b981; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); padding: 1px 6px; border-radius: 4px;">
                  Barcode Detected
                </span>
              ` : ''}
              ${isRobu ? `
                <a href="${escapeAttr(getRobuLinkUrl(item))}" target="_blank" rel="noopener" style="font-size: 10px; font-weight: 600; color: #0284c7; background: rgba(2,132,199,0.1); border: 1px solid rgba(2,132,199,0.25); padding: 1px 6px; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 3px;" title="View product specs on Robu.in">
                  🛒 Robu.in ↗
                </a>
              ` : ''}
              ${isHubtronics ? `
                <a href="${escapeAttr(item.aiData?.datasheetUrl || `https://hubtronics.in/index.php?route=product/search&search=${encodeURIComponent(item.name || item.partNumber)}`)}" target="_blank" rel="noopener" style="font-size: 10px; font-weight: 600; color: #f59e0b; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); padding: 1px 6px; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 3px;" title="View product specs on Hubtronics">
                  🛒 Hubtronics ↗
                </a>
              ` : ''}
            </div>
          </div>

          <!-- Card Status Indicator -->
          <div class="queue-card-submsg">
            ${isError ? `
              <div style="font-size: var(--font-size-xs); color: var(--accent-danger); margin-bottom: 8px;">
                ${escapeHtml(item.fileName)} • Error: ${escapeHtml(item.error)}
              </div>
            ` : isProcessing ? `
              <div style="font-size: var(--font-size-xs); color: var(--accent-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                <span>${escapeHtml(item.fileName)} (${Math.round(item.fileSize / 1024)} KB) • Analyzing with AI in background...</span>
              </div>
            ` : !isReady ? `
              <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: 8px;">
                ${escapeHtml(item.fileName)} (${Math.round(item.fileSize / 1024)} KB) • Waiting in queue...
              </div>
            ` : ''}
          </div>

          <!-- Editable Fields on Card -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 10px;">
            <div>
              <label style="font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Name *</label>
              <input type="text" class="queue-item-name" data-id="${item.id}" value="${escapeAttr(item.name || (isReady ? 'Electronic Component' : item.fileName))}" placeholder="Component Name" style="width: 100%; font-size: var(--font-size-xs); font-weight: 600; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-primary); color: var(--text-primary);" />
            </div>
            <div>
              <label style="font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Category</label>
              <select class="queue-item-cat" data-id="${item.id}" style="width: 100%; font-size: var(--font-size-xs); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-primary); color: var(--text-primary);">
                ${categories.map(c => `
                  <option value="${escapeAttr(c.name)}" ${(item.category || item.aiData?.category) === c.name ? 'selected' : ''}>${c.icon || '📦'} ${escapeHtml(c.name)}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label style="font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Storage Location *</label>
              <input type="text" list="queue-locations-datalist" class="queue-item-location" data-id="${item.id}" value="${escapeAttr(item.location || '')}" placeholder="Required location" required style="width: 100%; font-size: var(--font-size-xs); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-primary); color: var(--text-primary);" />
            </div>
            <div>
              <label style="font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Condition</label>
              <select class="queue-item-condition" data-id="${item.id}" style="width: 100%; font-size: var(--font-size-xs); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-primary); color: var(--text-primary);">
                ${ITEM_CONDITIONS.map(c => `
                  <option value="${escapeAttr(c)}" ${(item.condition || item.aiData?.condition || DEFAULT_CONDITION) === c ? 'selected' : ''}>${getConditionMeta(c).icon} ${escapeHtml(c)}</option>
                `).join('')}
              </select>
            </div>
            <div style="display: flex; gap: 8px;">
              <div style="flex: 1;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Qty</label>
                <input type="number" min="0" class="queue-item-qty" data-id="${item.id}" value="${item.quantity !== undefined ? item.quantity : 1}" style="width: 100%; font-size: var(--font-size-xs); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-primary); color: var(--text-primary); text-align: center;" />
              </div>
              <div style="flex: 1;">
                <label style="font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Part # / SKU</label>
                <input type="text" class="queue-item-partnum" data-id="${item.id}" value="${escapeAttr(item.partNumber || '')}" placeholder="Optional" style="width: 100%; font-size: var(--font-size-xs); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-secondary); background: var(--bg-primary); color: var(--text-primary);" />
              </div>
            </div>
          </div>

          <div class="queue-card-tags">
            ${isReady && item.tags && item.tags.length > 0 ? `
              <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px;">
                ${item.tags.slice(0, 5).map(t => `<span style="font-size: 10px; background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary); padding: 1px 6px; border-radius: 4px;">${escapeHtml(t)}</span>`).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Bottom Card Action Controls -->
          <div class="queue-card-actions" style="display: flex; gap: 8px; align-items: center; justify-content: flex-end; border-top: 1px solid var(--border-primary); padding-top: 10px;">
            ${isReady ? `
              <button type="button" class="btn btn-secondary btn-sm btn-inspect-queue" data-id="${item.id}" style="padding: 4px 10px; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Fine-tune Details
              </button>
              <button type="button" class="btn btn-secondary btn-sm btn-duplicate-queue" data-id="${item.id}" style="padding: 4px 10px; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;" title="Duplicate card to split into another condition or location">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Duplicate
              </button>
              <button type="button" class="btn btn-primary btn-sm btn-approve-queue" data-id="${item.id}" style="padding: 4px 12px; font-size: 11.5px; background: linear-gradient(135deg, #10b981, #059669); border: none; display: inline-flex; align-items: center; gap: 4px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Approve & Add
              </button>
            ` : isError ? `
              <button type="button" class="btn btn-secondary btn-sm btn-retry-queue" data-id="${item.id}" style="padding: 4px 10px; font-size: 11.5px;">
                ↺ Retry Analysis
              </button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-sm btn-discard-queue" data-id="${item.id}" style="padding: 4px 8px; font-size: 11.5px; color: var(--accent-danger);" title="Discard item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function bindCardActionButtons(card, id) {
    const approveBtn = card.querySelector('.btn-approve-queue');
    if (approveBtn && !approveBtn._bound) {
      approveBtn._bound = true;
      approveBtn.addEventListener('click', async () => {
        const nameVal = card.querySelector('.queue-item-name')?.value.trim();
        const locVal = card.querySelector('.queue-item-location')?.value.trim();
        const catVal = card.querySelector('.queue-item-cat')?.value;
        const condVal = card.querySelector('.queue-item-condition')?.value;
        const qtyVal = parseInt(card.querySelector('.queue-item-qty')?.value, 10) || 1;
        const partVal = card.querySelector('.queue-item-partnum')?.value.trim();

        if (!nameVal) {
          showToast('Component name is required', 'warning');
          return;
        }
        if (!locVal) {
          showToast('Storage location is required', 'warning');
          card.querySelector('.queue-item-location')?.focus();
          return;
        }

        try {
          const saved = await approveQueueItem(id, {
            name: nameVal,
            location: locVal,
            category: catVal,
            condition: condVal,
            quantity: qtyVal,
            partNumber: partVal,
          });
          showToast(`✓ "${saved.name}" added to vault!`, 'success');
          if (refreshView) refreshView();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const inspectBtn = card.querySelector('.btn-inspect-queue');
    if (inspectBtn && !inspectBtn._bound) {
      inspectBtn._bound = true;
      inspectBtn.addEventListener('click', async () => {
        const item = getQueueItems().find(i => i.id === id);
        if (!item || !item.aiData) return;

        openAIReviewModal({
          aiData: item.aiData,
          imageSrc: cachedThumbnailURLs[id],
          categories,
          onApply: async (applied) => {
            updateQueueItem(id, {
              ...applied,
              aiData: { ...item.aiData, ...applied },
            }, { userInitiated: true });
            showToast('Changes saved to queued card', 'info');
          },
        });
      });
    }

    const dupBtn = card.querySelector('.btn-duplicate-queue');
    if (dupBtn && !dupBtn._bound) {
      dupBtn._bound = true;
      dupBtn.addEventListener('click', async () => {
        // Sync any typed values on this card before cloning
        const nameVal = card.querySelector('.queue-item-name')?.value.trim();
        const locVal = card.querySelector('.queue-item-location')?.value.trim();
        const catVal = card.querySelector('.queue-item-cat')?.value;
        const condVal = card.querySelector('.queue-item-condition')?.value;
        const qtyVal = parseInt(card.querySelector('.queue-item-qty')?.value, 10);
        const partVal = card.querySelector('.queue-item-partnum')?.value.trim();

        const updates = {};
        if (nameVal) updates.name = nameVal;
        if (locVal) updates.location = locVal;
        if (catVal) updates.category = catVal;
        if (condVal) updates.condition = condVal;
        if (Number.isFinite(qtyVal)) updates.quantity = qtyVal;
        if (partVal) updates.partNumber = partVal;

        if (Object.keys(updates).length > 0) {
          updateQueueItem(id, updates, { silent: true, userInitiated: true });
        }

        dupBtn.disabled = true;
        try {
          const clone = await duplicateQueueItem(id);
          showToast(`📋 Duplicated "${clone.name || 'Component'}" card! Set new location / condition.`, 'success');
        } catch (err) {
          showToast('Failed to duplicate card: ' + err.message, 'error');
          dupBtn.disabled = false;
        }
      });
    }

    const retryBtn = card.querySelector('.btn-retry-queue');
    if (retryBtn && !retryBtn._bound) {
      retryBtn._bound = true;
      retryBtn.addEventListener('click', () => {
        retryQueueItem(id);
        showToast('Retrying analysis...', 'info');
      });
    }

    const discardBtn = card.querySelector('.btn-discard-queue');
    if (discardBtn && !discardBtn._bound) {
      discardBtn._bound = true;
      discardBtn.addEventListener('click', () => {
        discardQueueItem(id);
        showToast('Item discarded from queue', 'info');
      });
    }
  }

  function bindCardInputs(card, id) {
    const nameInput = card.querySelector('.queue-item-name');
    if (nameInput && !nameInput._bound) {
      nameInput._bound = true;
      nameInput.addEventListener('input', (e) => {
        updateQueueItem(id, { name: e.target.value }, { silent: true, userInitiated: true });
      });
      nameInput.addEventListener('change', (e) => {
        updateQueueItem(id, { name: e.target.value.trim() }, { silent: true, userInitiated: true });
      });
    }

    const catSelect = card.querySelector('.queue-item-cat');
    if (catSelect && !catSelect._bound) {
      catSelect._bound = true;
      catSelect.addEventListener('change', (e) => {
        updateQueueItem(id, { category: e.target.value }, { silent: true, userInitiated: true });
      });
    }

    const locInput = card.querySelector('.queue-item-location');
    if (locInput && !locInput._bound) {
      locInput._bound = true;
      locInput.addEventListener('input', (e) => {
        updateQueueItem(id, { location: e.target.value }, { silent: true, userInitiated: true });
      });
      locInput.addEventListener('change', (e) => {
        updateQueueItem(id, { location: e.target.value.trim() }, { silent: true, userInitiated: true });
      });
    }

    const condSelect = card.querySelector('.queue-item-condition');
    if (condSelect && !condSelect._bound) {
      condSelect._bound = true;
      condSelect.addEventListener('change', (e) => {
        updateQueueItem(id, { condition: e.target.value }, { silent: true, userInitiated: true });
      });
    }

    const qtyInput = card.querySelector('.queue-item-qty');
    if (qtyInput && !qtyInput._bound) {
      qtyInput._bound = true;
      qtyInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (Number.isFinite(val)) updateQueueItem(id, { quantity: val }, { silent: true, userInitiated: true });
      });
    }

    const partInput = card.querySelector('.queue-item-partnum');
    if (partInput && !partInput._bound) {
      partInput._bound = true;
      partInput.addEventListener('input', (e) => {
        updateQueueItem(id, { partNumber: e.target.value }, { silent: true, userInitiated: true });
      });
      partInput.addEventListener('change', (e) => {
        updateQueueItem(id, { partNumber: e.target.value.trim() }, { silent: true, userInitiated: true });
      });
    }
  }

  async function handleApproveAll() {
    const summary = getQueueSummary();
    if (summary.ready === 0) return;

    // Sync any manually edited fields from DOM cards first without overwriting valid data with filenames
    const queueList = getQueueItems();
    container.querySelectorAll('.queue-card').forEach(card => {
      const id = card.dataset.itemId;
      const liveItem = queueList.find(i => i.id === id);
      if (!id || !liveItem) return;

      const nameInput = card.querySelector('.queue-item-name');
      const locInput = card.querySelector('.queue-item-location');
      const catSelect = card.querySelector('.queue-item-cat');
      const condSelect = card.querySelector('.queue-item-condition');
      const qtyInput = card.querySelector('.queue-item-qty');
      const partInput = card.querySelector('.queue-item-partnum');

      const updates = {};
      const nameVal = nameInput?.value.trim();
      if (nameVal && nameVal !== liveItem.fileName && (!liveItem.name || nameVal !== liveItem.name)) {
        updates.name = nameVal;
      }
      const locVal = locInput?.value.trim();
      if (locVal && locVal !== liveItem.location) {
        updates.location = locVal;
      }
      const catVal = catSelect?.value;
      if (catVal && catVal !== liveItem.category) {
        updates.category = catVal;
      }
      const condVal = condSelect?.value;
      if (condVal && condVal !== liveItem.condition) {
        updates.condition = condVal;
      }
      const qtyVal = parseInt(qtyInput?.value, 10);
      if (Number.isFinite(qtyVal) && qtyVal !== liveItem.quantity) {
        updates.quantity = qtyVal;
      }
      const partVal = partInput?.value.trim();
      if (partVal && partVal !== liveItem.partNumber) {
        updates.partNumber = partVal;
      }

      if (Object.keys(updates).length > 0) {
        updateQueueItem(id, updates, { userInitiated: true });
      }
    });

    showToast(`Approving ${summary.ready} components into vault...`, 'info');
    const approved = await approveAllReady();
    showToast(`✨ ${approved.length} components added to inventory!`, 'success');
    if (refreshView) refreshView();
  }

  function handleClearQueue() {
    if (confirm('Are you sure you want to clear the entire AI intake queue?')) {
      clearQueue();
      showToast('Queue cleared', 'info');
    }
  }

  function updateInPlace(updatedItems, summary) {
    const percent = summary.total > 0 ? Math.round(((summary.ready + summary.error) / summary.total) * 100) : 0;

    // 1. Update header actions & counts
    const headerActions = document.getElementById('queue-header-actions');
    if (headerActions) {
      headerActions.innerHTML = `
        ${summary.ready > 0 ? `
          <button class="btn btn-primary btn-sm" id="btn-approve-all" style="background: linear-gradient(135deg, #10b981, #059669); border: none; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Approve All Ready (${summary.ready})
          </button>
        ` : ''}
        ${summary.total > 0 ? `
          <button class="btn btn-secondary btn-sm" id="btn-clear-queue" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear Queue
          </button>
        ` : ''}
      `;
      document.getElementById('btn-approve-all')?.addEventListener('click', handleApproveAll);
      document.getElementById('btn-clear-queue')?.addEventListener('click', handleClearQueue);
    }

    // 2. Update progress bar & status text
    const statusTextEl = document.getElementById('queue-status-text');
    if (statusTextEl) {
      statusTextEl.innerHTML = summary.isProcessing ? `
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span>Processing queue: <strong>${summary.ready + summary.error} / ${summary.total}</strong> (${percent}%)</span>
        <span style="font-size: 10px; background: rgba(99,102,241,0.12); color: var(--accent-primary); border: 1px solid rgba(99,102,241,0.25); border-radius: 4px; padding: 1px 6px; font-weight: 600;">⚡ 3 Parallel Workers</span>
      ` : `
        <span>Queue Status: <strong>${summary.total} component${summary.total !== 1 ? 's' : ''}</strong> staged</span>
      `;
    }

    const countsEl = document.getElementById('queue-status-counts');
    if (countsEl) {
      countsEl.innerHTML = `
        <span>✅ <strong>${summary.ready}</strong> Ready</span>
        <span>⏳ <strong>${summary.queued}</strong> Queued</span>
        ${summary.error > 0 ? `<span style="color: var(--accent-danger);">⚠️ <strong>${summary.error}</strong> Failed</span>` : ''}
      `;
    }

    const progressFill = document.getElementById('queue-progress-bar-fill');
    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }

    // 3. Update individual cards in-place
    const activeEl = document.activeElement;
    for (const item of updatedItems) {
      const card = container.querySelector(`.queue-card[data-item-id="${item.id}"]`);
      if (!card) continue;

      const isReady = item.status === 'ready';
      const isProcessing = item.status === 'processing';
      const isError = item.status === 'error';

      // Card border
      card.style.borderColor = isReady ? 'rgba(16,185,129,0.3)' : (isError ? 'rgba(239,68,68,0.3)' : 'var(--border-secondary)');

      // Top status badge
      const statusPill = card.querySelector('.queue-card-status-pill');
      if (statusPill) {
        statusPill.innerHTML = isReady ? `
          <span style="font-size: 11px; font-weight: 600; color: #10b981; background: rgba(16,185,129,0.12); padding: 2px 8px; border-radius: 99px; display: inline-flex; align-items: center; gap: 4px;">
            ✓ Ready for Vault
          </span>
          <span style="font-size: 10.5px; color: var(--text-tertiary);">
            • ${escapeHtml(item.aiData?.modelUsed || 'AI Vision')}
          </span>
        ` : isProcessing ? `
          <span style="font-size: 11px; font-weight: 600; color: var(--accent-primary); background: rgba(99,102,241,0.12); padding: 2px 8px; border-radius: 99px; display: inline-flex; align-items: center; gap: 4px;">
            <svg class="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Analyzing with AI...
          </span>
        ` : isError ? `
          <span style="font-size: 11px; font-weight: 600; color: var(--accent-danger); background: rgba(239,68,68,0.12); padding: 2px 8px; border-radius: 99px;">
            ⚠️ Error: ${escapeHtml(item.error || 'Failed')}
          </span>
        ` : `
          <span style="font-size: 11px; font-weight: 500; color: var(--text-secondary); background: var(--bg-tertiary); padding: 2px 8px; border-radius: 99px;">
            ⏳ In Queue...
          </span>
        `;
      }

      // Card link badges (Robu / Hubtronics / Barcode)
      const linksContainer = card.querySelector('.queue-card-links');
      if (linksContainer) {
        const isRobu = Boolean((item.aiData?.datasheetUrl && item.aiData.datasheetUrl.includes('robu.in')) ||
                               (String(item.aiData?.supplierInfo || item.supplierInfo || '').toLowerCase().includes('robu') && (item.aiData?.partNumber || item.partNumber)));
        const isHubtronics = Boolean((item.aiData?.datasheetUrl && item.aiData.datasheetUrl.includes('hubtronics.in')) ||
                                     (String(item.aiData?.supplierInfo || item.supplierInfo || '').toLowerCase().includes('hubtronics')));

        linksContainer.innerHTML = `
          ${item.aiData?.partNumber ? `
            <span style="font-size: 10px; color: #10b981; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); padding: 1px 6px; border-radius: 4px;">
              Barcode Detected
            </span>
          ` : ''}
          ${isRobu ? `
            <a href="${escapeAttr(getRobuLinkUrl(item))}" target="_blank" rel="noopener" style="font-size: 10px; font-weight: 600; color: #0284c7; background: rgba(2,132,199,0.1); border: 1px solid rgba(2,132,199,0.25); padding: 1px 6px; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 3px;" title="View product specs on Robu.in">
              🛒 Robu.in ↗
            </a>
          ` : ''}
          ${isHubtronics ? `
            <a href="${escapeAttr(item.aiData?.datasheetUrl || `https://hubtronics.in/index.php?route=product/search&search=${encodeURIComponent(item.name || item.partNumber)}`)}" target="_blank" rel="noopener" style="font-size: 10px; font-weight: 600; color: #f59e0b; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); padding: 1px 6px; border-radius: 4px; text-decoration: none; display: inline-flex; align-items: center; gap: 3px;" title="View product specs on Hubtronics">
              🛒 Hubtronics ↗
            </a>
          ` : ''}
        `;
      }

      // Update Subtitle/Status message under header
      const subMsg = card.querySelector('.queue-card-submsg');
      if (subMsg) {
        if (isError) {
          subMsg.innerHTML = `
            <div style="font-size: var(--font-size-xs); color: var(--accent-danger); margin-bottom: 8px;">
              ${escapeHtml(item.fileName)} • Error: ${escapeHtml(item.error)}
            </div>
          `;
        } else if (isProcessing) {
          subMsg.innerHTML = `
            <div style="font-size: var(--font-size-xs); color: var(--accent-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <span>${escapeHtml(item.fileName)} (${Math.round(item.fileSize / 1024)} KB) • Analyzing with AI in background...</span>
            </div>
          `;
        } else if (!isReady) {
          subMsg.innerHTML = `
            <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: 8px;">
              ${escapeHtml(item.fileName)} (${Math.round(item.fileSize / 1024)} KB) • Waiting in queue...
            </div>
          `;
        } else {
          subMsg.innerHTML = '';
        }
      }

      // Card input fields (only update if not currently active and not user-edited)
      const nameInput = card.querySelector('.queue-item-name');
      if (nameInput && nameInput !== activeEl && !item.userEdited?.name) {
        nameInput.value = item.name || (isReady ? 'Electronic Component' : item.fileName);
      }
      const catSelect = card.querySelector('.queue-item-cat');
      if (catSelect && catSelect !== activeEl && !item.userEdited?.category && (item.category || item.aiData?.category)) {
        catSelect.value = item.category || item.aiData?.category;
      }
      const partInput = card.querySelector('.queue-item-partnum');
      if (partInput && partInput !== activeEl && !item.userEdited?.partNumber && (item.partNumber || item.aiData?.partNumber)) {
        partInput.value = item.partNumber || item.aiData?.partNumber;
      }
      const qtyInput = card.querySelector('.queue-item-qty');
      if (qtyInput && qtyInput !== activeEl && !item.userEdited?.quantity && item.quantity !== undefined) {
        qtyInput.value = item.quantity;
      }
      const condSelect = card.querySelector('.queue-item-condition');
      if (condSelect && condSelect !== activeEl && !item.userEdited?.condition && (item.condition || item.aiData?.condition)) {
        condSelect.value = item.condition || item.aiData?.condition;
      }

      // Card tags container
      const tagsContainer = card.querySelector('.queue-card-tags');
      if (tagsContainer) {
        if (isReady && item.tags && item.tags.length > 0) {
          tagsContainer.innerHTML = `
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px;">
              ${item.tags.slice(0, 5).map(t => `<span style="font-size: 10px; background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary); padding: 1px 6px; border-radius: 4px;">${escapeHtml(t)}</span>`).join('')}
            </div>
          `;
        } else {
          tagsContainer.innerHTML = '';
        }
      }

      // Card action buttons
      const actionsContainer = card.querySelector('.queue-card-actions');
      if (actionsContainer) {
        const hasApproveBtn = actionsContainer.querySelector('.btn-approve-queue');
        if (isReady && !hasApproveBtn) {
          actionsContainer.innerHTML = `
            <button type="button" class="btn btn-secondary btn-sm btn-inspect-queue" data-id="${item.id}" style="padding: 4px 10px; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Fine-tune Details
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-duplicate-queue" data-id="${item.id}" style="padding: 4px 10px; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;" title="Duplicate card to split into another condition or location">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Duplicate
            </button>
            <button type="button" class="btn btn-primary btn-sm btn-approve-queue" data-id="${item.id}" style="padding: 4px 12px; font-size: 11.5px; background: linear-gradient(135deg, #10b981, #059669); border: none; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Approve & Add
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-discard-queue" data-id="${item.id}" style="padding: 4px 8px; font-size: 11.5px; color: var(--accent-danger);" title="Discard item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          `;
          bindCardActionButtons(card, item.id);
        } else if (isError && !actionsContainer.querySelector('.btn-retry-queue')) {
          actionsContainer.innerHTML = `
            <button type="button" class="btn btn-secondary btn-sm btn-retry-queue" data-id="${item.id}" style="padding: 4px 10px; font-size: 11.5px;">
              ↺ Retry Analysis
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-discard-queue" data-id="${item.id}" style="padding: 4px 8px; font-size: 11.5px; color: var(--accent-danger);" title="Discard item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          `;
          bindCardActionButtons(card, item.id);
        }
      }
    }
  }

  function bindEvents() {
    const fileInput = document.getElementById('queue-file-input');
    const cameraInput = document.getElementById('queue-camera-input');
    const dropzone = document.getElementById('queue-dropzone');
    const batchLocInput = document.getElementById('queue-batch-location');
    const batchHintInput = document.getElementById('queue-batch-hint');

    // Trigger upload
    const handleFiles = async (files) => {
      if (!files || files.length === 0) return;
      const defaultLoc = (batchLocInput?.value || '').trim() || 'Unsorted';
      const batchCondInput = document.getElementById('queue-batch-condition');
      const defaultCond = batchCondInput?.value || DEFAULT_CONDITION;
      const defaultHint = (batchHintInput?.value || '').trim();
      showToast(`Adding ${files.length} photo${files.length !== 1 ? 's' : ''} to AI queue...`, 'info');
      await addFilesToQueue(files, { defaultLocation: defaultLoc, defaultCondition: defaultCond, defaultHint, defaultQuantity: 1, defaultThreshold: 0 });
    };

    if (dropzone) {
      dropzone.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        fileInput?.click();
      });
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent-primary)';
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--border-secondary)';
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border-secondary)';
        if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
      });
    }

    document.getElementById('btn-browse-queue')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    document.getElementById('btn-camera-queue')?.addEventListener('click', (e) => {
      e.stopPropagation();
      cameraInput?.click();
    });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files) handleFiles(fileInput.files);
      fileInput.value = '';
    });

    cameraInput?.addEventListener('change', () => {
      if (cameraInput.files) handleFiles(cameraInput.files);
      cameraInput.value = '';
    });

    // Navigate to Inventory view
    document.getElementById('btn-goto-inventory')?.addEventListener('click', () => {
      if (navigateTo) navigateTo('inventory');
    });

    // Bulk approve all ready
    document.getElementById('btn-approve-all')?.addEventListener('click', handleApproveAll);

    // Clear queue
    document.getElementById('btn-clear-queue')?.addEventListener('click', handleClearQueue);

    // Bind inputs and action buttons for all rendered cards
    container.querySelectorAll('.queue-card').forEach(card => {
      const id = card.dataset.itemId;
      if (id) {
        bindCardInputs(card, id);
        bindCardActionButtons(card, id);
      }
    });
  }

  // Subscribe to live queue updates
  activeUnsubscribe = subscribeQueue(async (updatedItems, summary) => {
    // If the queue view is unmounted or user navigated away, cancel subscription and do not touch DOM!
    if (!document.body.contains(container) || !container.querySelector('#queue-dropzone')) {
      if (activeUnsubscribe) {
        activeUnsubscribe();
        activeUnsubscribe = null;
      }
      return;
    }

    await syncThumbnails(updatedItems);

    const existingCards = container.querySelectorAll('.queue-card');
    const existingIds = Array.from(existingCards).map(c => c.dataset.itemId);
    const updatedIds = updatedItems.map(i => i.id);

    // Check if queue item structure (membership/order) changed
    const structureChanged = existingIds.length !== updatedIds.length || !existingIds.every((id, idx) => id === updatedIds[idx]);

    if (structureChanged) {
      const activeEl = document.activeElement;
      if (activeEl && container.contains(activeEl) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeEl.tagName)) {
        // If user is actively typing, update cards in-place where possible to avoid destroying focus
        updateInPlace(updatedItems, summary);
        return;
      }
      render();
    } else {
      // Structure identical: update in-place smoothly without tearing down DOM or interrupting inputs
      updateInPlace(updatedItems, summary);
    }
  });

  // Initial sync & render
  const initialItems = getQueueItems();
  await syncThumbnails(initialItems);
  render();

  // Resume or start processing if any items are queued
  if (initialItems.some(i => i.status === 'queued')) {
    processQueue();
  }

  // Return cleanup function to unsubscribe when navigating away
  return () => {
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
