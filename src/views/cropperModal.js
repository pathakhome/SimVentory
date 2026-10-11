/**
 * Interactive Image Cropper Modal
 * Mobile touch & desktop friendly cropping, rotating, and aspect ratio framing
 * for electronics component photos.
 */

import { showToast } from '../toast.js';
import { optimizeImage } from '../imageUtil.js';

let currentSourceCanvas = null;
let currentCrop = { x: 0, y: 0, w: 0, h: 0 };
let currentAspectRatio = 'free'; // 'free' | '1:1' | '4:3'
let activePointer = null;

/**
 * Open the interactive image cropper modal.
 * @param {Object} options
 * @param {Blob|File|string} options.image - image blob, file, or data/URL to crop
 * @param {Function} options.onDone - callback receiving the cropped, optimized Blob
 * @param {Function} [options.onCancel] - optional callback if user cancels
 */
export async function openCropperModal({ image, onDone, onCancel = null }) {
  const modal = document.getElementById('item-modal');
  const modalContent = document.getElementById('item-modal-content');

  // Load image into an HTMLImageElement
  let imageSourceUrl = '';
  if (typeof image === 'string') {
    imageSourceUrl = image;
  } else {
    imageSourceUrl = URL.createObjectURL(image);
  }

  const loadedImg = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageSourceUrl;
  });

  // Initialize source canvas with loaded image
  currentSourceCanvas = document.createElement('canvas');
  currentSourceCanvas.width = loadedImg.naturalWidth;
  currentSourceCanvas.height = loadedImg.naturalHeight;
  const initCtx = currentSourceCanvas.getContext('2d');
  initCtx.drawImage(loadedImg, 0, 0);

  modalContent.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title" style="display:flex;align-items:center;gap:8px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
        Crop & Frame Component
      </h2>
      <button class="modal-close" id="cropper-close-btn" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body" style="padding: 16px;">
      <!-- Cropper Stage -->
      <div id="cropper-stage" style="position:relative; width:100%; border-radius:12px; overflow:hidden; background:#0a0e1a; min-height:280px; max-height:55vh; display:flex; align-items:center; justify-content:center; user-select:none; touch-action:none;">
        <img id="cropper-display-img" style="max-width:100%; max-height:55vh; object-fit:contain; display:block; pointer-events:none; border-radius:8px;" alt="Image to crop" />
        
        <!-- Interactive Crop Box Overlay -->
        <div id="crop-box" style="position:absolute; border:2px solid var(--accent-primary, #6366f1); box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.65); box-sizing:border-box; cursor:move; touch-action:none;">
          <!-- 3x3 Grid Guidelines -->
          <div style="position:absolute; inset:0; pointer-events:none; display:grid; grid-template-columns:1fr 1fr 1fr; grid-template-rows:1fr 1fr 1fr;">
            <div style="border-right:1px dashed rgba(255,255,255,0.25); border-bottom:1px dashed rgba(255,255,255,0.25);"></div>
            <div style="border-right:1px dashed rgba(255,255,255,0.25); border-bottom:1px dashed rgba(255,255,255,0.25);"></div>
            <div style="border-bottom:1px dashed rgba(255,255,255,0.25);"></div>
            <div style="border-right:1px dashed rgba(255,255,255,0.25); border-bottom:1px dashed rgba(255,255,255,0.25);"></div>
            <div style="border-right:1px dashed rgba(255,255,255,0.25); border-bottom:1px dashed rgba(255,255,255,0.25);"></div>
            <div style="border-bottom:1px dashed rgba(255,255,255,0.25);"></div>
          </div>

          <!-- 4 Corner Touch Handles -->
          <div class="crop-handle" data-handle="tl" style="position:absolute; top:-12px; left:-12px; width:26px; height:26px; border-radius:50%; background:#818cf8; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); cursor:nwse-resize; z-index:2;"></div>
          <div class="crop-handle" data-handle="tr" style="position:absolute; top:-12px; right:-12px; width:26px; height:26px; border-radius:50%; background:#818cf8; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); cursor:nesw-resize; z-index:2;"></div>
          <div class="crop-handle" data-handle="bl" style="position:absolute; bottom:-12px; left:-12px; width:26px; height:26px; border-radius:50%; background:#818cf8; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); cursor:nesw-resize; z-index:2;"></div>
          <div class="crop-handle" data-handle="br" style="position:absolute; bottom:-12px; right:-12px; width:26px; height:26px; border-radius:50%; background:#818cf8; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.5); cursor:nwse-resize; z-index:2;"></div>
        </div>
      </div>

      <!-- Toolbar: Rotate, Aspect Ratio, Reset -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-crop-rotate" title="Rotate image 90 degrees clockwise">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            Rotate 90°
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-crop-reset" title="Reset crop box to full image">
            ↺ Reset
          </button>
        </div>

        <!-- Aspect Ratio presets -->
        <div style="display:flex; gap:4px; align-items:center; background:var(--bg-secondary, #111827); padding:3px; border-radius:8px; border:1px solid var(--border-secondary, rgba(255,255,255,0.1));">
          <button type="button" class="crop-ratio-btn active" data-ratio="free" style="padding:4px 10px; font-size:var(--font-size-xs, 12px); border-radius:6px; border:none; background:var(--accent-primary, #6366f1); color:#fff; cursor:pointer;">Free</button>
          <button type="button" class="crop-ratio-btn" data-ratio="1:1" style="padding:4px 10px; font-size:var(--font-size-xs, 12px); border-radius:6px; border:none; background:transparent; color:var(--text-secondary, #94a3b8); cursor:pointer;">1:1 Square</button>
          <button type="button" class="crop-ratio-btn" data-ratio="4:3" style="padding:4px 10px; font-size:var(--font-size-xs, 12px); border-radius:6px; border:none; background:transparent; color:var(--text-secondary, #94a3b8); cursor:pointer;">4:3</button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        <button type="button" class="btn btn-secondary" id="btn-crop-cancel">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" id="btn-crop-apply" style="display:inline-flex; align-items:center; gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Apply Crop
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  const displayImg = document.getElementById('cropper-display-img');
  const cropBox = document.getElementById('crop-box');
  const stage = document.getElementById('cropper-stage');

  // Update display image and initialize crop box
  function refreshDisplayImage() {
    displayImg.src = currentSourceCanvas.toDataURL('image/jpeg', 0.95);
  }

  // Position crop box over the rendered image
  function resetCropBox(ratio = currentAspectRatio) {
    const imgRect = displayImg.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    const imgOffsetLeft = imgRect.left - stageRect.left;
    const imgOffsetTop = imgRect.top - stageRect.top;
    const imgWidth = imgRect.width;
    const imgHeight = imgRect.height;

    let targetW = imgWidth * 0.88;
    let targetH = imgHeight * 0.88;

    if (ratio === '1:1') {
      const minEdge = Math.min(targetW, targetH);
      targetW = minEdge;
      targetH = minEdge;
    } else if (ratio === '4:3') {
      targetH = (targetW * 3) / 4;
      if (targetH > imgHeight * 0.9) {
        targetH = imgHeight * 0.9;
        targetW = (targetH * 4) / 3;
      }
    }

    currentCrop = {
      x: imgOffsetLeft + (imgWidth - targetW) / 2,
      y: imgOffsetTop + (imgHeight - targetH) / 2,
      w: targetW,
      h: targetH,
    };

    updateCropBoxDOM();
  }

  function updateCropBoxDOM() {
    cropBox.style.left = `${currentCrop.x}px`;
    cropBox.style.top = `${currentCrop.y}px`;
    cropBox.style.width = `${currentCrop.w}px`;
    cropBox.style.height = `${currentCrop.h}px`;
  }

  displayImg.onload = () => {
    resetCropBox();
  };

  refreshDisplayImage();

  // Close / Cancel Handlers
  const handleClose = () => {
    if (typeof image !== 'string' && imageSourceUrl) {
      URL.revokeObjectURL(imageSourceUrl);
    }
    modal.style.display = 'none';
    if (onCancel) onCancel();
  };

  document.getElementById('cropper-close-btn').addEventListener('click', handleClose);
  document.getElementById('btn-crop-cancel').addEventListener('click', handleClose);

  // Rotate 90° Clockwise
  document.getElementById('btn-crop-rotate').addEventListener('click', () => {
    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = currentSourceCanvas.height;
    rotatedCanvas.height = currentSourceCanvas.width;
    const rCtx = rotatedCanvas.getContext('2d');
    rCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    rCtx.rotate((90 * Math.PI) / 180);
    rCtx.drawImage(currentSourceCanvas, -currentSourceCanvas.width / 2, -currentSourceCanvas.height / 2);

    currentSourceCanvas = rotatedCanvas;
    refreshDisplayImage();
    showToast('Rotated 90°', 'info');
  });

  // Reset Button
  document.getElementById('btn-crop-reset').addEventListener('click', () => {
    resetCropBox();
  });

  // Aspect Ratio Preset Buttons
  document.querySelectorAll('.crop-ratio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crop-ratio-btn').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary, #94a3b8)';
        b.classList.remove('active');
      });
      btn.style.background = 'var(--accent-primary, #6366f1)';
      btn.style.color = '#fff';
      btn.classList.add('active');

      currentAspectRatio = btn.getAttribute('data-ratio');
      resetCropBox(currentAspectRatio);
    });
  });

  // Pointer Interaction (Unified Touch + Mouse via PointerEvents)
  cropBox.addEventListener('pointerdown', (e) => {
    const handleEl = e.target.closest('.crop-handle');
    const handleType = handleEl ? handleEl.getAttribute('data-handle') : null;

    activePointer = {
      id: e.pointerId,
      mode: handleType ? 'resize' : 'drag',
      handle: handleType,
      startX: e.clientX,
      startY: e.clientY,
      initCrop: { ...currentCrop },
    };

    cropBox.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  cropBox.addEventListener('pointermove', (e) => {
    if (!activePointer || activePointer.id !== e.pointerId) return;

    const dx = e.clientX - activePointer.startX;
    const dy = e.clientY - activePointer.startY;

    const imgRect = displayImg.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    const minX = imgRect.left - stageRect.left;
    const minY = imgRect.top - stageRect.top;
    const maxX = minX + imgRect.width;
    const maxY = minY + imgRect.height;

    const minSize = 40;

    if (activePointer.mode === 'drag') {
      let newX = activePointer.initCrop.x + dx;
      let newY = activePointer.initCrop.y + dy;

      newX = Math.max(minX, Math.min(maxX - activePointer.initCrop.w, newX));
      newY = Math.max(minY, Math.min(maxY - activePointer.initCrop.h, newY));

      currentCrop.x = newX;
      currentCrop.y = newY;
    } else if (activePointer.mode === 'resize') {
      let { x, y, w, h } = activePointer.initCrop;

      if (activePointer.handle === 'br') {
        w = Math.max(minSize, Math.min(maxX - x, w + dx));
        if (currentAspectRatio === '1:1') {
          w = Math.min(w, maxY - y);
          h = w;
        } else if (currentAspectRatio === '4:3') {
          h = (w * 3) / 4;
        } else {
          h = Math.max(minSize, Math.min(maxY - y, h + dy));
        }
      } else if (activePointer.handle === 'bl') {
        const rightEdge = x + w;
        let newX = Math.max(minX, Math.min(rightEdge - minSize, x + dx));
        w = rightEdge - newX;
        x = newX;
        if (currentAspectRatio === '1:1') {
          h = w;
        } else if (currentAspectRatio === '4:3') {
          h = (w * 3) / 4;
        } else {
          h = Math.max(minSize, Math.min(maxY - y, h + dy));
        }
      } else if (activePointer.handle === 'tr') {
        const bottomEdge = y + h;
        let newY = Math.max(minY, Math.min(bottomEdge - minSize, y + dy));
        h = bottomEdge - newY;
        y = newY;
        w = Math.max(minSize, Math.min(maxX - x, w + dx));
        if (currentAspectRatio === '1:1') {
          w = h;
        } else if (currentAspectRatio === '4:3') {
          w = (h * 4) / 3;
        }
      } else if (activePointer.handle === 'tl') {
        const rightEdge = x + w;
        const bottomEdge = y + h;
        let newX = Math.max(minX, Math.min(rightEdge - minSize, x + dx));
        let newY = Math.max(minY, Math.min(bottomEdge - minSize, y + dy));
        w = rightEdge - newX;
        h = bottomEdge - newY;
        if (currentAspectRatio === '1:1') {
          const size = Math.min(w, h);
          w = size;
          h = size;
          newX = rightEdge - size;
          newY = bottomEdge - size;
        }
        x = newX;
        y = newY;
      }

      currentCrop = { x, y, w, h };
    }

    updateCropBoxDOM();
  });

  const pointerRelease = (e) => {
    if (activePointer && activePointer.id === e.pointerId) {
      try { cropBox.releasePointerCapture(e.pointerId); } catch (_) {}
      activePointer = null;
    }
  };

  cropBox.addEventListener('pointerup', pointerRelease);
  cropBox.addEventListener('pointercancel', pointerRelease);

  // Apply Crop & Export
  document.getElementById('btn-crop-apply').addEventListener('click', async () => {
    try {
      showToast('Cropping image...', 'info');

      const imgRect = displayImg.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();

      const imgOffsetLeft = imgRect.left - stageRect.left;
      const imgOffsetTop = imgRect.top - stageRect.top;

      // Coordinate scaling between rendered image and original source canvas
      const scaleX = currentSourceCanvas.width / imgRect.width;
      const scaleY = currentSourceCanvas.height / imgRect.height;

      const cropRelX = Math.max(0, currentCrop.x - imgOffsetLeft);
      const cropRelY = Math.max(0, currentCrop.y - imgOffsetTop);

      const sourceX = Math.round(cropRelX * scaleX);
      const sourceY = Math.round(cropRelY * scaleY);
      const sourceW = Math.round(Math.min(currentCrop.w * scaleX, currentSourceCanvas.width - sourceX));
      const sourceH = Math.round(Math.min(currentCrop.h * scaleY, currentSourceCanvas.height - sourceY));

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = sourceW;
      croppedCanvas.height = sourceH;

      const cropCtx = croppedCanvas.getContext('2d');
      cropCtx.drawImage(
        currentSourceCanvas,
        sourceX, sourceY, sourceW, sourceH,
        0, 0, sourceW, sourceH
      );

      // Convert to blob and optimize
      croppedCanvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('Failed to crop image', 'error');
          return;
        }

        const optimized = await optimizeImage(blob);
        modal.style.display = 'none';
        if (typeof image !== 'string' && imageSourceUrl) {
          URL.revokeObjectURL(imageSourceUrl);
        }

        showToast('Photo cropped and optimized!', 'success');
        if (onDone) onDone(optimized);
      }, 'image/jpeg', 0.92);
    } catch (err) {
      console.error('Cropper error:', err);
      showToast('Failed to crop: ' + err.message, 'error');
    }
  });
}
