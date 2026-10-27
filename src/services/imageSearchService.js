/**
 * SimVentory — Web Component Image Search Service
 * Searches the web for electronics components, boards, sensors, and IC images,
 * and fetches the image as an optimized Blob ready for vault storage.
 */

import { optimizeImage } from '../imageUtil.js';

/**
 * Search the web for component images.
 * @param {string} query - e.g. "ESP32-WROOM-32D Development Board"
 * @returns {Promise<Array<{ title: string, image: string, thumbnail: string, width?: number, height?: number, source?: string }>>}
 */
export async function searchComponentImages(query) {
  const cleanQ = (query || '').trim();
  if (!cleanQ) return [];

  const res = await fetch(`/api/search/images?q=${encodeURIComponent(cleanQ)}`);
  if (!res.ok) {
    let errText = '';
    try {
      const errJson = await res.json();
      errText = errJson.error || res.statusText;
    } catch (_) {
      errText = res.statusText;
    }
    throw new Error(errText || 'Image search failed');
  }

  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Attempt to load an image into a Canvas and export as a Blob (handles cross-origin images).
 * @param {string} url
 * @returns {Promise<Blob|null>}
 */
function fetchViaCanvas(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          resolve(blob || null);
        }, 'image/jpeg', 0.9);
      } catch (_) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Download a remote image via backend proxy and optimize it as a JPEG Blob.
 * If the primary image URL fails or is blocked by anti-hotlinking, automatically
 * falls back to thumbnail/CDN image or direct browser retrieval.
 * @param {string} imageUrl
 * @param {string} [fallbackUrl]
 * @returns {Promise<Blob>}
 */
export async function fetchWebImageBlob(imageUrl, fallbackUrl = '') {
  const normTarget = (imageUrl || '').trim();
  const normFallback = (fallbackUrl || '').trim();

  if (!normTarget && !normFallback) {
    throw new Error('No valid image URL provided');
  }

  // 1. Try server proxy with fallback parameter
  try {
    let proxyUrl = `/api/image/proxy?url=${encodeURIComponent(normTarget || normFallback)}`;
    if (normFallback && normFallback !== normTarget) {
      proxyUrl += `&fallback=${encodeURIComponent(normFallback)}`;
    }
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const rawBlob = await res.blob();
      if (rawBlob && rawBlob.size > 200) {
        return await optimizeImage(rawBlob, 1200, 0.88);
      }
    }
  } catch (err) {
    console.warn('[ImageSearchService] Proxy request failed, trying client fallback:', err.message);
  }

  // 2. Client direct fetch fallback (e.g. Bing CDN thumbnails support CORS with Access-Control-Allow-Origin: *)
  const candidates = [normFallback, normTarget].filter(Boolean);
  for (const url of candidates) {
    try {
      let fetchUrl = url;
      if (fetchUrl.includes('.bing.net') && !fetchUrl.includes('&w=')) {
        fetchUrl = fetchUrl.includes('?') ? `${fetchUrl}&w=800&h=800&c=7&rs=1` : `${fetchUrl}?w=800&h=800&c=7&rs=1`;
      }
      const directRes = await fetch(fetchUrl, { mode: 'cors' });
      if (directRes.ok) {
        const directBlob = await directRes.blob();
        if (directBlob && directBlob.type.startsWith('image/')) {
          return await optimizeImage(directBlob, 1200, 0.88);
        }
      }
    } catch (_) {}
  }

  // 3. Canvas image decode fallback
  for (const url of candidates) {
    try {
      let canvasUrl = url;
      if (canvasUrl.includes('.bing.net') && !canvasUrl.includes('&w=')) {
        canvasUrl = canvasUrl.includes('?') ? `${canvasUrl}&w=800&h=800&c=7&rs=1` : `${canvasUrl}?w=800&h=800&c=7&rs=1`;
      }
      const canvasBlob = await fetchViaCanvas(canvasUrl);
      if (canvasBlob) {
        return await optimizeImage(canvasBlob, 1200, 0.88);
      }
    } catch (_) {}
  }

  throw new Error('Image could not be retrieved from the website. Please choose another photo option.');
}

