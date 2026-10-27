/**
 * SimVentory — Invoice & Order Intake View
 * Allows users to upload invoices (PDFs, images, or camera photos) when new orders arrive.
 * Automatically parses line items, quantities, SKUs, and prices via AI,
 * cross-references against existing inventory, and provides an interactive reconciliation
 * interface asking whether to update existing stock or create a new entry for each item.
 */

import { getAllItems, saveItem, addHistory, getCategories, getLocations, saveLocation, generateId, getImage, saveImage } from '../db.js';
import { analyzeInvoiceDocument, getAISettings } from '../services/aiService.js';
import { renderPdfPages } from '../services/pdfUtil.js';
import { openCameraModal } from './cameraModal.js';
import { openCropperModal } from './cropperModal.js';
import { openWebImageModal } from './webImageModal.js';
import { searchComponentImages, fetchWebImageBlob } from '../services/imageSearchService.js';
import { showToast } from '../toast.js';
import { ITEM_CONDITIONS, getCategoryColor, getConditionMeta } from '../categories.js';
import { addFilesToQueue } from '../services/queueService.js';
import { getItemDefaults } from '../services/itemDefaultsService.js';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

export async function renderInvoiceView(container, { navigateTo, openItemModal, refreshView }) {
  const allItems = await getAllItems();
  const categories = await getCategories();
  const locations = await getLocations();
  const aiSettings = getAISettings();

  // State
  let currentFile = null;
  let fileType = null; // 'pdf' | 'image'
  let pdfPages = []; // [{ pageNumber, totalPages, dataUrl, text }]
  let activePageIdx = 0;
  let imagePreviewUrl = null;
  let isAnalyzing = false;
  let analysisResult = null; // Extracted invoice data
  let reconciledItems = []; // [{ ...item, matchId, action: 'update'|'create', included: boolean }]
  let defaultLocationName = locations[0]?.name || 'Storage Bin 1';

  function render() {
    container.innerHTML = `
      <div class="fade-in invoice-view-container" style="max-width: 1200px; margin: 0 auto; padding-bottom: 40px;">
        <!-- Header -->
        <div class="view-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; box-shadow: 0 4px 12px rgba(99,102,241,0.3);">
                📄
              </div>
              <div>
                <h1 style="font-size: var(--font-size-2xl); font-weight: 800; margin: 0; color: var(--text-primary); letter-spacing: -0.02em;">
                  Order & Invoice Intake
                </h1>
                <p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin: 3px 0 0 0;">
                  Upload order invoices, receipts, or packing slips to automatically parse items, update stock, or add arriving components.
                </p>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-goto-inventory" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              View Inventory
            </button>
          </div>
        </div>

        ${!aiSettings.enabled ? `
          <div style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--border-radius-md); padding: 14px 18px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 10px; color: #f87171;">
              <span style="font-size: 20px;">⚠️</span>
              <div>
                <div style="font-weight: 700; font-size: var(--font-size-sm);">AI Engine Disabled</div>
                <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 2px;">
                  Automatic invoice document recognition requires enabling an AI model in Settings.
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="btn-goto-settings">Open Settings</button>
          </div>
        ` : ''}

        <!-- Top Stage: Document Upload / Selector -->
        ${!analysisResult ? renderUploadStage() : renderReconciliationStage()}
      </div>
    `;

    bindEvents();
  }

  function renderUploadStage() {
    return `
      <div class="card" style="padding: 24px; border-radius: var(--border-radius-lg); background: var(--bg-card); border: 1px solid var(--border-primary);">
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Dropzone -->
          <div id="invoice-dropzone" class="invoice-dropzone ${currentFile ? 'has-file' : ''}" style="
            border: 2px dashed ${currentFile ? 'var(--accent-primary)' : 'var(--border-secondary)'};
            border-radius: var(--border-radius-md);
            padding: ${currentFile ? '18px' : '40px 20px'};
            text-align: center;
            background: ${currentFile ? 'rgba(99,102,241,0.03)' : 'var(--bg-secondary)'};
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
          ">
            <input type="file" id="invoice-file-input" accept=".pdf,image/png,image/jpeg,image/webp,image/jpg" style="display: none;" />

            ${!currentFile ? `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                </div>
                <div>
                  <div style="font-size: var(--font-size-base); font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                    Drop your invoice or packing slip here
                  </div>
                  <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">
                    Supports PDF documents, order receipts, and photos (PDF, PNG, JPG, WEBP)
                  </div>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap; justify-content: center;">
                  <button type="button" class="btn btn-primary btn-sm" id="btn-browse-file" style="display: inline-flex; align-items: center; gap: 6px;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Browse Invoice File
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-camera-invoice" style="display: inline-flex; align-items: center; gap: 6px;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Snap Paper Invoice
                  </button>
                </div>
              </div>
            ` : `
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
                <div style="display: flex; align-items: center; gap: 14px; text-align: left;">
                  <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(99,102,241,0.15); display: flex; align-items: center; justify-content: center; font-size: 22px;">
                    ${fileType === 'pdf' ? '📕' : '🖼️'}
                  </div>
                  <div>
                    <div style="font-weight: 700; font-size: var(--font-size-sm); color: var(--text-primary); word-break: break-all;">
                      ${escapeHtml(currentFile.name || 'Invoice Document')}
                    </div>
                    <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 2px;">
                      ${fileType === 'pdf' ? `${pdfPages.length} page${pdfPages.length !== 1 ? 's' : ''} extracted` : 'Image file ready'} • ${(currentFile.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-change-file">
                    Change File
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-remove-file" style="color: var(--accent-danger);">
                    ✕ Remove
                  </button>
                </div>
              </div>
            `}
          </div>

          <!-- Document Preview Area (Visible when a file is selected) -->
          ${currentFile ? `
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-secondary); border-radius: var(--border-radius-md); padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                <div style="font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                  <span>Preview</span>
                  ${fileType === 'pdf' ? `
                    <span style="font-size: 11px; background: var(--bg-tertiary); padding: 2px 8px; border-radius: 99px; color: var(--text-secondary); border: 1px solid var(--border-primary);">
                      Page ${activePageIdx + 1} of ${pdfPages.length}
                    </span>
                  ` : ''}
                </div>
                ${fileType === 'pdf' && pdfPages.length > 1 ? `
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-pdf-prev" ${activePageIdx === 0 ? 'disabled' : ''} style="padding: 3px 8px; font-size: 11px;">
                      ◀ Prev
                    </button>
                    <span style="font-size: var(--font-size-xs); color: var(--text-secondary);">
                      ${activePageIdx + 1} / ${pdfPages.length}
                    </span>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-pdf-next" ${activePageIdx === pdfPages.length - 1 ? 'disabled' : ''} style="padding: 3px 8px; font-size: 11px;">
                      Next ▶
                    </button>
                  </div>
                ` : ''}
              </div>

              <!-- Page Display Frame -->
              <div style="max-height: 440px; overflow-y: auto; background: #1a1a24; border-radius: 8px; display: flex; justify-content: center; align-items: center; padding: 12px; border: 1px solid var(--border-primary);">
                <img
                  src="${fileType === 'pdf' ? (pdfPages[activePageIdx]?.dataUrl || '') : imagePreviewUrl}"
                  alt="Invoice Preview"
                  style="max-width: 100%; max-height: 400px; object-fit: contain; box-shadow: 0 4px 14px rgba(0,0,0,0.4); border-radius: 4px;"
                />
              </div>

              <!-- Multi-page thumbnails if PDF -->
              ${fileType === 'pdf' && pdfPages.length > 1 ? `
                <div style="display: flex; gap: 8px; margin-top: 12px; overflow-x: auto; padding-bottom: 4px;">
                  ${pdfPages.map((p, idx) => `
                    <div class="pdf-thumb-card ${idx === activePageIdx ? 'active' : ''}" data-page="${idx}" style="
                      width: 58px; height: 75px; border-radius: 4px; overflow: hidden; border: 2px solid ${idx === activePageIdx ? 'var(--accent-primary)' : 'var(--border-secondary)'};
                      cursor: pointer; flex-shrink: 0; background: #fff;
                    ">
                      <img src="${p.dataUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="Page ${idx + 1}" />
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <!-- Hint & Extraction Controls -->
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 6px;">
              <div>
                <label for="invoice-hint-input" style="font-size: var(--font-size-xs); font-weight: 700; color: var(--text-primary); display: block; margin-bottom: 6px;">
                  Distributor Clue / Vendor Note (Optional)
                </label>
                <input
                  type="text"
                  id="invoice-hint-input"
                  class="form-control"
                  placeholder="e.g. Robu order, Mouser invoice, Hubtronics shipment..."
                  style="font-size: var(--font-size-sm); width: 100%;"
                />
              </div>

              <!-- Analyze Action Button -->
              <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                <button
                  type="button"
                  class="btn btn-primary"
                  id="btn-analyze-invoice"
                  ${isAnalyzing ? 'disabled' : ''}
                  style="padding: 10px 24px; font-weight: 700; font-size: var(--font-size-sm); display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 4px 14px rgba(99,102,241,0.4);"
                >
                  ${isAnalyzing ? `
                    <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
                    <span>Extracting Invoice Components...</span>
                  ` : `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <span>Extract Components with AI</span>
                  `}
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderReconciliationStage() {
    const totalDetected = reconciledItems.length;
    const includedCount = reconciledItems.filter(i => i.included).length;
    const updateCount = reconciledItems.filter(i => i.included && i.action === 'update').length;
    const createCount = reconciledItems.filter(i => i.included && i.action === 'create').length;

    return `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Invoice Metadata Overview Banner -->
        <div class="card" style="padding: 20px; border-radius: var(--border-radius-lg); background: var(--bg-card); border: 1px solid var(--border-primary);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; border-bottom: 1px solid var(--border-primary); padding-bottom: 16px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(34,197,94,0.12); color: #22c55e; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 1px solid rgba(34,197,94,0.3);">
                ✓
              </div>
              <div>
                <div style="font-weight: 800; font-size: var(--font-size-md); color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                  <span>Invoice Parsed Successfully</span>
                  ${analysisResult.switchedToBackup ? `
                    <span style="font-size: 11px; font-weight: 600; background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.4); padding: 2px 8px; border-radius: 99px;">
                      🛡️ ${escapeHtml(analysisResult.modelUsed || 'Backup Model')}
                    </span>
                  ` : `
                    <span style="font-size: 11px; font-weight: 600; background: rgba(99,102,241,0.15); color: var(--accent-primary-hover); border: 1px solid rgba(99,102,241,0.3); padding: 2px 8px; border-radius: 99px;">
                      ${escapeHtml(analysisResult.modelUsed || 'AI Engine')}
                    </span>
                  `}
                </div>
                <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 2px;">
                  Found ${totalDetected} component${totalDetected !== 1 ? 's' : ''}. Review each item below to update existing stock or create new entries.
                </div>
              </div>
            </div>

            <!-- Upload another or reset button -->
            <button type="button" class="btn btn-secondary btn-sm" id="btn-reupload-invoice" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Different Invoice
            </button>
          </div>

          <!-- Metadata Fields Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">Supplier / Vendor</label>
              <input type="text" id="meta-supplier" class="form-control form-control-sm" value="${escapeAttr(analysisResult.supplierName || 'Distributor')}" style="margin-top: 4px; font-weight: 600;" />
            </div>
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">Invoice / Order #</label>
              <input type="text" id="meta-invoice-number" class="form-control form-control-sm" value="${escapeAttr(analysisResult.invoiceNumber || '')}" placeholder="INV-..." style="margin-top: 4px;" />
            </div>
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">Order Date</label>
              <input type="text" id="meta-invoice-date" class="form-control form-control-sm" value="${escapeAttr(analysisResult.invoiceDate || new Date().toISOString().slice(0, 10))}" style="margin-top: 4px;" />
            </div>
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">Total Bill Amount</label>
              <input type="text" id="meta-total-amount" class="form-control form-control-sm" value="${escapeAttr(analysisResult.totalAmount !== null ? `${analysisResult.currency ? analysisResult.currency + ' ' : ''}${analysisResult.totalAmount}` : '')}" placeholder="Optional" style="margin-top: 4px;" />
            </div>
            <div>
              <label style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">Default Location For Batch</label>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <select id="meta-default-location" class="form-control form-control-sm" style="flex: 1;">
                  ${locations.map(loc => `<option value="${escapeAttr(loc.name)}" ${loc.name === defaultLocationName ? 'selected' : ''}>📍 ${escapeHtml(loc.name)}</option>`).join('')}
                </select>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-apply-batch-location" title="Apply this location to all new items below" style="padding: 4px 10px; font-size: 11px;">
                  Apply All
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Line Items Table & Reconciliation List -->
        <div class="card" style="padding: 20px; border-radius: var(--border-radius-lg); background: var(--bg-card); border: 1px solid var(--border-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
            <div>
              <h2 style="font-size: var(--font-size-lg); font-weight: 700; margin: 0; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                <span>📦 Arriving Components</span>
                <span style="font-size: 12px; font-weight: 600; background: var(--bg-secondary); padding: 2px 8px; border-radius: 99px; color: var(--text-secondary); border: 1px solid var(--border-primary);">
                  ${includedCount} of ${totalDetected} selected
                </span>
              </h2>
              <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 2px;">
                For each matching component, choose whether to <strong>Restock (+qty)</strong> or create a <strong>New Entry</strong>.
              </div>
            </div>

            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-select-all-items" style="font-size: 11px; padding: 4px 10px;">
                Select All
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-deselect-all-items" style="font-size: 11px; padding: 4px 10px;">
                Deselect All
              </button>
              <div style="height: 18px; width: 1px; background: var(--border-primary); margin: 0 4px;"></div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-bulk-set-update" title="Set all matching items to Update Stock" style="font-size: 11px; padding: 4px 10px;">
                All Matches → Restock
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-bulk-set-create" title="Set all items to Create New Entry" style="font-size: 11px; padding: 4px 10px;">
                All → New Entries
              </button>
              <div style="height: 18px; width: 1px; background: var(--border-primary); margin: 0 4px;"></div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-auto-web-photos" title="Search web photos automatically for all drafted components without photos" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px; color: #818cf8; border-color: rgba(99,102,241,0.3);">
                <span>🌐</span> Auto-Find All Web Photos
              </button>
            </div>
          </div>

          <!-- Items Container -->
          <div id="invoice-items-list" style="display: flex; flex-direction: column; gap: 12px;">
            ${reconciledItems.map((item, idx) => renderItemCard(item, idx, categories, locations)).join('')}
          </div>

          <!-- Bottom Sticky / Fixed Import Bar -->
          <div style="
            margin-top: 24px;
            padding: 16px 20px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-secondary);
            border-radius: var(--border-radius-md);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
          ">
            <div>
              <div style="font-weight: 700; font-size: var(--font-size-sm); color: var(--text-primary);">
                Ready to commit: <span style="color: var(--accent-primary);">${includedCount} component${includedCount !== 1 ? 's' : ''}</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                ${updateCount > 0 ? `<strong>${updateCount}</strong> will restock existing inventory. ` : ''}
                ${createCount > 0 ? `<strong>${createCount}</strong> will be created as new components.` : ''}
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-xs); color: var(--text-secondary); cursor: pointer;">
                <input type="checkbox" id="check-send-to-queue" style="accent-color: var(--accent-primary);" />
                <span>Also send new components to AI Queue for photo inspection</span>
              </label>

              <button
                type="button"
                class="btn btn-primary"
                id="btn-commit-import"
                ${includedCount === 0 ? 'disabled' : ''}
                style="padding: 10px 24px; font-weight: 700; font-size: var(--font-size-sm); display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #22c55e, #16a34a); box-shadow: 0 4px 14px rgba(34,197,94,0.3); border: none;"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Import & Update Inventory</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderItemCard(item, idx, categories, locations) {
    const isMatched = !!item.matchedItem;
    const existing = item.matchedItem;

    return `
      <div class="invoice-item-row ${item.included ? 'included' : 'excluded'}" data-index="${idx}" style="
        border: 1px solid ${item.included ? (item.action === 'update' ? 'rgba(59,130,246,0.4)' : 'rgba(99,102,241,0.4)') : 'var(--border-primary)'};
        background: ${item.included ? (item.action === 'update' ? 'rgba(59,130,246,0.03)' : 'rgba(99,102,241,0.03)') : 'var(--bg-secondary)'};
        border-radius: var(--border-radius-md);
        padding: 14px 16px;
        transition: all 0.15s ease;
        opacity: ${item.included ? '1' : '0.55'};
      ">
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <!-- Top Row: Checkbox, Match Badge, and Action Selector (Update vs New) -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <input type="checkbox" class="item-include-checkbox" data-index="${idx}" ${item.included ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--accent-primary); cursor: pointer;" />
              
              ${isMatched ? `
                <div style="display: flex; align-items: center; gap: 6px; background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.3); border-radius: 99px; padding: 2px 10px;">
                  <span style="font-size: 13px;">🔄</span>
                  <span style="font-size: 11.5px; font-weight: 700; color: #60a5fa;">
                    Matched Vault Item: ${escapeHtml(existing.name)}
                  </span>
                  <span style="font-size: 11px; color: var(--text-tertiary); margin-left: 4px;">
                    (Current: ${existing.quantity} in ${escapeHtml(existing.location || 'Vault')})
                  </span>
                </div>
              ` : `
                <div style="display: flex; align-items: center; gap: 6px; background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.3); border-radius: 99px; padding: 2px 10px;">
                  <span style="font-size: 13px;">✨</span>
                  <span style="font-size: 11.5px; font-weight: 700; color: #c084fc;">
                    New Component Entry
                  </span>
                </div>
              `}
            </div>

            <!-- Action Pill Selection: Update Stock vs New Entry (Direct User Choice) -->
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase;">
                Action:
              </span>
              <div class="action-toggle-group" style="display: inline-flex; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-secondary);">
                ${isMatched ? `
                  <button
                    type="button"
                    class="action-btn-toggle ${item.action === 'update' ? 'active' : ''}"
                    data-index="${idx}"
                    data-action="update"
                    style="
                      padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; border: none;
                      background: ${item.action === 'update' ? '#3b82f6' : 'var(--bg-tertiary)'};
                      color: ${item.action === 'update' ? '#fff' : 'var(--text-secondary)'};
                    "
                    title="Increment existing stock: ${existing.quantity} + ${item.quantity} = ${Number(existing.quantity) + Number(item.quantity)}"
                  >
                    ➕ Restock (${existing.quantity} → ${Number(existing.quantity) + Number(item.quantity)})
                  </button>
                ` : ''}
                <button
                  type="button"
                  class="action-btn-toggle ${item.action === 'create' ? 'active' : ''}"
                  data-index="${idx}"
                  data-action="create"
                  style="
                    padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; border: none;
                    background: ${item.action === 'create' ? '#8b5cf6' : 'var(--bg-tertiary)'};
                    color: ${item.action === 'create' ? '#fff' : 'var(--text-secondary)'};
                  "
                  title="Create a separate new component card in your vault"
                >
                  ✨ Add as New Item
                </button>
              </div>

              <!-- Delete/Exclude row button -->
              <button type="button" class="btn-remove-row" data-index="${idx}" title="Remove this item" style="
                background: none; border: none; color: var(--text-tertiary); cursor: pointer; font-size: 15px; padding: 2px 6px; margin-left: 6px;
              ">✕</button>
            </div>
          </div>

          <!-- Main Content: Image Column + Field Grid -->
          <div style="display: flex; gap: 14px; align-items: flex-start;" class="invoice-item-content-wrap">
            <!-- Left: Component Thumbnail & Image Tools -->
            <div class="invoice-item-thumb-col" style="width: 82px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 6px;">
              ${(item.previewUrl || item.existingImageUrl) ? `
                <div class="item-thumb-container" style="position: relative; width: 78px; height: 78px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-secondary); background: #0b0f19;">
                  <img
                    src="${item.previewUrl || item.existingImageUrl}"
                    alt="Component Photo"
                    class="item-thumb-preview"
                    data-index="${idx}"
                    style="width: 100%; height: 100%; object-fit: cover;"
                  />
                  <div class="item-thumb-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.65); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; opacity: 0; transition: opacity 0.15s ease;">
                    <button type="button" class="btn-recrop-item" data-index="${idx}" style="background: rgba(99,102,241,0.9); border: none; color: #fff; font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 6px; cursor: pointer;">
                      ✂️ Recrop
                    </button>
                    <button type="button" class="btn-remove-thumb" data-index="${idx}" style="background: rgba(239,68,68,0.9); border: none; color: #fff; font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 6px; cursor: pointer;">
                      ✕ Clear
                    </button>
                  </div>
                </div>
                <span style="font-size: 9.5px; font-weight: 600; color: ${item.imageBlob ? '#a78bfa' : '#60a5fa'}; text-align: center;">
                  ${item.imageBlob ? '✨ Custom' : '📦 Vault'}
                </span>
              ` : `
                <div class="item-thumb-placeholder" style="width: 78px; height: 78px; border-radius: 8px; border: 1.5px dashed var(--border-secondary); background: var(--bg-tertiary); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2px;">
                  <span style="font-size: 22px; opacity: 0.5;">📷</span>
                  <span style="font-size: 9.5px; font-weight: 600; color: var(--text-tertiary);">No Photo</span>
                </div>
              `}

              <!-- Mini Action Buttons under photo -->
              <div style="display: flex; gap: 3px; width: 100%; justify-content: center; flex-wrap: wrap;">
                ${(currentFile || pdfPages.length > 0) ? `
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm btn-crop-invoice-item"
                    data-index="${idx}"
                    title="Crop this component's picture directly from the invoice document"
                    style="padding: 2px 5px; font-size: 9.5px; border-radius: 4px; line-height: 1.2;"
                  >
                    ✂️ Crop
                  </button>
                ` : ''}
                <button
                  type="button"
                  class="btn btn-secondary btn-sm btn-photo-item"
                  data-index="${idx}"
                  title="Snap photo with camera"
                  style="padding: 2px 5px; font-size: 9.5px; border-radius: 4px; line-height: 1.2;"
                >
                  📸 Snap
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm btn-web-search-item"
                  data-index="${idx}"
                  title="Search internet for photos of this component"
                  style="padding: 2px 5px; font-size: 9.5px; border-radius: 4px; line-height: 1.2; color: #818cf8;"
                >
                  🌐 Web
                </button>
                <label
                  class="btn btn-secondary btn-sm"
                  title="Upload image file from device"
                  style="padding: 2px 5px; font-size: 9.5px; border-radius: 4px; line-height: 1.2; cursor: pointer; display: inline-flex; align-items: center;"
                >
                  📁
                  <input type="file" accept="image/*" class="item-file-input" data-index="${idx}" style="display: none;" />
                </label>
              </div>
            </div>

            <!-- Right: Editable Inputs Grid & Description -->
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: grid; grid-template-columns: 2fr 1fr 90px 1.2fr 1.2fr 100px; gap: 10px; align-items: center;" class="invoice-item-grid">
                <!-- Name -->
                <div>
                  <label style="font-size: 10px; font-weight: 700; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Component Name</label>
                  <input type="text" class="form-control form-control-sm item-field-name" data-index="${idx}" value="${escapeAttr(item.name)}" />
                </div>

                <!-- SKU / Part # -->
                <div>
                  <label style="font-size: 10px; font-weight: 700; color: var(--text-tertiary); display: block; margin-bottom: 2px;">SKU / Part #</label>
                  <input type="text" class="form-control form-control-sm item-field-sku" data-index="${idx}" value="${escapeAttr(item.partNumber || '')}" placeholder="None" />
                </div>

                <!-- Quantity -->
                <div>
                  <label style="font-size: 10px; font-weight: 700; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Quantity</label>
                  <input type="number" min="1" class="form-control form-control-sm item-field-qty" data-index="${idx}" value="${item.quantity}" style="font-weight: 700;" />
                </div>

                <!-- Category -->
                <div>
                  <label style="font-size: 10px; font-weight: 700; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Category</label>
                  <select class="form-control form-control-sm item-field-category" data-index="${idx}">
                    ${categories.map(c => `<option value="${escapeAttr(c.name)}" ${c.name.toLowerCase() === item.category.toLowerCase() ? 'selected' : ''}>${c.icon || '📦'} ${escapeHtml(c.name)}</option>`).join('')}
                  </select>
                </div>

                <!-- Storage Location -->
                <div>
                  <label style="font-size: 10px; font-weight: 700; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Location</label>
                  <input
                    type="text"
                    class="form-control form-control-sm item-field-location"
                    data-index="${idx}"
                    value="${escapeAttr(item.location || (isMatched && item.action === 'update' ? existing.location : defaultLocationName))}"
                    list="location-datalist"
                  />
                </div>

                <!-- Unit Price -->
                <div>
                  <label style="font-size: 10px; font-weight: 700; color: var(--text-tertiary); display: block; margin-bottom: 2px;">Unit Price</label>
                  <input type="text" class="form-control form-control-sm item-field-price" data-index="${idx}" value="${escapeAttr(item.unitPrice !== null && item.unitPrice !== undefined ? String(item.unitPrice) : '')}" placeholder="—" />
                </div>
              </div>

              <!-- Description snippet if present -->
              ${item.description ? `
                <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; background: rgba(0,0,0,0.15); padding: 6px 10px; border-radius: 4px;">
                  <span style="font-weight: 600; color: var(--text-tertiary);">Details:</span> ${escapeHtml(item.description)}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Navigation buttons
    const btnGotoInventory = container.querySelector('#btn-goto-inventory');
    if (btnGotoInventory) {
      btnGotoInventory.addEventListener('click', () => navigateTo('inventory'));
    }

    const btnGotoSettings = container.querySelector('#btn-goto-settings');
    if (btnGotoSettings) {
      btnGotoSettings.addEventListener('click', () => navigateTo('settings'));
    }

    // Dropzone & File browse
    const dropzone = container.querySelector('#invoice-dropzone');
    const fileInput = container.querySelector('#invoice-file-input');
    const btnBrowse = container.querySelector('#btn-browse-file');
    const btnCamera = container.querySelector('#btn-camera-invoice');
    const btnChangeFile = container.querySelector('#btn-change-file');
    const btnRemoveFile = container.querySelector('#btn-remove-file');

    if (btnBrowse && fileInput) {
      btnBrowse.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (btnChangeFile && fileInput) {
      btnChangeFile.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => {
        if (!currentFile) fileInput.click();
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent-primary)';
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = currentFile ? 'var(--accent-primary)' : 'var(--border-secondary)';
      });

      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent-primary)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          await handleIncomingFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          await handleIncomingFile(e.target.files[0]);
        }
      });
    }

    if (btnRemoveFile) {
      btnRemoveFile.addEventListener('click', (e) => {
        e.stopPropagation();
        currentFile = null;
        fileType = null;
        pdfPages = [];
        activePageIdx = 0;
        imagePreviewUrl = null;
        render();
      });
    }

    // Camera Capture for paper invoices
    if (btnCamera) {
      btnCamera.addEventListener('click', (e) => {
        e.stopPropagation();
        openCameraModal({
          onCapture: async (blob) => {
            const capturedFile = new File([blob], `paper-invoice-${Date.now()}.jpg`, { type: 'image/jpeg' });
            await handleIncomingFile(capturedFile);
          },
        });
      });
    }

    // PDF Pagination controls
    const btnPdfPrev = container.querySelector('#btn-pdf-prev');
    const btnPdfNext = container.querySelector('#btn-pdf-next');
    if (btnPdfPrev) {
      btnPdfPrev.addEventListener('click', () => {
        if (activePageIdx > 0) {
          activePageIdx--;
          render();
        }
      });
    }
    if (btnPdfNext) {
      btnPdfNext.addEventListener('click', () => {
        if (activePageIdx < pdfPages.length - 1) {
          activePageIdx++;
          render();
        }
      });
    }

    const pdfThumbs = container.querySelectorAll('.pdf-thumb-card');
    pdfThumbs.forEach(thumb => {
      thumb.addEventListener('click', () => {
        activePageIdx = parseInt(thumb.dataset.page, 10);
        render();
      });
    });

    // Analyze Action Button
    const btnAnalyze = container.querySelector('#btn-analyze-invoice');
    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', async () => {
        await executeInvoiceAnalysis();
      });
    }

    // Reconciliation stage events
    const btnReupload = container.querySelector('#btn-reupload-invoice');
    if (btnReupload) {
      btnReupload.addEventListener('click', () => {
        analysisResult = null;
        reconciledItems = [];
        render();
      });
    }

    // Bulk selection controls
    const btnSelectAll = container.querySelector('#btn-select-all-items');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => {
        reconciledItems.forEach(i => i.included = true);
        render();
      });
    }

    const btnDeselectAll = container.querySelector('#btn-deselect-all-items');
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        reconciledItems.forEach(i => i.included = false);
        render();
      });
    }

    const btnBulkUpdate = container.querySelector('#btn-bulk-set-update');
    if (btnBulkUpdate) {
      btnBulkUpdate.addEventListener('click', () => {
        reconciledItems.forEach(i => {
          if (i.matchedItem) i.action = 'update';
        });
        render();
      });
    }

    const btnBulkCreate = container.querySelector('#btn-bulk-set-create');
    if (btnBulkCreate) {
      btnBulkCreate.addEventListener('click', () => {
        reconciledItems.forEach(i => i.action = 'create');
        render();
      });
    }

    // Apply Default Batch Location to all items
    const btnApplyBatchLocation = container.querySelector('#btn-apply-batch-location');
    const selectDefaultLocation = container.querySelector('#meta-default-location');
    if (btnApplyBatchLocation && selectDefaultLocation) {
      btnApplyBatchLocation.addEventListener('click', () => {
        const targetLoc = selectDefaultLocation.value;
        defaultLocationName = targetLoc;
        reconciledItems.forEach(i => {
          i.location = targetLoc;
        });
        showToast(`Applied "${targetLoc}" to all items`, 'info');
        render();
      });
    }

    // Checkbox toggles
    const checkBoxes = container.querySelectorAll('.item-include-checkbox');
    checkBoxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(cb.dataset.index, 10);
        if (reconciledItems[idx]) {
          reconciledItems[idx].included = cb.checked;
          const row = container.querySelector(`.invoice-item-row[data-index="${idx}"]`);
          if (row) {
            row.style.opacity = cb.checked ? '1' : '0.55';
          }
          updateCommitButtonSummary();
        }
      });
    });

    // Action toggles (Update vs Create)
    const actionButtons = container.querySelectorAll('.action-btn-toggle');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const action = btn.dataset.action;
        if (reconciledItems[idx]) {
          reconciledItems[idx].action = action;
          render();
        }
      });
    });

    // Remove single row
    const removeButtons = container.querySelectorAll('.btn-remove-row');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        reconciledItems.splice(idx, 1);
        render();
      });
    });

    // Image Action: Crop directly from invoice page
    const btnCropInvoice = container.querySelectorAll('.btn-crop-invoice-item');
    btnCropInvoice.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const item = reconciledItems[idx];
        if (!item) return;

        let sourceImage = null;
        if (fileType === 'pdf' && pdfPages.length > 0) {
          sourceImage = pdfPages[activePageIdx]?.dataUrl || pdfPages[0]?.dataUrl;
        } else if (fileType === 'image') {
          sourceImage = imagePreviewUrl || currentFile;
        }

        if (!sourceImage) {
          showToast('No invoice image loaded to crop from.', 'warning');
          return;
        }

        openCropperModal({
          image: sourceImage,
          onDone: (croppedBlob) => {
            item.imageBlob = croppedBlob;
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            item.previewUrl = URL.createObjectURL(croppedBlob);
            render();
            showToast(`Cropped photo for ${item.name}!`, 'success');
          },
        });
      });
    });

    // Image Action: Re-crop existing image
    const btnRecrop = container.querySelectorAll('.btn-recrop-item');
    btnRecrop.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const item = reconciledItems[idx];
        if (!item) return;

        const source = item.imageBlob || item.previewUrl || item.existingImageBlob || item.existingImageUrl;
        if (!source) return;

        openCropperModal({
          image: source,
          onDone: (croppedBlob) => {
            item.imageBlob = croppedBlob;
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            item.previewUrl = URL.createObjectURL(croppedBlob);
            render();
            showToast(`Re-cropped photo for ${item.name}!`, 'success');
          },
        });
      });
    });

    // Image Action: Snap photo with camera
    const btnSnapPhoto = container.querySelectorAll('.btn-photo-item');
    btnSnapPhoto.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const item = reconciledItems[idx];
        if (!item) return;

        openCameraModal({
          onCapture: (capturedBlob) => {
            item.imageBlob = capturedBlob;
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            item.previewUrl = URL.createObjectURL(capturedBlob);
            render();
            showToast(`Photo captured for ${item.name}!`, 'success');
          },
        });
      });
    });

    // Image Action: Upload image file from device
    const fileInputs = container.querySelectorAll('.item-file-input');
    fileInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.dataset.index, 10);
        const item = reconciledItems[idx];
        if (!item || !e.target.files || !e.target.files[0]) return;

        const file = e.target.files[0];
        item.imageBlob = file;
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        item.previewUrl = URL.createObjectURL(file);
        render();
        showToast(`Image loaded for ${item.name}!`, 'success');
      });
    });

    // Image Action: Remove photo
    const btnRemoveThumbs = container.querySelectorAll('.btn-remove-thumb');
    btnRemoveThumbs.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const item = reconciledItems[idx];
        if (!item) return;

        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        item.imageBlob = null;
        item.previewUrl = null;
        item.existingImageUrl = null;
        item.existingImageBlob = null;
        render();
        showToast('Photo removed', 'info');
      });
    });

    // Image Action: Search web for photo of this component
    const btnWebSearches = container.querySelectorAll('.btn-web-search-item');
    btnWebSearches.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const item = reconciledItems[idx];
        if (!item) return;

        const query = (item.name + ' ' + (item.partNumber || '')).trim();
        openWebImageModal({
          query,
          onSelect: (blob) => {
            item.imageBlob = blob;
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            item.previewUrl = URL.createObjectURL(blob);
            render();
            showToast(`Web photo attached to ${item.name}!`, 'success');
          },
        });
      });
    });

    // Bulk Action: Auto-find web photos for all items without photos
    const btnAutoWeb = container.querySelector('#btn-auto-web-photos');
    if (btnAutoWeb) {
      btnAutoWeb.addEventListener('click', async () => {
        const targets = reconciledItems.filter(i => i.included && !i.imageBlob && !i.existingImageUrl);
        if (targets.length === 0) {
          showToast('All drafted items already have photos attached!', 'info');
          return;
        }

        btnAutoWeb.disabled = true;
        btnAutoWeb.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></div> Searching Web...`;

        let foundCount = 0;
        showToast(`Searching web photos for ${targets.length} components...`, 'info');

        for (let i = 0; i < targets.length; i++) {
          const item = targets[i];
          const query = (item.name + ' ' + (item.partNumber || '')).trim();
          try {
            const results = await searchComponentImages(query);
            if (results && results.length > 0) {
              const targetUrl = best.image || best.thumbnail;
              const fallbackUrl = best.thumbnail && best.thumbnail !== targetUrl ? best.thumbnail : '';
              const blob = await fetchWebImageBlob(targetUrl, fallbackUrl);
              item.imageBlob = blob;
              if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
              item.previewUrl = URL.createObjectURL(blob);
              foundCount++;
            }
          } catch (e) {
            console.warn(`[Auto-Find Web Photos] Failed for ${item.name}:`, e.message);
          }
        }

        render();
        if (foundCount > 0) {
          showToast(`✓ Attached web photos for ${foundCount} component${foundCount !== 1 ? 's' : ''}!`, 'success');
        } else {
          showToast('Could not find matching web photos.', 'warning');
        }
      });
    }

    // Inline field modifications
    bindFieldChange('.item-field-name', 'name');
    bindFieldChange('.item-field-sku', 'partNumber');
    bindFieldChange('.item-field-qty', 'quantity', (val) => Math.max(1, parseInt(val, 10) || 1));
    bindFieldChange('.item-field-category', 'category');
    bindFieldChange('.item-field-location', 'location');
    bindFieldChange('.item-field-price', 'unitPrice');

    // Commit Import Button
    const btnCommit = container.querySelector('#btn-commit-import');
    if (btnCommit) {
      btnCommit.addEventListener('click', async () => {
        await executeImportCommit();
      });
    }
  }

  function bindFieldChange(selector, field, transform = (v) => v) {
    const inputs = container.querySelectorAll(selector);
    inputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(input.dataset.index, 10);
        if (reconciledItems[idx]) {
          reconciledItems[idx][field] = transform(e.target.value);
        }
      });
    });
  }

  function updateCommitButtonSummary() {
    const included = reconciledItems.filter(i => i.included);
    const btn = container.querySelector('#btn-commit-import');
    if (btn) {
      btn.disabled = included.length === 0;
    }
  }

  async function handleIncomingFile(file) {
    currentFile = file;
    const name = file.name.toLowerCase();

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      fileType = 'pdf';
      try {
        showToast('Rendering PDF document pages...', 'info');
        const arrayBuffer = await file.arrayBuffer();
        pdfPages = await renderPdfPages(new Uint8Array(arrayBuffer), 6);
        activePageIdx = 0;
        if (pdfPages.length === 0) {
          throw new Error('Could not render pages from PDF.');
        }
        showToast(`Loaded ${pdfPages.length} PDF pages`, 'success');
      } catch (err) {
        console.error('[InvoiceView] PDF rendering error:', err);
        showToast('Failed to read PDF document: ' + err.message, 'error');
        currentFile = null;
        fileType = null;
      }
    } else {
      fileType = 'image';
      try {
        imagePreviewUrl = URL.createObjectURL(file);
        pdfPages = [];
        activePageIdx = 0;
      } catch (err) {
        console.error('[InvoiceView] Image preview error:', err);
        showToast('Failed to load image preview: ' + err.message, 'error');
        currentFile = null;
      }
    }

    render();
  }

  async function executeInvoiceAnalysis() {
    if (!currentFile) {
      showToast('Please select an invoice document first.', 'warning');
      return;
    }

    isAnalyzing = true;
    render();

    try {
      const hintInput = container.querySelector('#invoice-hint-input');
      const hint = hintInput ? hintInput.value.trim() : '';

      let imagesToAnalyze = [];
      let rawText = '';

      if (fileType === 'pdf') {
        imagesToAnalyze = pdfPages.map(p => p.dataUrl);
        rawText = pdfPages.map(p => p.text).filter(Boolean).join('\n\n');
      } else {
        imagesToAnalyze = [currentFile];
      }

      const activeCatNames = categories.map(c => c.name);
      const res = await analyzeInvoiceDocument({
        images: imagesToAnalyze,
        rawText,
        categories: activeCatNames,
        hint,
      });

      analysisResult = res;

      // Reconcile extracted items against current inventory vault
      reconciledItems = (res.items || []).map(item => {
        const matched = findInventoryMatch(item, allItems);
        return {
          ...item,
          matchedItem: matched || null,
          // If matched, default action to 'update' (Restock) with explicit buttons to change to 'create'
          action: matched ? 'update' : 'create',
          included: true,
          location: matched ? matched.location : defaultLocationName,
          imageBlob: null,
          previewUrl: null,
          existingImageUrl: null,
          existingImageBlob: null,
        };
      });

      // Asynchronously fetch existing vault photos for matched items
      for (const rec of reconciledItems) {
        if (rec.matchedItem) {
          getImage(rec.matchedItem.id).then(blob => {
            if (blob) {
              rec.existingImageBlob = blob;
              rec.existingImageUrl = URL.createObjectURL(blob);
              render();
            }
          }).catch(() => {});
        }
      }

      showToast(`Parsed ${reconciledItems.length} components from invoice!`, 'success');
    } catch (err) {
      console.error('[InvoiceView] Extraction error:', err);
      showToast('Invoice analysis failed: ' + err.message, 'error');
    } finally {
      isAnalyzing = false;
      render();
    }
  }

  function findInventoryMatch(invoiceItem, inventoryItems) {
    if (!inventoryItems || inventoryItems.length === 0) return null;

    const invoiceSku = (invoiceItem.partNumber || '').trim().toLowerCase();
    const invoiceName = (invoiceItem.name || '').trim().toLowerCase();

    // 1. Exact SKU / Part Number match
    if (invoiceSku && invoiceSku.length >= 3) {
      const skuMatch = inventoryItems.find(inv => {
        const invSku = (inv.partNumber || '').trim().toLowerCase();
        return invSku === invoiceSku;
      });
      if (skuMatch) return skuMatch;
    }

    // 2. Normalized Name match
    const cleanInvoiceName = invoiceName.replace(/[^a-z0-9]/g, '');
    if (cleanInvoiceName.length >= 4) {
      const nameMatch = inventoryItems.find(inv => {
        const cleanInvName = (inv.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanInvName === cleanInvoiceName ||
               (cleanInvName.length >= 6 && cleanInvoiceName.includes(cleanInvName)) ||
               (cleanInvoiceName.length >= 6 && cleanInvName.includes(cleanInvoiceName));
      });
      if (nameMatch) return nameMatch;
    }

    return null;
  }

  async function executeImportCommit() {
    const toImport = reconciledItems.filter(i => i.included);
    if (toImport.length === 0) {
      showToast('No items selected for import.', 'warning');
      return;
    }

    const supplierInput = container.querySelector('#meta-supplier');
    const invoiceNumInput = container.querySelector('#meta-invoice-number');
    const invoiceDateInput = container.querySelector('#meta-invoice-date');
    const checkQueue = container.querySelector('#check-send-to-queue');

    const defaults = getItemDefaults();
    const supplier = supplierInput ? supplierInput.value.trim() : (analysisResult?.supplierName || defaults.supplierInfo || '');
    const invoiceNum = invoiceNumInput ? invoiceNumInput.value.trim() : (analysisResult?.invoiceNumber || '');
    const invoiceDate = invoiceDateInput ? invoiceDateInput.value.trim() : (analysisResult?.invoiceDate || '');
    const sendToQueue = checkQueue ? checkQueue.checked : false;

    let updatedCount = 0;
    let createdCount = 0;
    const newItemsForQueue = [];

    showToast('Importing and updating inventory...', 'info');

    try {
      for (const item of toImport) {
        if (item.action === 'update' && item.matchedItem) {
          // RESTOCK EXISTING ITEM
          const existing = item.matchedItem;
          const oldQty = Number(existing.quantity) || 0;
          const addQty = Number(item.quantity) || 1;
          const newQty = oldQty + addQty;

          const updated = {
            ...existing,
            quantity: newQty,
            updatedAt: new Date().toISOString(),
          };

          // Append invoice restock note
          const restockNote = `[Restocked +${addQty} on ${invoiceDate || new Date().toISOString().slice(0, 10)} via ${supplier || 'Invoice'}${invoiceNum ? ' #' + invoiceNum : ''}]`;
          if (updated.notes && !updated.notes.includes(restockNote)) {
            updated.notes = `${updated.notes}\n${restockNote}`.trim();
          } else if (!updated.notes) {
            updated.notes = restockNote;
          }

          if (item.location && item.location.trim()) {
            updated.location = item.location.trim();
          }

          await saveItem(updated);
          await addHistory(existing.id, 'restocked', addQty);

          // Save new image if user provided/cropped one for this item
          if (item.imageBlob) {
            await saveImage(existing.id, item.imageBlob);
          }

          updatedCount++;
        } else {
          // CREATE NEW COMPONENT ENTRY
          const newId = generateId();
          const targetLocation = (item.location && item.location.trim()) ? item.location.trim() : (defaults.location || 'Drawer 1');

          // Ensure location exists in db
          await saveLocation({ name: targetLocation }).catch(() => {});

          const arrivalNote = `Arrived via ${supplier || 'Order'}${invoiceNum ? ' #' + invoiceNum : ''} on ${invoiceDate || new Date().toISOString().slice(0, 10)}.`;

          const newItem = {
            id: newId,
            name: item.name || 'Component',
            partNumber: item.partNumber || '',
            category: item.category || 'Other',
            location: targetLocation,
            condition: item.condition || 'Packed',
            quantity: Number(item.quantity) || 1,
            lowStockThreshold: 2,
            tags: Array.isArray(item.tags) ? item.tags : [],
            description: item.description || '',
            supplierInfo: supplier || '',
            datasheetUrl: '',
            notes: arrivalNote,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isFavorite: false,
          };

          await saveItem(newItem);
          await addHistory(newId, 'created', newItem.quantity);

          // Save image attached to this new component
          if (item.imageBlob) {
            await saveImage(newId, item.imageBlob);
          } else if (item.existingImageBlob) {
            await saveImage(newId, item.existingImageBlob);
          }

          createdCount++;

          if (sendToQueue) {
            newItemsForQueue.push(newItem);
          }
        }
      }

      showToast(`✓ Successfully imported ${toImport.length} components (${updatedCount} restocked, ${createdCount} new entries)!`, 'success');

      // Clear state and navigate to inventory
      analysisResult = null;
      reconciledItems = [];
      currentFile = null;

      setTimeout(() => {
        navigateTo('inventory');
      }, 700);
    } catch (err) {
      console.error('[InvoiceView] Commit import error:', err);
      showToast('Error importing items: ' + err.message, 'error');
    }
  }

  // Initial render
  render();

  return () => {
    if (imagePreviewUrl) {
      try { URL.revokeObjectURL(imagePreviewUrl); } catch (_) {}
    }
  };
}
