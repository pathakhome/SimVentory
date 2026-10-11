/**
 * Barcode & QR Code Scanner Modal
 * Uses html5-qrcode to scan electronic component bags, part numbers, and bin labels
 * via smartphone rear camera, desktop webcam, or direct native photo snap.
 */

import { Html5Qrcode } from 'html5-qrcode';
import { getAllItems, saveItem, addHistory } from '../db.js';
import { showToast } from '../toast.js';

let html5QrCode = null;
let isScanning = false;
let isStartingCamera = false;
let currentCameraId = null;
let currentFacingMode = 'environment';

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

  // Clean up any stale scanner instance before rendering modal
  if (html5QrCode) {
    try {
      if (html5QrCode.isScanning) {
        await html5QrCode.stop();
      }
      html5QrCode.clear();
    } catch (e) {
      console.warn('Pre-cleanup scanner error:', e);
    }
    html5QrCode = null;
  }
  isScanning = false;
  isStartingCamera = false;
  currentCameraId = null;
  currentFacingMode = 'environment';

  // Check if live camera stream is supported by browser environment
  const isSecureOrigin = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const hasLiveStreamSupport = !!(navigator?.mediaDevices?.getUserMedia);

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
      <!-- Viewport Container -->
      <div id="scanner-view-container" style="position:relative; width:100%; border-radius:12px; overflow:hidden; background:#000; min-height:280px; display:flex; align-items:center; justify-content:center;">
        <!-- The actual html5-qrcode element -->
        <div id="qr-reader" style="width:100%;"></div>

        <!-- Scanner Reticle & Sweep Overlay -->
        <div class="scan-overlay" id="scan-overlay" style="position:absolute; inset:0; pointer-events:none; display:flex; align-items:center; justify-content:center;">
          <div style="width:70%; max-width:260px; aspect-ratio:1; border:2px dashed rgba(99,102,241,0.8); border-radius:16px; box-shadow:0 0 20px rgba(99,102,241,0.3); position:relative;">
            <div style="position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, transparent, #818cf8, transparent); animation: scannerSweep 2s ease-in-out infinite;"></div>
          </div>
        </div>

        <!-- Error/Notice Overlay (Displayed on top if live stream is blocked, without destroying #qr-reader) -->
        <div id="scanner-status-overlay" style="display:none; position:absolute; inset:0; background:rgba(10,14,26,0.92); backdrop-filter:blur(4px); padding:20px; text-align:center; flex-direction:column; align-items:center; justify-content:center; gap:10px; z-index:10;">
          <div id="scanner-status-icon" style="font-size:2.2rem;">📷</div>
          <div id="scanner-status-title" style="font-weight:600; font-size:var(--font-size-md); color:var(--text-primary);">Camera Live Stream Unavailable</div>
          <div id="scanner-status-desc" style="font-size:var(--font-size-xs); color:var(--text-secondary); max-width:320px; line-height:1.4;">...</div>
          <div id="scanner-status-actions" style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-snap-fallback">
              📸 Take Photo to Scan
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-scanner-retry">
              🔄 Retry Camera
            </button>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div style="display:flex; justify-content:center; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <!-- Snap with Camera: Uses native mobile camera capture directly (works over HTTP without HTTPS) -->
        <button type="button" class="btn btn-primary btn-sm" id="btn-camera-snap" title="Take a photo with your device camera">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Snap Photo
        </button>

        <!-- Switch between Front / Rear cameras or cycle camera devices -->
        <button type="button" class="btn btn-secondary btn-sm" id="btn-switch-camera" title="Switch between Front and Rear Camera">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-3-3"/><path d="M17 4v3"/><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><path d="M9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"/></svg>
          Switch Camera
        </button>

        <!-- Upload image file from gallery -->
        <button type="button" class="btn btn-secondary btn-sm" id="btn-file-scan" title="Pick an image from your files or gallery">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Upload Image
        </button>

        <input type="file" id="scan-camera-input" accept="image/*" capture="environment" hidden />
        <input type="file" id="scan-file-input" accept="image/*" hidden />
      </div>

      <!-- LAN / HTTP helpful hint -->
      ${!isSecureOrigin ? `
        <div style="margin-top:12px; padding:10px 12px; background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.2); border-radius:8px; font-size:var(--font-size-xs); color:var(--text-secondary); line-height:1.4;">
          💡 <strong>Tip for Local Network (${location.host}):</strong> Mobile browsers restrict live WebRTC video feeds over unencrypted HTTP. Use <strong>"Snap Photo"</strong> above for instant 1-tap scanning with your phone camera, or configure HTTPS.
        </div>
      ` : ''}

      <!-- Scanned Result Container -->
      <div id="scanner-result" style="margin-top:16px; display:none;"></div>
    </div>
  `;

  modal.style.display = 'flex';

  // Cleanup handler
  const stopAndClose = async () => {
    if (html5QrCode) {
      try {
        if (html5QrCode.isScanning) {
          await html5QrCode.stop();
        }
        html5QrCode.clear();
      } catch (e) {
        console.warn('Error closing scanner:', e);
      }
      html5QrCode = null;
    }
    isScanning = false;
    isStartingCamera = false;
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

  // Scan file / photo helper
  async function scanSelectedFile(file) {
    if (!file) return;
    try {
      showToast('Scanning barcode from image...', 'info');
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader');
      }
      const text = await html5QrCode.scanFile(file, true);
      handleScannedCode(text);
    } catch (err) {
      showToast('No barcode or QR code detected. Make sure the code is clearly visible.', 'warning');
    }
  }

  // 1. Native Camera Snap (Works on all mobile devices over HTTP & HTTPS)
  const cameraInput = document.getElementById('scan-camera-input');
  const btnCameraSnap = document.getElementById('btn-camera-snap');
  const btnSnapFallback = document.getElementById('btn-snap-fallback');

  if (btnCameraSnap && cameraInput) {
    btnCameraSnap.addEventListener('click', () => cameraInput.click());
  }
  if (btnSnapFallback && cameraInput) {
    btnSnapFallback.addEventListener('click', () => cameraInput.click());
  }
  cameraInput.addEventListener('change', async () => {
    if (cameraInput.files && cameraInput.files.length > 0) {
      await scanSelectedFile(cameraInput.files[0]);
    }
    cameraInput.value = '';
  });

  // 2. Upload image from file picker
  const fileInput = document.getElementById('scan-file-input');
  document.getElementById('btn-file-scan').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    if (fileInput.files && fileInput.files.length > 0) {
      await scanSelectedFile(fileInput.files[0]);
    }
    fileInput.value = '';
  });

  // 3. Retry live stream button
  const btnRetry = document.getElementById('btn-scanner-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      startCamera(currentCameraId);
    });
  }

  // 4. Switch Camera handler
  document.getElementById('btn-switch-camera').addEventListener('click', async () => {
    if (!navigator?.mediaDevices?.enumerateDevices) {
      // Toggle facingMode if device enumeration is not available
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      currentCameraId = null;
      showToast(`Switching to ${currentFacingMode === 'environment' ? 'rear' : 'front'} camera...`, 'info');
      await startCamera();
      return;
    }

    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 1) {
        // Find current device index and select the next camera
        const currentIndex = devices.findIndex(d => d.id === currentCameraId);
        const nextIndex = (currentIndex + 1) % devices.length;
        currentCameraId = devices[nextIndex].id;
        const label = devices[nextIndex].label || `Camera ${nextIndex + 1}`;
        showToast(`Switching to: ${label}`, 'info');
        await startCamera(currentCameraId);
      } else {
        // Only 1 device detected or labels masked -> flip facingMode
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        currentCameraId = null;
        showToast(`Switching to ${currentFacingMode === 'environment' ? 'rear' : 'front'} camera...`, 'info');
        await startCamera();
      }
    } catch (err) {
      // Graceful fallback on getCameras failure (e.g. permission or device locked)
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      currentCameraId = null;
      showToast(`Switching to ${currentFacingMode === 'environment' ? 'rear' : 'front'} camera...`, 'info');
      await startCamera();
    }
  });

  // Start Camera Function
  async function startCamera(cameraId = null) {
    if (isStartingCamera) return;
    isStartingCamera = true;

    const statusOverlay = document.getElementById('scanner-status-overlay');
    const scanOverlay = document.getElementById('scan-overlay');

    // Check if live camera stream is blocked by mobile browser
    if (!navigator?.mediaDevices?.getUserMedia) {
      isStartingCamera = false;
      isScanning = false;
      if (statusOverlay) {
        statusOverlay.style.display = 'flex';
        if (scanOverlay) scanOverlay.style.display = 'none';
        document.getElementById('scanner-status-icon').textContent = '🔒';
        document.getElementById('scanner-status-title').textContent = 'Live Video Blocked by Browser';
        document.getElementById('scanner-status-desc').innerHTML = `
          Mobile browsers require HTTPS to run live camera video streams over LAN (<code>${location.host}</code>).<br><br>
          Tap <strong>"Take Photo to Scan"</strong> to scan using your phone's camera!
        `;
      }
      return;
    }

    try {
      if (statusOverlay) statusOverlay.style.display = 'none';
      if (scanOverlay) scanOverlay.style.display = 'flex';

      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader');
      }

      // Safely stop existing scan before starting a new one
      if (html5QrCode.isScanning) {
        try {
          await html5QrCode.stop();
        } catch (e) {}
      }

      const config = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.max(160, Math.floor(edge * 0.72));
          return { width: boxSize, height: boxSize };
        },
      };

      // In html5-qrcode: pass cameraId string directly, or { facingMode } object
      const cameraParam = cameraId ? cameraId : { facingMode: currentFacingMode };

      await html5QrCode.start(
        cameraParam,
        config,
        (decodedText) => handleScannedCode(decodedText),
        () => {} // Silent on individual frame misses
      );
      isScanning = true;
    } catch (err) {
      console.warn('Camera start error:', err);
      isScanning = false;
      if (statusOverlay) {
        statusOverlay.style.display = 'flex';
        if (scanOverlay) scanOverlay.style.display = 'none';
        document.getElementById('scanner-status-icon').textContent = '📷';
        document.getElementById('scanner-status-title').textContent = 'Camera Access Blocked';

        const isPermissionDenied = err.name === 'NotAllowedError' || err.message?.toLowerCase().includes('permission');
        document.getElementById('scanner-status-desc').textContent = isPermissionDenied
          ? 'Camera permission was denied. Please allow camera access in your browser site permissions, or tap "Take Photo to Scan" below.'
          : (err.message || 'Unable to start camera video feed. You can snap a photo directly to scan.');
      }
    } finally {
      isStartingCamera = false;
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
    if (html5QrCode && html5QrCode.isScanning) {
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
