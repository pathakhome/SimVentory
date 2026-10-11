/**
 * In-App Camera Capture Modal
 * Provides a live viewfinder for taking high-quality component photos
 * directly in the browser with shutter button, camera switching, retake preview,
 * and direct mobile camera capture fallback for HTTP origins.
 */

import { showToast } from '../toast.js';
import { optimizeImage } from '../imageUtil.js';

let activeStream = null;
let currentFacingMode = 'environment';
let capturedBlob = null;

/**
 * Open the Camera Capture Modal.
 * @param {Object} options
 * @param {Function} options.onCapture - callback receiving the captured/optimized Blob
 */
export async function openCameraModal({ onCapture }) {
  const modal = document.getElementById('item-modal');
  const modalContent = document.getElementById('item-modal-content');

  // Stop any active stream before rendering
  stopCameraStream();
  capturedBlob = null;

  const hasMediaDevices = !!(navigator?.mediaDevices?.getUserMedia);

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title" style="display:flex;align-items:center;gap:8px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Take Component Photo
      </h2>
      <button class="modal-close" id="camera-modal-close-btn" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body" style="padding: 16px;">
      <!-- Viewfinder Container -->
      <div id="camera-viewport-container" style="position:relative; width:100%; border-radius:12px; overflow:hidden; background:#000; min-height:280px; max-height:420px; display:flex; align-items:center; justify-content:center;">
        <!-- Live Video Element -->
        <video id="camera-live-video" autoplay playsinline muted style="width:100%; height:100%; max-height:400px; object-fit:cover; display:none; border-radius:12px;"></video>
        
        <!-- Canvas for Capturing Frames -->
        <canvas id="camera-capture-canvas" style="display:none;"></canvas>

        <!-- Image Freeze Preview -->
        <img id="camera-capture-preview" style="display:none; width:100%; height:100%; max-height:400px; object-fit:contain; border-radius:12px;" alt="Captured component" />

        <!-- Framing Crosshair / Reticle -->
        <div id="camera-reticle" style="display:none; position:absolute; inset:0; pointer-events:none; align-items:center; justify-content:center;">
          <div style="width:75%; max-width:280px; aspect-ratio:1; border:2px dashed rgba(255,255,255,0.4); border-radius:16px; box-shadow:0 0 20px rgba(0,0,0,0.5);"></div>
        </div>

        <!-- Fallback/Notice Overlay (For HTTP or Denied Permissions) -->
        <div id="camera-notice-overlay" style="display:none; padding:24px; text-align:center; flex-direction:column; align-items:center; justify-content:center; gap:12px;">
          <div style="font-size:2.5rem;">📸</div>
          <div id="camera-notice-title" style="font-weight:600; font-size:var(--font-size-md); color:var(--text-primary);">Camera App Capture</div>
          <div id="camera-notice-desc" style="font-size:var(--font-size-xs); color:var(--text-secondary); max-width:320px; line-height:1.4;">
            Tap below to open your phone's camera and snap a photo of this component.
          </div>
          <label for="camera-native-input" class="btn btn-primary" style="cursor:pointer; display:inline-flex; align-items:center; gap:8px; margin-top:6px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Open Device Camera
          </label>
        </div>
      </div>

      <!-- Live Capture Controls -->
      <div id="camera-live-controls" style="display:none; justify-content:center; align-items:center; gap:16px; margin-top:16px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-camera-flip" title="Switch between Front and Rear camera">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-3-3"/><path d="M17 4v3"/><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><path d="M9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"/></svg>
          Switch Camera
        </button>

        <!-- Big Shutter Button -->
        <button type="button" class="btn btn-primary" id="btn-camera-shutter" style="padding:10px 24px; font-weight:700; border-radius:999px; display:inline-flex; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          Snap Photo
        </button>

        <label for="camera-native-input" class="btn btn-secondary btn-sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/></svg>
          Device App
        </label>
      </div>

      <!-- Preview Acceptance Controls (Visible after snapping) -->
      <div id="camera-review-controls" style="display:none; justify-content:center; gap:12px; margin-top:16px;">
        <button type="button" class="btn btn-secondary" id="btn-camera-retake">
          ↺ Retake
        </button>
        <button type="button" class="btn btn-primary" id="btn-camera-accept">
          ✓ Use This Photo
        </button>
      </div>

      <!-- Visually-hidden input for native hardware camera capture -->
      <input type="file" id="camera-native-input" accept="image/*" capture="environment" style="position:fixed; top:-1000px; left:-1000px; opacity:0; pointer-events:none;" />
    </div>
  `;

  modal.style.display = 'flex';

  const video = document.getElementById('camera-live-video');
  const preview = document.getElementById('camera-capture-preview');
  const canvas = document.getElementById('camera-capture-canvas');
  const reticle = document.getElementById('camera-reticle');
  const noticeOverlay = document.getElementById('camera-notice-overlay');
  const liveControls = document.getElementById('camera-live-controls');
  const reviewControls = document.getElementById('camera-review-controls');
  const nativeInput = document.getElementById('camera-native-input');

  // Close handler
  const closeModal = () => {
    stopCameraStream();
    capturedBlob = null;
    modal.style.display = 'none';
  };

  document.getElementById('camera-modal-close-btn').addEventListener('click', closeModal);

  // Esc listener
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Handle native file input change
  nativeInput.addEventListener('change', async () => {
    if (nativeInput.files && nativeInput.files.length > 0) {
      const file = nativeInput.files[0];
      closeModal();
      if (onCapture) {
        onCapture(file);
      }
    }
    nativeInput.value = '';
  });

  // Start live stream if supported
  async function startLiveStream() {
    if (!hasMediaDevices) {
      showNotice(
        'Live Video Blocked (HTTP)',
        `Mobile browsers require HTTPS to run live camera feeds over LAN (<code>${location.host}</code>).<br>Tap <strong>"Open Device Camera"</strong> below to take a picture!`
      );
      return;
    }

    try {
      stopCameraStream();

      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = activeStream;
      await video.play();

      video.style.display = 'block';
      preview.style.display = 'none';
      reticle.style.display = 'flex';
      noticeOverlay.style.display = 'none';
      liveControls.style.display = 'flex';
      reviewControls.style.display = 'none';
    } catch (err) {
      console.warn('Live camera error:', err);
      const isPermissionDenied = err.name === 'NotAllowedError' || err.message?.toLowerCase().includes('permission');
      showNotice(
        isPermissionDenied ? 'Camera Permission Denied' : 'Camera Unavailable',
        isPermissionDenied
          ? 'Browser camera permission was denied. Tap below to launch your phone camera app directly.'
          : 'Unable to start in-browser camera. Tap below to take a photo using your device camera.'
      );
    }
  }

  function showNotice(title, descHtml) {
    video.style.display = 'none';
    preview.style.display = 'none';
    reticle.style.display = 'none';
    liveControls.style.display = 'none';
    reviewControls.style.display = 'none';
    noticeOverlay.style.display = 'flex';
    document.getElementById('camera-notice-title').textContent = title;
    document.getElementById('camera-notice-desc').innerHTML = descHtml;
  }

  // Shutter button: Freeze frame
  document.getElementById('btn-camera-shutter').addEventListener('click', () => {
    if (!video || video.videoWidth === 0) return;

    if (navigator.vibrate) navigator.vibrate(50);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('Failed to capture frame', 'error');
        return;
      }
      capturedBlob = blob;
      const previewUrl = URL.createObjectURL(blob);
      preview.src = previewUrl;

      // Switch to review mode
      video.style.display = 'none';
      preview.style.display = 'block';
      reticle.style.display = 'none';
      liveControls.style.display = 'none';
      reviewControls.style.display = 'flex';
    }, 'image/jpeg', 0.92);
  });

  // Retake button
  document.getElementById('btn-camera-retake').addEventListener('click', () => {
    capturedBlob = null;
    video.style.display = 'block';
    preview.style.display = 'none';
    reticle.style.display = 'flex';
    liveControls.style.display = 'flex';
    reviewControls.style.display = 'none';
  });

  // Accept button: save and close
  document.getElementById('btn-camera-accept').addEventListener('click', async () => {
    if (!capturedBlob) return;
    const finalBlob = capturedBlob;
    closeModal();
    if (onCapture) {
      onCapture(finalBlob);
    }
  });

  // Flip Camera button
  document.getElementById('btn-camera-flip').addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    showToast(`Switching to ${currentFacingMode === 'environment' ? 'rear' : 'front'} camera...`, 'info');
    await startLiveStream();
  });

  // Start live stream or fallback
  startLiveStream();
}

/**
 * Safely stops active camera stream tracks.
 */
function stopCameraStream() {
  if (activeStream) {
    try {
      activeStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    activeStream = null;
  }
}
