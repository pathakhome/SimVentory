/**
 * SimVentory — Web Image Picker Modal
 * Allows users to search and select high-resolution component photos from the internet.
 */

import { searchComponentImages, fetchWebImageBlob } from '../services/imageSearchService.js';
import { showToast } from '../toast.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Open the Web Image Search & Selection Modal.
 * @param {Object} options
 * @param {string} options.query - Initial search query (e.g. "ESP32-WROOM-32D")
 * @param {Function} options.onSelect - Callback receiving the selected, optimized Blob
 */
export async function openWebImageModal({ query = '', initialQuery = '', onSelect }) {
  const modal = document.getElementById('item-modal');
  const modalContent = document.getElementById('item-modal-content');

  let currentQuery = (query || initialQuery || '').trim();
  let results = [];
  let isLoading = true;

  function renderModal() {
    modalContent.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
          <span>🌐</span>
          Find Component Photo on Web
        </h2>
        <button class="modal-close" id="web-image-modal-close" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="modal-body" style="padding: 16px 20px;">
        <!-- Search bar -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <input
            type="text"
            id="web-image-search-input"
            class="form-control"
            value="${escapeHtml(currentQuery)}"
            placeholder="Search component name, IC part number, sensor module..."
            style="flex: 1;"
          />
          <button type="button" class="btn btn-primary" id="btn-web-image-search" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Search
          </button>
        </div>

        <!-- Results Grid -->
        <div id="web-image-results-container" style="min-height: 280px; max-height: 55vh; overflow-y: auto;">
          ${isLoading ? `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 12px; color: var(--text-secondary);">
              <div class="spinner" style="width: 28px; height: 28px;"></div>
              <div style="font-size: var(--font-size-sm);">Searching web for component photos...</div>
            </div>
          ` : results.length === 0 ? `
            <div style="text-align: center; padding: 60px 20px; color: var(--text-tertiary);">
              <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
              <div style="font-weight: 600; color: var(--text-secondary);">No images found</div>
              <div style="font-size: var(--font-size-xs); margin-top: 4px;">Try a shorter component name or part number.</div>
            </div>
          ` : `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px;">
              ${results.map((r, idx) => `
                <div class="web-image-card" data-idx="${idx}" style="
                  position: relative; border-radius: 8px; overflow: hidden; background: #0f1523; border: 1px solid var(--border-primary);
                  aspect-ratio: 1; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease;
                ">
                  <img
                    src="${r.thumbnail || r.image}"
                    alt="${escapeHtml(r.title)}"
                    loading="lazy"
                    style="width: 100%; height: 100%; object-fit: contain; padding: 6px; background: #fff; border-radius: 6px;"
                  />
                  <div class="web-image-card-overlay" style="
                    position: absolute; inset: 0; background: rgba(99,102,241,0.85); color: #fff;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    opacity: 0; transition: opacity 0.15s ease; padding: 8px; text-align: center; font-size: 11px; font-weight: 700;
                  ">
                    <span>✓ Select Photo</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    // Event binding
    const closeBtn = document.getElementById('web-image-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    const searchInput = document.getElementById('web-image-search-input');
    const searchBtn = document.getElementById('btn-web-image-search');

    async function triggerSearch() {
      if (!searchInput) return;
      currentQuery = searchInput.value.trim();
      if (!currentQuery) return;
      isLoading = true;
      renderModal();
      try {
        results = await searchComponentImages(currentQuery);
      } catch (err) {
        showToast('Search failed: ' + err.message, 'error');
        results = [];
      } finally {
        isLoading = false;
        renderModal();
      }
    }

    if (searchBtn) searchBtn.addEventListener('click', triggerSearch);
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          triggerSearch();
        }
      });
    }

    // Result card selection
    const cards = modalContent.querySelectorAll('.web-image-card');
    cards.forEach(card => {
      card.addEventListener('click', async () => {
        const idx = parseInt(card.dataset.idx, 10);
        const selected = results[idx];
        if (!selected) return;

        // Show loading spinner on card
        card.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="spinner" style="width:20px;height:20px;"></div></div>`;

        try {
          showToast('Downloading image from web...', 'info');
          const targetUrl = selected.image || selected.thumbnail;
          const fallbackUrl = selected.thumbnail && selected.thumbnail !== targetUrl ? selected.thumbnail : '';
          const blob = await fetchWebImageBlob(targetUrl, fallbackUrl);
          modal.style.display = 'none';
          showToast('Photo attached from web!', 'success');
          if (onSelect) onSelect(blob);
        } catch (err) {
          console.error('[WebImageModal] Download error:', err);
          showToast('Failed to download image: ' + err.message, 'error');
          renderModal();
        }
      });
    });
  }

  // Initial load
  renderModal();
  try {
    results = await searchComponentImages(currentQuery);
  } catch (err) {
    results = [];
  } finally {
    isLoading = false;
    renderModal();
  }
}
