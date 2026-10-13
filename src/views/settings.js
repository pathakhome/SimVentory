/**
 * Settings view renderer.
 * Provides custom category management, custom storage locations management,
 * appearance preferences, and data backup / restore.
 */
import {
  exportData,
  importData,
  exportCSV,
  getAllItems,
  clearAllData,
  getCategories,
  saveCategory,
  deleteCategory,
  getLocations,
  saveLocation,
  deleteLocation,
} from '../db.js';
import { LOCATION_COLOR_PRESETS, DEFAULT_LOCATION_COLOR } from '../categories.js';
import { showToast } from '../toast.js';
import {
  getAISettings,
  fetchAISettings,
  saveAISettings,
  testAIConnection,
  PROVIDER_PRESETS,
  DEFAULT_SYSTEM_PROMPT,
  STATIC_JSON_SCHEMA,
} from '../services/aiService.js';

export async function renderSettings(container, { refreshView }) {
  const [items, categories, locations, aiSettings] = await Promise.all([
    getAllItems(),
    getCategories(),
    getLocations(),
    fetchAISettings(),
  ]);
  const currentPreset = PROVIDER_PRESETS[aiSettings.provider] || PROVIDER_PRESETS.custom;

  const EMOJI_PRESETS = ['🏷️', '🔌', '💡', '🧰', '📟', '🎛️', '🔬', '🪛', '📻', '🔋', '⚡', '🤖'];

  container.innerHTML = `
    <div class="fade-in">
      <div class="view-header">
        <h1>Settings & Preferences</h1>
        <p>Manage custom categories, storage locations, backups, and display options</p>
      </div>

      <!-- Custom Categories Management -->
      <div class="settings-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3>🏷️ Custom Categories</h3>
            <p style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:2px;">
              Create custom categories with personalized icons and accent colors for organizing your DIY parts.
            </p>
          </div>
        </div>

        <!-- Add Category Form -->
        <div style="background:var(--bg-secondary); border:1px solid var(--border-secondary); border-radius:var(--border-radius-lg); padding:16px; margin-bottom:18px;">
          <h4 style="font-size:var(--font-size-sm); font-weight:600; margin-bottom:12px; color:var(--text-primary);">
            + Add New Category
          </h4>
          <form id="add-category-form" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Category Name</label>
              <input type="text" id="new-cat-name" placeholder="e.g., Microcontrollers, Relays" required style="width:100%;" />
            </div>
            <div style="width:70px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Icon</label>
              <input type="text" id="new-cat-icon" value="📦" maxlength="4" style="width:100%; text-align:center; font-size:1.1rem;" />
            </div>
            <div style="width:65px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Color</label>
              <input type="color" id="new-cat-color" value="#818cf8" style="width:100%; height:40px; border-radius:6px; cursor:pointer; padding:2px;" />
            </div>
            <button type="submit" class="btn btn-primary btn-sm" style="height:40px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Category
            </button>
          </form>

          <!-- Emoji quick presets -->
          <div style="display:flex; gap:6px; align-items:center; margin-top:10px; flex-wrap:wrap;">
            <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Quick Icons:</span>
            ${EMOJI_PRESETS.map(e => `
              <button type="button" class="btn-preset-emoji" data-emoji="${e}" style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:4px; padding:2px 6px; font-size:13px; cursor:pointer;">${e}</button>
            `).join('')}
          </div>
        </div>

        <!-- Categories List -->
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:10px;" id="categories-list">
          ${categories.map(cat => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:8px; padding:10px 14px;">
              <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                <span style="font-size:1.25rem;">${cat.icon || '📦'}</span>
                <div style="min-width:0;">
                  <div style="font-weight:600; font-size:var(--font-size-sm); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                    <span>${escapeHtml(cat.name)}</span>
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${cat.color || '#818cf8'}; flex-shrink:0;"></span>
                  </div>
                  <span style="font-size:11px; color:var(--text-tertiary);">${cat.isDefault ? 'Default' : 'Custom'}</span>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:4px;">
                <button type="button" class="btn-edit-cat" data-name="${escapeAttr(cat.name)}" data-icon="${escapeAttr(cat.icon || '📦')}" data-color="${escapeAttr(cat.color || '#818cf8')}" title="Edit category" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                ${!cat.isDefault && cat.name.toLowerCase() !== 'other' ? `
                  <button type="button" class="btn-delete-cat" data-name="${escapeAttr(cat.name)}" title="Delete category" style="background:none; border:none; color:var(--text-tertiary); cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Storage Locations Management -->
      <div class="settings-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3>📍 Custom Storage Locations</h3>
            <p style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:2px;">
              Keep track of which drawer, bin, tackle box, or shelf contains your electronics. Assign colors for instant visual identification.
            </p>
          </div>
        </div>

        <!-- Add Location Form -->
        <div style="background:var(--bg-secondary); border:1px solid var(--border-secondary); border-radius:var(--border-radius-lg); padding:16px; margin-bottom:18px;">
          <h4 style="font-size:var(--font-size-sm); font-weight:600; margin-bottom:12px; color:var(--text-primary);">
            + Add New Storage Location
          </h4>
          <form id="add-location-form" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Location Name</label>
              <input type="text" id="new-loc-name" placeholder="e.g., Drawer A1, Bin 4, Shelf 2" required style="width:100%;" />
            </div>
            <div style="flex:1.5; min-width:200px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Description / Notes (Optional)</label>
              <input type="text" id="new-loc-desc" placeholder="e.g., Top acrylic organizer, ESD foam" style="width:100%;" />
            </div>
            <div style="width:65px;">
              <label class="form-label" style="font-size:var(--font-size-xs);">Color</label>
              <input type="color" id="new-loc-color" value="${DEFAULT_LOCATION_COLOR}" style="width:100%; height:40px; border-radius:6px; cursor:pointer; padding:2px;" />
            </div>
            <button type="submit" class="btn btn-primary btn-sm" style="height:40px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Location
            </button>
          </form>

          <!-- Color quick presets for location -->
          <div style="display:flex; gap:6px; align-items:center; margin-top:10px; flex-wrap:wrap;">
            <span style="font-size:var(--font-size-xs); color:var(--text-tertiary);">Quick Colors:</span>
            ${LOCATION_COLOR_PRESETS.map(c => `
              <button type="button" class="btn-preset-loc-color" data-color="${c}" style="width:20px; height:20px; border-radius:50%; background:${c}; border:2px solid var(--border-secondary); cursor:pointer; padding:0;"></button>
            `).join('')}
          </div>
        </div>

        <!-- Locations List -->
        ${locations.length === 0 ? `
          <p style="color:var(--text-tertiary); font-size:var(--font-size-sm); padding:12px; background:var(--bg-secondary); border-radius:8px;">
            No storage locations registered yet. Add locations above or type them directly when adding components.
          </p>
        ` : `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px;" id="locations-list">
            ${locations.map(loc => `
              <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:8px; padding:10px 14px;">
                <div style="min-width:0; display:flex; align-items:center; gap:10px;">
                  <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${loc.color || '#6366f1'}; flex-shrink:0; box-shadow:0 0 6px ${loc.color || '#6366f1'}66;"></span>
                  <div style="min-width:0;">
                    <div style="font-weight:600; font-size:var(--font-size-sm); display:flex; align-items:center; gap:6px;">
                      <span>📍</span>
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(loc.name)}</span>
                    </div>
                    ${loc.description ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(loc.description)}</div>` : ''}
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button type="button" class="btn-edit-loc" data-name="${escapeAttr(loc.name)}" data-desc="${escapeAttr(loc.description || '')}" data-color="${escapeAttr(loc.color || '#6366f1')}" title="Edit location" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button type="button" class="btn-delete-loc" data-name="${escapeAttr(loc.name)}" title="Delete location" style="background:none; border:none; color:var(--text-tertiary); cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- AI Vision & Autofill Settings -->
      <div class="settings-section">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3>🤖 AI Vision & Autofill Settings</h3>
            <p style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:2px;">
              Configure OpenRouter, Google Gemini, OpenAI, or local Ollama to recognize component photos and autofill details.
            </p>
          </div>
        </div>

        <div style="background:var(--bg-secondary); border:1px solid var(--border-secondary); border-radius:var(--border-radius-lg); padding:16px;">
          <!-- Enable AI toggle -->
          <div class="settings-row" style="padding-top:0; border-bottom:1px solid var(--border-primary); padding-bottom:12px; margin-bottom:14px;">
            <div class="settings-row-info">
              <h4>Enable AI Component Recognition</h4>
              <p>Show AI recognition options when photographing or uploading parts</p>
            </div>
            <label class="switch" style="position:relative; display:inline-block; width:46px; height:24px; cursor:pointer;">
              <input type="checkbox" id="ai-enabled-toggle" ${aiSettings.enabled ? 'checked' : ''} style="display:none;" />
              <span id="ai-toggle-track" style="position:absolute; inset:0; background:${aiSettings.enabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}; border-radius:24px; transition:background 0.25s ease; border:1px solid var(--border-secondary);">
                <span id="ai-toggle-thumb" style="position:absolute; top:2px; left:${aiSettings.enabled ? '24px' : '3px'}; width:18px; height:18px; background:#fff; border-radius:50%; transition:left 0.25s ease; box-shadow:0 1px 3px rgba(0,0,0,0.4);"></span>
              </span>
            </label>
          </div>

          <form id="ai-settings-form" style="display:flex; flex-direction:column; gap:14px;">
            <!-- Provider Preset -->
            <div>
              <label class="form-label" style="font-size:var(--font-size-xs);">AI Provider</label>
              <select id="ai-provider-select" style="width:100%;">
                ${Object.values(PROVIDER_PRESETS).map(p => `
                  <option value="${p.id}" ${aiSettings.provider === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
                `).join('')}
              </select>
              <div id="ai-provider-hint" style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">
                ${escapeHtml(currentPreset.hint)}
              </div>
            </div>

            <!-- Endpoint URL -->
            <div>
              <label class="form-label" style="font-size:var(--font-size-xs);">API Endpoint URL</label>
              <input type="url" id="ai-endpoint-input" value="${escapeAttr(aiSettings.endpoint)}" placeholder="https://..." style="width:100%; font-family:monospace; font-size:var(--font-size-sm);" />
            </div>

            <!-- API Key -->
            <div>
              <label class="form-label" style="font-size:var(--font-size-xs); display:flex; justify-content:space-between;">
                <span>API Key</span>
                <span id="ai-key-hint" style="font-size:11px; color:var(--text-tertiary);">${currentPreset.requiresKey ? 'Required' : 'Optional / Not needed'}</span>
              </label>
              <div style="display:flex; gap:8px;">
                <input type="password" id="ai-apikey-input" value="${escapeAttr(aiSettings.apiKey)}" placeholder="${escapeAttr(currentPreset.placeholderKey)}" style="flex:1; font-family:monospace; font-size:var(--font-size-sm);" />
                <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-apikey-visibility" title="Show/Hide API Key" style="padding:0 10px;">
                  👁️
                </button>
              </div>
            </div>

            <!-- Model Name -->
            <div>
              <label class="form-label" style="font-size:var(--font-size-xs);">Vision Model Name</label>
              <input type="text" id="ai-model-input" value="${escapeAttr(aiSettings.model)}" placeholder="e.g. google/gemini-2.0-flash-001" style="width:100%; font-family:monospace; font-size:var(--font-size-sm);" />
              
              <!-- Quick suggested model chips -->
              <div id="ai-suggested-models" style="display:flex; gap:6px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                <span style="font-size:11px; color:var(--text-tertiary);">Quick select:</span>
                ${(currentPreset.suggestedModels || []).map(m => `
                  <button type="button" class="btn-preset-model" data-model="${escapeAttr(m)}" style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:4px; padding:2px 8px; font-size:11px; font-family:monospace; cursor:pointer; color:var(--text-secondary);">${escapeHtml(m)}</button>
                `).join('')}
              </div>
            </div>

            <!-- Primary Model Rate Limit (RPM) -->
            <div style="margin-top: 6px; background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: 6px; padding: 10px 12px;">
              <label class="form-label" for="ai-primary-rpm-input" style="font-size:var(--font-size-xs); display:flex; justify-content:space-between; margin-bottom: 4px;">
                <span><strong>Primary Model Rate Limit (Requests / Minute)</strong></span>
                <span style="font-size:11px; color:var(--text-tertiary);">0 = Disabled</span>
              </label>
              <div style="display:flex; align-items:center; gap:10px;">
                <input type="number" id="ai-primary-rpm-input" min="0" max="300" value="${aiSettings.primaryRpmLimit !== undefined ? aiSettings.primaryRpmLimit : 5}" style="width: 100px; font-weight:700; font-size:var(--font-size-sm);" />
                <span style="font-size:11px; color:var(--text-secondary);">
                  e.g. <strong>5 RPM</strong> (recommended for 3 parallel queue workers). When limit is reached, requests automatically switch to the Backup Model.
                </span>
              </div>
            </div>

            <!-- Server Proxy CORS bypass -->
            <div style="display:flex; align-items:flex-start; gap:8px; margin-top:2px;">
              <input type="checkbox" id="ai-server-proxy-check" ${aiSettings.useServerProxy ? 'checked' : ''} style="margin-top:3px; accent-color:var(--accent-primary);" />
              <label for="ai-server-proxy-check" style="font-size:var(--font-size-xs); color:var(--text-secondary); cursor:pointer;">
                <strong>Route requests via SimVentory server</strong> (Bypasses browser CORS errors for local Ollama, LM Studio, or homelab machines).
              </label>
            </div>

            <!-- Live Web Search Grounding Toggle -->
            <div style="display:flex; align-items:flex-start; gap:8px; margin-top:4px;">
              <input type="checkbox" id="ai-web-search-check" ${aiSettings.webSearchGrounding !== false ? 'checked' : ''} style="margin-top:3px; accent-color:var(--accent-primary);" />
              <label for="ai-web-search-check" style="font-size:var(--font-size-xs); color:var(--text-secondary); cursor:pointer;">
                <strong>🌐 Enable Live Google Search Grounding</strong> (Allows Gemini to search live product pages on Robu.in or distributors to fetch pinouts, exact specs, and physical dimensions using detected packaging SKUs and barcodes).
              </label>
            </div>

            <!-- Backup / Fallback Model Card -->
            <div style="border: 1px solid rgba(99,102,241,0.3); border-radius: 8px; padding: 14px; background: linear-gradient(135deg, rgba(99,102,241,0.05), rgba(168,85,247,0.05)); margin-top: 6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <span style="font-size: var(--font-size-sm); font-weight: 700; color: var(--text-primary); display:flex; align-items:center; gap:6px;">
                    <span>🛡️</span> Backup / Fallback AI Model
                  </span>
                  <p style="font-size: 11px; color: var(--text-secondary); margin: 2px 0 0 0;">
                    Invoked automatically when primary RPM threshold is reached, on 429 quota exhaustion, or if the primary model fails.
                  </p>
                </div>
                <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer; flex-shrink:0;">
                  <input type="checkbox" id="ai-backup-enabled-toggle" ${aiSettings.backupEnabled !== false ? 'checked' : ''} style="opacity:0; width:0; height:0;" />
                  <span id="ai-backup-track" style="position:absolute; inset:0; background:${aiSettings.backupEnabled !== false ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}; border-radius:24px; transition:background 0.25s ease; border:1px solid var(--border-secondary);">
                    <span id="ai-backup-thumb" style="position:absolute; top:2px; left:${aiSettings.backupEnabled !== false ? '22px' : '2px'}; width:18px; height:18px; background:#fff; border-radius:50%; transition:left 0.25s ease;"></span>
                  </span>
                </label>
              </div>

              <div id="ai-backup-fields-container" style="display: ${aiSettings.backupEnabled !== false ? 'flex' : 'none'}; flex-direction: column; gap: 12px; border-top: 1px dashed var(--border-secondary); padding-top: 12px; margin-top: 12px;">
                <!-- Backup Provider -->
                <div>
                  <label class="form-label" style="font-size:var(--font-size-xs);">Backup Provider</label>
                  <select id="ai-backup-provider-select" style="width:100%;">
                    ${Object.values(PROVIDER_PRESETS).map(p => `
                      <option value="${p.id}" ${(aiSettings.backupProvider || 'gemini') === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
                    `).join('')}
                  </select>
                </div>

                <!-- Backup Model Name -->
                <div>
                  <label class="form-label" style="font-size:var(--font-size-xs);">Backup Model Name</label>
                  <input type="text" id="ai-backup-model-input" value="${escapeAttr(aiSettings.backupModel || 'gemini-1.5-flash')}" placeholder="e.g. gemini-1.5-flash" style="width:100%; font-family:monospace; font-size:var(--font-size-sm);" />
                  
                  <div id="ai-backup-suggested-models" style="display:flex; gap:6px; align-items:center; margin-top:6px; flex-wrap:wrap;">
                    <span style="font-size:11px; color:var(--text-tertiary);">Quick select:</span>
                    ${((PROVIDER_PRESETS[aiSettings.backupProvider || 'gemini'] || PROVIDER_PRESETS.gemini).suggestedModels || []).map(m => `
                      <button type="button" class="btn-preset-backup-model" data-model="${escapeAttr(m)}" style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:4px; padding:2px 8px; font-size:11px; font-family:monospace; cursor:pointer; color:var(--text-secondary);">${escapeHtml(m)}</button>
                    `).join('')}
                  </div>
                </div>

                <!-- Backup Endpoint -->
                <div>
                  <label class="form-label" style="font-size:var(--font-size-xs);">Backup Endpoint URL</label>
                  <input type="url" id="ai-backup-endpoint-input" value="${escapeAttr(aiSettings.backupEndpoint || (PROVIDER_PRESETS[aiSettings.backupProvider || 'gemini']?.endpoint || ''))}" placeholder="https://..." style="width:100%; font-family:monospace; font-size:var(--font-size-sm);" />
                </div>

                <!-- Backup API Key (Optional) -->
                <div>
                  <label class="form-label" style="font-size:var(--font-size-xs); display:flex; justify-content:space-between;">
                    <span>Backup API Key (Optional)</span>
                    <span style="font-size:11px; color:var(--text-tertiary);">Leave empty to reuse primary key</span>
                  </label>
                  <input type="password" id="ai-backup-apikey-input" value="${escapeAttr(aiSettings.backupApiKey || '')}" placeholder="Reuses primary key if empty" style="width:100%; font-family:monospace; font-size:var(--font-size-sm);" />
                </div>

                <!-- Backup Server Proxy Toggle -->
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" id="ai-backup-proxy-check" ${aiSettings.backupUseServerProxy ? 'checked' : ''} style="accent-color:var(--accent-primary);" />
                  <label for="ai-backup-proxy-check" style="font-size:var(--font-size-xs); color:var(--text-secondary); cursor:pointer;">
                    Route backup requests via SimVentory server proxy (for local Ollama/LM Studio)
                  </label>
                </div>

                <!-- Test Backup Button -->
                <div style="display:flex; justify-content:flex-end;">
                  <button type="button" class="btn btn-secondary btn-sm" id="ai-test-backup-btn" style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Test Backup Model
                  </button>
                </div>
              </div>
            </div>

            <!-- Customizable Prompt & Static Schema -->
            <div style="border-top:1px solid var(--border-primary); padding-top:14px; margin-top:4px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label class="form-label" for="ai-prompt-input" style="font-size:var(--font-size-xs); font-weight:600; margin-bottom:0;">
                  📝 AI Vision Prompt (Customizable)
                </label>
                <button type="button" class="btn btn-secondary btn-sm" id="ai-reset-prompt-btn" style="padding:2px 8px; font-size:11px;">
                  ↺ Reset Prompt
                </button>
              </div>
              <p style="font-size:11px; color:var(--text-tertiary); margin-bottom:8px;">
                Customize the prompt instructions. Use <code>{CATEGORIES}</code> where current category options will be injected. SKU is instructed to only be filled when a barcode is present.
              </p>
              <textarea id="ai-prompt-input" rows="8" style="width:100%; font-family:monospace; font-size:11.5px; line-height:1.45; resize:vertical; background:var(--bg-primary); border:1px solid var(--border-secondary); border-radius:6px; padding:10px; color:var(--text-primary);">${escapeHtml(aiSettings.systemPrompt || DEFAULT_SYSTEM_PROMPT)}</textarea>
            </div>

            <!-- Static JSON Schema Viewer -->
            <div style="background:var(--bg-primary); border:1px solid var(--border-primary); border-radius:8px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:var(--font-size-xs); font-weight:600; color:var(--text-primary);">
                  📋 Static JSON Output Schema
                </span>
                <span style="font-size:10px; color:var(--text-tertiary); font-family:monospace;">application/json</span>
              </div>
              <p style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">
                The vision models strictly output this static JSON schema to populate SimVentory component records:
              </p>
              <pre style="font-size:11px; font-family:monospace; color:var(--accent-primary-hover); margin:0; overflow-x:auto; background:rgba(0,0,0,0.3); padding:10px; border-radius:6px; border:1px solid var(--border-primary);">${escapeHtml(JSON.stringify(STATIC_JSON_SCHEMA, null, 2))}</pre>
            </div>

            <!-- Actions: Test & Save -->
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
              <button type="button" class="btn btn-secondary btn-sm" id="ai-test-btn" style="display:inline-flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Test Connection
              </button>
              <button type="submit" class="btn btn-primary btn-sm" id="ai-save-btn" style="display:inline-flex; align-items:center; gap:6px; background:linear-gradient(135deg, #6366f1, #a855f7);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save AI Settings
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Appearance -->
      <div class="settings-section">
        <h3>🎨 Appearance</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Theme</h4>
            <p>Switch between dark and light mode</p>
          </div>
          <select id="settings-theme" class="toolbar-btn" style="width: auto; min-width: 120px;">
            <option value="dark" ${document.documentElement.dataset.theme !== 'light' ? 'selected' : ''}>🌙 Dark</option>
            <option value="light" ${document.documentElement.dataset.theme === 'light' ? 'selected' : ''}>☀️ Light</option>
          </select>
        </div>
      </div>

      <!-- Data Management -->
      <div class="settings-section">
        <h3>💾 Data Management</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Export as JSON</h4>
            <p>Full backup including component images, custom categories, and locations — ${items.length} item${items.length !== 1 ? 's' : ''}</p>
          </div>
          <button class="btn btn-primary btn-sm" id="export-json-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export JSON
          </button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Export as CSV</h4>
            <p>Spreadsheet-friendly format (components list with stock, SKU, and locations)</p>
          </div>
          <button class="btn btn-primary btn-sm" id="export-csv-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
        </div>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Import from JSON</h4>
            <p>Restore a previous backup (preserves custom categories & images)</p>
          </div>
          <div>
            <input type="file" id="import-file-input" accept=".json" hidden />
            <button class="btn btn-secondary btn-sm" id="import-json-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import JSON
            </button>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="settings-section">
        <h3>⚠️ Danger Zone</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>Clear All Components</h4>
            <p>Delete all component inventory records and photos. Categories and locations will be retained.</p>
          </div>
          <button class="btn btn-danger btn-sm" id="clear-all-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear Components
          </button>
        </div>
      </div>

      <!-- About -->
      <div class="settings-section">
        <h3>ℹ️ About</h3>
        <div class="settings-row">
          <div class="settings-row-info">
            <h4>SimVentory</h4>
            <p>Electronics & DIY Inventory Manager — Dockerized for Raspberry Pi 4 & PC.</p>
          </div>
        </div>
      </div>

      <!-- Edit Category Modal Dialog -->
      <div id="edit-cat-modal" class="modal-overlay" style="display:none;">
        <div class="modal-content" style="max-width: 440px; border-radius: var(--border-radius-lg); overflow: hidden;">
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-primary);">
            <h2 class="modal-title" style="font-size: var(--font-size-md); font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>✏️</span> Edit Category
            </h2>
            <button type="button" class="modal-close" id="edit-cat-close-btn" style="background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 18px;">✕</button>
          </div>
          <form id="edit-category-form">
            <div class="modal-body" style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
              <input type="hidden" id="edit-cat-old-name" />
              <div>
                <label class="form-label" style="font-size: var(--font-size-xs);">Category Name *</label>
                <input type="text" id="edit-cat-name" required style="width: 100%;" />
                <span style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px; display: block;">Renaming will automatically update all items using this category.</span>
              </div>
              <div style="display: flex; gap: 12px; align-items: flex-end;">
                <div style="width: 80px;">
                  <label class="form-label" style="font-size: var(--font-size-xs);">Icon</label>
                  <input type="text" id="edit-cat-icon" maxlength="4" style="width: 100%; text-align: center; font-size: 1.2rem;" />
                </div>
                <div style="width: 70px;">
                  <label class="form-label" style="font-size: var(--font-size-xs);">Color</label>
                  <input type="color" id="edit-cat-color" style="width: 100%; height: 40px; border-radius: 6px; cursor: pointer; padding: 2px;" />
                </div>
              </div>
              <!-- Emoji quick presets -->
              <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                <span style="font-size: 11px; color: var(--text-tertiary);">Quick Icons:</span>
                ${EMOJI_PRESETS.map(e => `
                  <button type="button" class="btn-edit-preset-emoji" data-emoji="${e}" style="background: var(--bg-card); border: 1px solid var(--border-secondary); border-radius: 4px; padding: 2px 6px; font-size: 13px; cursor: pointer;">${e}</button>
                `).join('')}
              </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary);">
              <button type="button" class="btn btn-secondary" id="edit-cat-cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Edit Storage Location Modal Dialog -->
      <div id="edit-loc-modal" class="modal-overlay" style="display:none;">
        <div class="modal-content" style="max-width: 440px; border-radius: var(--border-radius-lg); overflow: hidden;">
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-primary);">
            <h2 class="modal-title" style="font-size: var(--font-size-md); font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>✏️</span> Edit Storage Location
            </h2>
            <button type="button" class="modal-close" id="edit-loc-close-btn" style="background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 18px;">✕</button>
          </div>
          <form id="edit-location-form">
            <div class="modal-body" style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
              <input type="hidden" id="edit-loc-old-name" />
              <div>
                <label class="form-label" style="font-size: var(--font-size-xs);">Location Name *</label>
                <input type="text" id="edit-loc-name" required style="width: 100%;" />
                <span style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px; display: block;">Renaming will automatically update all components in this location.</span>
              </div>
              <div>
                <label class="form-label" style="font-size: var(--font-size-xs);">Description / Notes</label>
                <input type="text" id="edit-loc-desc" placeholder="e.g., Top drawer, ESD protective container" style="width: 100%;" />
              </div>
              <div style="display: flex; gap: 12px; align-items: flex-end;">
                <div style="width: 70px;">
                  <label class="form-label" style="font-size: var(--font-size-xs);">Color</label>
                  <input type="color" id="edit-loc-color" style="width: 100%; height: 40px; border-radius: 6px; cursor: pointer; padding: 2px;" />
                </div>
                <div style="flex: 1;">
                  <span style="font-size: 11px; color: var(--text-tertiary); display: block; margin-bottom: 4px;">Quick Colors:</span>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${LOCATION_COLOR_PRESETS.map(c => `
                      <button type="button" class="btn-edit-preset-loc-color" data-color="${c}" style="width: 20px; height: 20px; border-radius: 50%; background: ${c}; border: 2px solid var(--border-secondary); cursor: pointer; padding: 0;"></button>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-primary); background: var(--bg-secondary);">
              <button type="button" class="btn btn-secondary" id="edit-loc-cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  // ---- Add Category Form Handler ----
  const addCatForm = document.getElementById('add-category-form');
  if (addCatForm) {
    addCatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-cat-name').value.trim();
      const icon = document.getElementById('new-cat-icon').value.trim() || '📦';
      const color = document.getElementById('new-cat-color').value;

      if (!name) {
        showToast('Category name is required', 'warning');
        return;
      }

      try {
        await saveCategory({ name, icon, color });
        showToast(`Category "${name}" created!`, 'success');
        refreshView();
      } catch (err) {
        showToast('Failed to add category: ' + err.message, 'error');
      }
    });
  }

  // Preset Emoji buttons
  container.querySelectorAll('.btn-preset-emoji').forEach(btn => {
    btn.addEventListener('click', () => {
      const iconInput = document.getElementById('new-cat-icon');
      if (iconInput) iconInput.value = btn.dataset.emoji;
    });
  });

  // Edit Category handlers
  const editCatModal = document.getElementById('edit-cat-modal');
  const closeEditCatModal = () => { if (editCatModal) editCatModal.style.display = 'none'; };
  document.getElementById('edit-cat-close-btn')?.addEventListener('click', closeEditCatModal);
  document.getElementById('edit-cat-cancel-btn')?.addEventListener('click', closeEditCatModal);
  editCatModal?.addEventListener('click', (e) => { if (e.target === editCatModal) closeEditCatModal(); });

  container.querySelectorAll('.btn-edit-preset-emoji').forEach(btn => {
    btn.addEventListener('click', () => {
      const iconInput = document.getElementById('edit-cat-icon');
      if (iconInput) iconInput.value = btn.dataset.emoji;
    });
  });

  container.querySelectorAll('.btn-edit-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const icon = btn.dataset.icon;
      const color = btn.dataset.color;
      document.getElementById('edit-cat-old-name').value = name;
      document.getElementById('edit-cat-name').value = name;
      document.getElementById('edit-cat-icon').value = icon;
      document.getElementById('edit-cat-color').value = color;
      if (editCatModal) editCatModal.style.display = 'flex';
      setTimeout(() => document.getElementById('edit-cat-name')?.focus(), 50);
    });
  });

  document.getElementById('edit-category-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldName = document.getElementById('edit-cat-old-name').value;
    const newName = document.getElementById('edit-cat-name').value.trim();
    const icon = document.getElementById('edit-cat-icon').value.trim() || '📦';
    const color = document.getElementById('edit-cat-color').value;

    if (!newName) {
      showToast('Category name is required', 'warning');
      return;
    }

    try {
      await saveCategory({ name: newName, icon, color }, oldName);
      closeEditCatModal();
      showToast(`Category "${newName}" updated!`, 'success');
      refreshView();
    } catch (err) {
      showToast('Failed to update category: ' + err.message, 'error');
    }
  });

  // Delete Category handlers
  container.querySelectorAll('.btn-delete-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!confirm(`Are you sure you want to delete the "${name}" category? Items with this category will remain.`)) {
        return;
      }
      try {
        await deleteCategory(name);
        showToast(`Category "${name}" deleted`, 'info');
        refreshView();
      } catch (err) {
        showToast('Failed to delete category: ' + err.message, 'error');
      }
    });
  });

  // ---- Add Location Form Handler ----
  const addLocForm = document.getElementById('add-location-form');
  if (addLocForm) {
    container.querySelectorAll('.btn-preset-loc-color').forEach(btn => {
      btn.addEventListener('click', () => {
        const colorInput = document.getElementById('new-loc-color');
        if (colorInput) colorInput.value = btn.dataset.color;
      });
    });

    addLocForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-loc-name').value.trim();
      const description = document.getElementById('new-loc-desc').value.trim();
      const color = document.getElementById('new-loc-color')?.value || '#6366f1';

      if (!name) {
        showToast('Location name is required', 'warning');
        return;
      }

      try {
        await saveLocation({ name, description, color });
        showToast(`Storage location "${name}" created!`, 'success');
        refreshView();
      } catch (err) {
        showToast('Failed to add location: ' + err.message, 'error');
      }
    });
  }

  // Edit Location handlers
  const editLocModal = document.getElementById('edit-loc-modal');
  const closeEditLocModal = () => { if (editLocModal) editLocModal.style.display = 'none'; };
  document.getElementById('edit-loc-close-btn')?.addEventListener('click', closeEditLocModal);
  document.getElementById('edit-loc-cancel-btn')?.addEventListener('click', closeEditLocModal);
  editLocModal?.addEventListener('click', (e) => { if (e.target === editLocModal) closeEditLocModal(); });

  container.querySelectorAll('.btn-edit-preset-loc-color').forEach(btn => {
    btn.addEventListener('click', () => {
      const colorInput = document.getElementById('edit-loc-color');
      if (colorInput) colorInput.value = btn.dataset.color;
    });
  });

  container.querySelectorAll('.btn-edit-loc').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const desc = btn.dataset.desc;
      const color = btn.dataset.color || '#6366f1';
      document.getElementById('edit-loc-old-name').value = name;
      document.getElementById('edit-loc-name').value = name;
      document.getElementById('edit-loc-desc').value = desc;
      document.getElementById('edit-loc-color').value = color;
      if (editLocModal) editLocModal.style.display = 'flex';
      setTimeout(() => document.getElementById('edit-loc-name')?.focus(), 50);
    });
  });

  document.getElementById('edit-location-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldName = document.getElementById('edit-loc-old-name').value;
    const newName = document.getElementById('edit-loc-name').value.trim();
    const description = document.getElementById('edit-loc-desc').value.trim();
    const color = document.getElementById('edit-loc-color').value;

    if (!newName) {
      showToast('Location name is required', 'warning');
      return;
    }

    try {
      await saveLocation({ name: newName, description, color }, oldName);
      closeEditLocModal();
      showToast(`Storage location "${newName}" updated!`, 'success');
      refreshView();
    } catch (err) {
      showToast('Failed to update location: ' + err.message, 'error');
    }
  });

  // Delete Location handlers
  container.querySelectorAll('.btn-delete-loc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!confirm(`Remove storage location "${name}"? Components using this location will keep their text.`)) {
        return;
      }
      try {
        await deleteLocation(name);
        showToast(`Location "${name}" removed`, 'info');
        refreshView();
      } catch (err) {
        showToast('Failed to delete location: ' + err.message, 'error');
      }
    });
  });

  // Theme toggle
  document.getElementById('settings-theme').addEventListener('change', (e) => {
    const theme = e.target.value;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cv_theme', theme);
    const label = document.querySelector('.theme-label');
    if (label) label.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
  });

  // ---- AI Settings Event Handlers ----
  const aiToggle = document.getElementById('ai-enabled-toggle');
  const aiTrack = document.getElementById('ai-toggle-track');
  const aiThumb = document.getElementById('ai-toggle-thumb');

  if (aiToggle && aiTrack && aiThumb) {
    aiToggle.addEventListener('change', () => {
      const isEnabled = aiToggle.checked;
      aiTrack.style.backgroundColor = isEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)';
      aiThumb.style.left = isEnabled ? '24px' : '3px';
      saveAISettings({ enabled: isEnabled });
      showToast(isEnabled ? 'AI features enabled' : 'AI features disabled', 'info');
    });
  }

  // Provider change
  const providerSelect = document.getElementById('ai-provider-select');
  const endpointInput = document.getElementById('ai-endpoint-input');
  const apiKeyInput = document.getElementById('ai-apikey-input');
  const modelInput = document.getElementById('ai-model-input');
  const providerHint = document.getElementById('ai-provider-hint');
  const keyHint = document.getElementById('ai-key-hint');
  const suggestedModelsContainer = document.getElementById('ai-suggested-models');
  const proxyCheck = document.getElementById('ai-server-proxy-check');

  function bindModelChipListeners() {
    container.querySelectorAll('.btn-preset-model').forEach(btn => {
      btn.addEventListener('click', () => {
        if (modelInput) modelInput.value = btn.dataset.model;
      });
    });
  }
  bindModelChipListeners();

  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      const selectedId = providerSelect.value;
      const preset = PROVIDER_PRESETS[selectedId] || PROVIDER_PRESETS.custom;

      if (preset.endpoint) endpointInput.value = preset.endpoint;
      if (preset.defaultModel) modelInput.value = preset.defaultModel;
      if (preset.placeholderKey) apiKeyInput.placeholder = preset.placeholderKey;

      if (providerHint) providerHint.textContent = preset.hint;
      if (keyHint) keyHint.textContent = preset.requiresKey ? 'Required' : 'Optional / Not needed';

      // Set server proxy recommended for local Ollama
      if (selectedId === 'local' && proxyCheck) {
        proxyCheck.checked = true;
      }

      if (suggestedModelsContainer) {
        suggestedModelsContainer.innerHTML = `
          <span style="font-size:11px; color:var(--text-tertiary);">Quick select:</span>
          ${(preset.suggestedModels || []).map(m => `
            <button type="button" class="btn-preset-model" data-model="${escapeAttr(m)}" style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:4px; padding:2px 8px; font-size:11px; font-family:monospace; cursor:pointer; color:var(--text-secondary);">${escapeHtml(m)}</button>
          `).join('')}
        `;
        bindModelChipListeners();
      }
    });
  }

  // Primary Model Rate Limit Input
  const primaryRpmInput = document.getElementById('ai-primary-rpm-input');

  // Backup Model References & Listeners
  const backupToggle = document.getElementById('ai-backup-enabled-toggle');
  const backupTrack = document.getElementById('ai-backup-track');
  const backupThumb = document.getElementById('ai-backup-thumb');
  const backupFieldsContainer = document.getElementById('ai-backup-fields-container');
  const backupProviderSelect = document.getElementById('ai-backup-provider-select');
  const backupModelInput = document.getElementById('ai-backup-model-input');
  const backupEndpointInput = document.getElementById('ai-backup-endpoint-input');
  const backupApiKeyInput = document.getElementById('ai-backup-apikey-input');
  const backupProxyCheck = document.getElementById('ai-backup-proxy-check');
  const backupSuggestedContainer = document.getElementById('ai-backup-suggested-models');
  const testBackupBtn = document.getElementById('ai-test-backup-btn');

  function bindBackupModelChips() {
    container.querySelectorAll('.btn-preset-backup-model').forEach(btn => {
      btn.addEventListener('click', () => {
        if (backupModelInput) backupModelInput.value = btn.dataset.model;
      });
    });
  }
  bindBackupModelChips();

  if (backupToggle && backupTrack && backupThumb && backupFieldsContainer) {
    backupToggle.addEventListener('change', () => {
      const isBackupOn = backupToggle.checked;
      backupTrack.style.backgroundColor = isBackupOn ? 'var(--accent-primary)' : 'var(--bg-tertiary)';
      backupThumb.style.left = isBackupOn ? '22px' : '2px';
      backupFieldsContainer.style.display = isBackupOn ? 'flex' : 'none';
    });
  }

  if (backupProviderSelect) {
    backupProviderSelect.addEventListener('change', () => {
      const selectedId = backupProviderSelect.value;
      const preset = PROVIDER_PRESETS[selectedId] || PROVIDER_PRESETS.custom;

      if (preset.endpoint && backupEndpointInput) backupEndpointInput.value = preset.endpoint;
      if (preset.defaultModel && backupModelInput) backupModelInput.value = preset.defaultModel;

      if (backupSuggestedContainer) {
        backupSuggestedContainer.innerHTML = `
          <span style="font-size:11px; color:var(--text-tertiary);">Quick select:</span>
          ${(preset.suggestedModels || []).map(m => `
            <button type="button" class="btn-preset-backup-model" data-model="${escapeAttr(m)}" style="background:var(--bg-card); border:1px solid var(--border-secondary); border-radius:4px; padding:2px 8px; font-size:11px; font-family:monospace; cursor:pointer; color:var(--text-secondary);">${escapeHtml(m)}</button>
          `).join('')}
        `;
        bindBackupModelChips();
      }
    });
  }

  // Test Backup Model Connection
  if (testBackupBtn) {
    testBackupBtn.addEventListener('click', async () => {
      const backupProvider = backupProviderSelect ? backupProviderSelect.value : 'gemini';
      const backupConfig = {
        enabled: true,
        provider: backupProvider,
        endpoint: backupEndpointInput ? backupEndpointInput.value.trim() : '',
        apiKey: (backupApiKeyInput && backupApiKeyInput.value.trim()) ? backupApiKeyInput.value.trim() : apiKeyInput.value.trim(),
        model: backupModelInput ? backupModelInput.value.trim() : 'gemini-1.5-flash',
        useServerProxy: backupProxyCheck ? backupProxyCheck.checked : false,
      };

      testBackupBtn.disabled = true;
      testBackupBtn.innerHTML = `
        <svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Testing Backup...
      `;

      try {
        const result = await testAIConnection(backupConfig);
        showToast('🛡️ Backup model: ' + result.message, 'success');
      } catch (err) {
        console.error('Backup test error:', err);
        showToast('Backup model failed: ' + err.message, 'error');
      } finally {
        testBackupBtn.disabled = false;
        testBackupBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Test Backup Model
        `;
      }
    });
  }

  // API Key Visibility Toggle
  const toggleKeyBtn = document.getElementById('btn-toggle-apikey-visibility');
  if (toggleKeyBtn && apiKeyInput) {
    toggleKeyBtn.addEventListener('click', () => {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleKeyBtn.textContent = '🔒';
      } else {
        apiKeyInput.type = 'password';
        toggleKeyBtn.textContent = '👁️';
      }
    });
  }

  // Test Primary Connection
  const testBtn = document.getElementById('ai-test-btn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const config = {
        enabled: aiToggle ? aiToggle.checked : true,
        provider: providerSelect.value,
        endpoint: endpointInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
        useServerProxy: proxyCheck ? proxyCheck.checked : false,
      };

      testBtn.disabled = true;
      testBtn.innerHTML = `
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Testing...
      `;

      try {
        const result = await testAIConnection(config);
        showToast(result.message, 'success');
      } catch (err) {
        console.error('AI Test error:', err);
        showToast('Connection failed: ' + err.message, 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Test Connection
        `;
      }
    });
  }

  // Reset Prompt Button
  const resetPromptBtn = document.getElementById('ai-reset-prompt-btn');
  const promptTextarea = document.getElementById('ai-prompt-input');
  if (resetPromptBtn && promptTextarea) {
    resetPromptBtn.addEventListener('click', () => {
      promptTextarea.value = DEFAULT_SYSTEM_PROMPT;
      showToast('Prompt reset to default template', 'info');
    });
  }

  // Save AI Settings Form
  const aiForm = document.getElementById('ai-settings-form');
  if (aiForm) {
    aiForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const config = {
        enabled: aiToggle ? aiToggle.checked : true,
        provider: providerSelect.value,
        endpoint: endpointInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
        useServerProxy: proxyCheck ? proxyCheck.checked : false,
        primaryRpmLimit: primaryRpmInput ? parseInt(primaryRpmInput.value, 10) || 0 : 5,
        webSearchGrounding: document.getElementById('ai-web-search-check') ? document.getElementById('ai-web-search-check').checked : true,
        backupEnabled: backupToggle ? backupToggle.checked : true,
        backupProvider: backupProviderSelect ? backupProviderSelect.value : 'gemini',
        backupEndpoint: backupEndpointInput ? backupEndpointInput.value.trim() : '',
        backupApiKey: backupApiKeyInput ? backupApiKeyInput.value.trim() : '',
        backupModel: backupModelInput ? backupModelInput.value.trim() : 'gemini-1.5-flash',
        backupUseServerProxy: backupProxyCheck ? backupProxyCheck.checked : false,
        systemPrompt: promptTextarea ? promptTextarea.value.trim() : DEFAULT_SYSTEM_PROMPT,
      };

      await saveAISettings(config);
      showToast('AI Settings & Grounding preferences saved successfully!', 'success');
    });
  }

  // Export JSON
  document.getElementById('export-json-btn').addEventListener('click', async () => {
    try {
      showToast('Preparing export...', 'info');
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadFile(blob, `simventory-backup-${formatDateFile()}.json`);
      showToast('Backup exported!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  });

  // Export CSV
  document.getElementById('export-csv-btn').addEventListener('click', async () => {
    try {
      const csv = await exportCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      downloadFile(blob, `simventory-${formatDateFile()}.csv`);
      showToast('CSV exported!', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  });

  // Import JSON
  const importInput = document.getElementById('import-file-input');
  document.getElementById('import-json-btn').addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;

    if (!confirm('This will replace current inventory items with the backup. Continue?')) {
      importInput.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
      showToast(`Imported ${data.items ? data.items.length : 0} items!`, 'success');
      refreshView();
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
    importInput.value = '';
  });

  // Clear all inventory
  document.getElementById('clear-all-btn').addEventListener('click', async () => {
    if (!confirm('Are you ABSOLUTELY sure? This will delete ALL components, photos, and usage history.')) {
      return;
    }
    try {
      await clearAllData();
      showToast('All inventory items cleared', 'info');
      refreshView();
    } catch (err) {
      showToast('Failed to clear data: ' + err.message, 'error');
    }
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

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDateFile() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
