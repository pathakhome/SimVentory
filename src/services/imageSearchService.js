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
 * Download a remote image via backend proxy and optimize it as a JPEG Blob.
 * @param {string} imageUrl
 * @returns {Promise<Blob>}
 */
export async function fetchWebImageBlob(imageUrl) {
  const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(imageUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error('Failed to download image from web: ' + res.statusText);
  }
  const rawBlob = await res.blob();
  return await optimizeImage(rawBlob, 1200, 0.88);
}
