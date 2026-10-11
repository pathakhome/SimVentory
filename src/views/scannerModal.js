/**
 * Barcode & QR Code Scanner Modal
 * Uses html5-qrcode to scan electronic component bags, part numbers, and bin labels
 * via smartphone rear camera or desktop webcam.
 */

import { Html5Qrcode } from 'html5-qrcode';
import { getAllItems, saveItem, addHistory } from '../db.js';
import { showToast } from '../toast.js';

let html5QrCode = null;
let isScanning = false;
let currentCameraId = null;
let torchEnabled = false;

/**
 * Open the Barcode/QR Scanner.
 * @param {Object} options
 * @param {Function} options.navigateTo - navigation function
 * @param {Function} options.openItemModal - open item details
 * @param {Function} options.onScanResult - optional callback if scanning directly for a form input
 */
export async function openScannerModal({ navigateTo, openItemModal, onScanResult = null }) {
  const modal = document.getElementById('item-modal');
  const modalContent = document.getElementById('item-modal-content');

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title" style="display:flex;align-items:center;gap:8px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="16" x2="17" y2="16"/></svg>
        ${onScanResult ? 'Scan Part Number' : 'Scan Component / Label'}
      </h2>
      <button class="modal-close" id="scanner-close-btn" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body" style="padding: 16px;">
      <div id="scanner-view-container" style="position:relative; width:100%; border-radius:12px; overflow:hidden; background:#000; min-height:280px; display:flex; align-items:center; justify-content:center;">
        <div id="qr-reader" style="width:100%;"></div>
        <div class="scan-overlay" id="scan-overlay" style="position:absolute; inset:0; pointer-events:none; display:flex; align-items:center; justify-content:center;">
          <div style="width:70%; max-width:260px; aspect-ratio:1; border:2px dashed rgba(99,102,241,0.8); border-radius:16px; box-shadow:0 0 20px rgba(99,102,241,0.3); position:relative;">
            <div style="position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, transparent, #818cf8, transparent); animation: scannerSweep 2s ease-in-out infinite;"></div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div style="display:flex; justify-content:center; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-switch-camera">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><path d="M9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"/><path d="M17 4v3"/><path d="M20 7l-3-3"/></svg>
          Switch Camera
        </button>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-file-scan">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Upload Barcode Image
        </button>
        <input type="file" id="scan-file-input" accept="image/*" hidden />
      </div>

      <!-- Scanned Result Container -->
      <div id="scanner-result" style="margin-top:16px; display:none;"></div>
    </div>
  `;

  modal.style.display = 'flex';

  // Cleanup handler
  const stopAndClose = async () => {
    if (html5QrCode && isScanning) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (e) {}
    }
    isScanning = false;
    modal.style.display = 'none';
  };

  document.getElementById('scanner-close-btn').addEventListener('click', stopAndClose);

  // Esc key listener
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      stopAndClose();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Switch camera
  document.getElementById('btn-switch-camera').addEventListener('click', async () => {
    if (!html5QrCode) return;
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 1) {
        const next = devices.find(d => d.id !== currentCameraId) || devices[0];
        currentCameraId = next.id;
        if (isScanning) {
          await html5QrCode.stop();
          startCamera(currentCameraId);
        }
      } else {
        showToast('Only one camera detected', 'info');
      }
    } catch (err) {
      showToast('Camera error: ' + err.message, 'error');
    }
  });

  // Scan from file
  const fileInput = document.getElementById('scan-file-input');
  document.getElementById('btn-file-scan').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length === 0) return;
    try {
      showToast('Scanning image...', 'info');
      const text = await html5QrCode.scanFile(fileInput.files[0], true);
      handleScannedCode(text);
    } catch (err) {
      showToast('No barcode/QR code detected in image', 'warning');
    }
    fileInput.value = '';
  });

  // Start Camera
  async function startCamera(cameraId = null) {
    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader');
      }

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      const cameraParam = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' };

      await html5QrCode.start(
        cameraParam,
        config,
        (decodedText) => handleScannedCode(decodedText),
        () => {} // Silent on individual frame misses
      );
      isScanning = true;
    } catch (err) {
      console.warn('Camera start error:', err);
      const container = document.getElementById('scanner-view-container');
      if (container) {
        container.innerHTML = `
          <div style="padding:24px; text-align:center; color:var(--text-secondary);">
            <div style="font-size:2rem; margin-bottom:8px;">📷</div>
            <p style="font-weight:600; margin-bottom:4px; color:var(--text-primary);">Camera access required</p>
            <p style="font-size:var(--font-size-sm); margin-bottom:12px;">Please allow camera permission in your browser, or use the image upload option below.</p>
          </div>
        `;
      }
    }
  }

  // Handle scanned code
  async function handleScannedCode(decodedText) {
    const cleanText = decodedText.trim();
    if (!cleanText) return;

    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(60);

    // If caller provided onScanResult callback, return immediately
    if (onScanResult) {
      await stopAndClose();
      onScanResult(cleanText);
      return;
    }

    // Stop scanning to display result
    if (html5QrCode && isScanning) {
      try {
        await html5QrCode.stop();
      } catch (e) {}
      isScanning = false;
    }

    const resultBox = document.getElementById('scanner-result');
    resultBox.style.display = 'block';

    // Look for matching item in database
    const items = await getAllItems();
    const matchedItem = items.find(i =>
      (i.partNumber && i.partNumber.toLowerCase() === cleanText.toLowerCase()) ||
      i.id.toLowerCase() === cleanText.toLowerCase() ||
      i.name.toLowerCase() === cleanText.toLowerCase()
    );

    if (matchedItem) {
      resultBox.innerHTML = `
        <div style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:var(--radius-lg); padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
              <span style="font-size:var(--font-size-xs); background:var(--color-success-bg); color:var(--color-success); padding:2px 8px; border-radius:999px; font-weight:600;">✓ Component Found</span>
              <h3 style="margin-top:6px; font-size:var(--font-size-lg);">${matchedItem.name}</h3>
              <p style="color:var(--text-secondary); font-size:var(--font-size-sm); margin:4px 0 10px;">
                Category: <strong>${matchedItem.category}</strong> ${matchedItem.location ? `· 📍 <strong>${matchedItem.location}</strong>` : ''}
              </p>
            </div>
            <div style="text-align:right;">
              <div style="font-size:var(--font-size-xs); color:var(--text-tertiary);">In Stock</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--accent-primary);" id="scanned-item-qty">${matchedItem.quantity}</div>
            </div>
          </div>

          <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="btn-scan-use">
              −1 Use Item
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-scan-add">
              +1 Restock
            </button>
            <button class="btn btn-primary btn-sm" id="btn-scan-view">
              View Details
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-scan-resume">
              Scan Another
            </button>
          </div>
        </div>
      `;

      // Quick use button
      document.getElementById('btn-scan-use').addEventListener('click', async () => {
        if (matchedItem.quantity > 0) {
          matchedItem.quantity -= 1;
          await saveItem(matchedItem);
          await addHistory(matchedItem.id, 'used', -1);
          document.getElementById('scanned-item-qty').textContent = matchedItem.quantity;
          showToast(`Used 1 unit of ${matchedItem.name}. Remaining: ${matchedItem.quantity}`, 'info');
        } else {
          showToast('Item is out of stock', 'warning');
        }
      });

      // Quick restock button
      document.getElementById('btn-scan-add').addEventListener('click', async () => {
        matchedItem.quantity += 1;
        await saveItem(matchedItem);
        await addHistory(matchedItem.id, 'restocked', 1);
        document.getElementById('scanned-item-qty').textContent = matchedItem.quantity;
        showToast(`Restocked 1 unit of ${matchedItem.name}. Total: ${matchedItem.quantity}`, 'success');
      });

      // View details
      document.getElementById('btn-scan-view').addEventListener('click', async () => {
        await stopAndClose();
        openItemModal(matchedItem.id);
      });

      // Resume
      document.getElementById('btn-scan-resume').addEventListener('click', () => {
        resultBox.style.display = 'none';
        startCamera(currentCameraId);
      });

    } else {
      // Unrecognized code -> offer to add new item
      resultBox.innerHTML = `
        <div style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:var(--radius-lg); padding:16px;">
          <div style="font-size:var(--font-size-xs); background:rgba(99,102,241,0.15); color:var(--accent-primary); padding:2px 8px; border-radius:999px; font-weight:600; display:inline-block;">
            Scanned Code / SKU
          </div>
          <div style="font-family:monospace; background:var(--bg-secondary); padding:8px 12px; border-radius:8px; margin:10px 0; font-size:var(--font-size-base); word-break:break-all;">
            ${cleanText}
          </div>
          <p style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-bottom:12px;">
            This component code isn't in your inventory yet.
          </p>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" id="btn-scan-create">
              + Add Component with this SKU
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-scan-retry">
              Scan Again
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-scan-create').addEventListener('click', async () => {
        await stopAndClose();
        navigateTo('add-item', { prefillPartNumber: cleanText });
      });

      document.getElementById('btn-scan-retry').addEventListener('click', () => {
        resultBox.style.display = 'none';
        startCamera(currentCameraId);
      });
    }
  }

  // Start default camera
  startCamera();
}
