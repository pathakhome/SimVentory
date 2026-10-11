/**
 * AI Service for SimVentory
 * Supports OpenRouter, Google Gemini, OpenAI, and Local LLMs (Ollama / LM Studio / vLLM).
 * Provides multi-provider vision component recognition, connection testing,
 * and intelligent electronics part extraction.
 */

const STORAGE_KEY = 'simventory_ai_settings';

export const PROVIDER_PRESETS = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (Multi-model & Free tiers)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'google/gemini-2.0-flash-001',
    suggestedModels: [
      'google/gemini-3.1-flash-lite',
      'google/gemini-3.5-flash-lite',
      'google/gemma-4',
      'google/gemini-2.5-flash',
      'google/gemini-2.0-flash-001',
      'google/gemini-flash-1.5',
      'meta-llama/llama-3.2-11b-vision-instruct',
      'qwen/qwen-2.5-vl-72b-instruct:free',
      'openai/gpt-4o-mini',
    ],
    placeholderKey: 'sk-or-v1-...',
    requiresKey: true,
    hint: 'Unified gateway for Gemini, Llama 3.2 Vision, Qwen VL & GPT-4o-mini.',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini (Native Google AI Studio)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-3.1-flash-lite',
    suggestedModels: [
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemma-4',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ],
    placeholderKey: 'AIzaSy...',
    requiresKey: true,
    hint: 'Direct Google AI Studio API. High speed with generous free tier.',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (Official)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: [
      'gpt-4o-mini',
      'gpt-4o',
    ],
    placeholderKey: 'sk-proj-...',
    requiresKey: true,
    hint: 'Official OpenAI Vision API.',
  },
  local: {
    id: 'local',
    name: 'Local LLM / Ollama (100% Private & Offline)',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3.2-vision:latest',
    suggestedModels: [
      'gemma-4',
      'llama3.2-vision:latest',
      'minicpm-v:latest',
      'llava:latest',
    ],
    placeholderKey: 'Not required for local Ollama',
    requiresKey: false,
    hint: 'Runs completely on your local computer or homelab without internet.',
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint (OpenAI Compatible)',
    endpoint: '',
    defaultModel: '',
    suggestedModels: [],
    placeholderKey: 'Enter API key if required',
    requiresKey: false,
    hint: 'Connect to any OpenAI-compatible server (vLLM, LocalAI, Azure, LiteLLM).',
  },
};

export const DEFAULT_SYSTEM_PROMPT = `You are an expert electronics and hardware inventory component recognition assistant.
Analyze the user's photo of an electronic component, IC, PCB, module, passive part, sensor, connector, or hardware item.
Examine surface markings, laser etchings, silkscreen, pinout, and package styles closely.

Available categories in SimVentory: [{CATEGORIES}].
Choose the closest matching category from that list.

CRITICAL INSTRUCTIONS FOR PART NUMBER / SKU:
- Only extract and populate "partNumber" if an actual physical BARCODE, 2D Data Matrix, QR code, or printed Barcode/UPC/EAN/SKU label is clearly visible in the image.
- If NO barcode or barcode number is present in the image, you MUST return an empty string ("") for "partNumber".
- Do NOT put IC markings (like NE555, ESP32, STM32, etc.) into "partNumber" unless they are accompanying a scannable barcode label. Put IC markings, package codes, and component titles in "name" and "description" instead.

Respond ONLY with a valid, raw JSON object (no explanations, no markdown formatting outside JSON).
Required JSON schema:
{
  "name": "Concise, descriptive component name (e.g., 'NE555 Precision Timer IC' or 'ESP32-WROOM-32D Development Board')",
  "partNumber": "ONLY populate if a physical barcode, 2D matrix, QR code, or printed barcode SKU is visible in the photo. Otherwise return empty string ''",
  "category": "One category selected from the available categories list above",
  "description": "Technical summary describing functionality, package type (e.g. DIP-8, SOP-8, SMD 0805, TO-220), pin pitch, operating voltages, or key features",
  "tags": ["array", "of", "4-8", "searchable", "tags", "e.g.", "timer", "analog", "DIP-8", "5V-15V"],
  "supplierInfo": "Primary manufacturer or distributor (e.g., Texas Instruments, Espressif, STMicroelectronics, Adafruit, SparkFun, Generic)",
  "datasheetUrl": "Direct official datasheet URL if known with high confidence, otherwise empty string",
  "notes": "Brief technical notes, pinout summary, absolute maximum ratings, operating voltage, or pin 1 orientation"
}`;

export const STATIC_JSON_SCHEMA = {
  name: "string (Concise title e.g. 'NE555 Timer IC')",
  partNumber: "string (SKU/Barcode number — ONLY populated if a barcode/QR code is found, otherwise '')",
  category: "string (One matching category from vault)",
  description: "string (Technical summary, package, voltage ratings)",
  tags: "string[] (Searchable keywords e.g. ['timer', 'DIP-8', '5V-15V'])",
  supplierInfo: "string (Manufacturer or distributor)",
  datasheetUrl: "string (Manufacturer datasheet link or '')",
  notes: "string (Technical pinout details & operating limits)",
};

export const DEFAULT_AI_SETTINGS = {
  enabled: true,
  provider: 'openrouter',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: '',
  model: 'google/gemini-2.0-flash-001',
  useServerProxy: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

/**
 * Retrieve saved AI settings from localStorage with fallback to defaults.
 */
export function getAISettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_AI_SETTINGS, ...parsed };
  } catch (_) {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

/**
 * Fetch settings from the central server (/api/settings) and hydrate localStorage.
 * If server has no settings yet but this client already has customized settings,
 * it auto-seeds the server database so all other devices immediately benefit.
 * @returns {Promise<Object>}
 */
export async function fetchAISettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data && data.ai && typeof data.ai === 'object' && Object.keys(data.ai).length > 0) {
        const serverMerged = { ...DEFAULT_AI_SETTINGS, ...data.ai };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverMerged));
        return serverMerged;
      } else {
        // Server has no AI settings yet. If local has customized settings, sync them up!
        const local = getAISettings();
        if (local && (local.apiKey || local.model !== DEFAULT_AI_SETTINGS.model || local.provider !== DEFAULT_AI_SETTINGS.provider)) {
          saveAISettings(local).catch(() => {});
        }
      }
    }
  } catch (err) {
    // Server unreachable / offline — fallback to localStorage
  }
  return getAISettings();
}

/**
 * Save AI settings to localStorage and persist to central server database.
 * @param {Object} settings
 * @returns {Promise<Object>}
 */
export async function saveAISettings(settings) {
  const merged = { ...getAISettings(), ...settings };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (_) {}

  // Sync to backend database on Raspberry Pi / central host
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai: merged }),
    });
  } catch (err) {
    console.warn('[AI Service] Failed to sync settings to server:', err.message);
  }

  return merged;
}

/**
 * Helper to convert Blob or File to Base64 data URL
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Dispatch an HTTP request either directly or through the server proxy
 */
async function dispatchRequest({ url, method = 'POST', headers = {}, body, useServerProxy = false }) {
  const sendDirect = async () => {
    const res = await fetch(url, {
      method,
      headers,
      body: typeof body === 'object' ? JSON.stringify(body) : body,
    });
    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.error?.message || errJson.error || JSON.stringify(errJson);
      } catch {
        errText = await res.text() || res.statusText;
      }
      throw new Error(`API error (${res.status}): ${errText}`);
    }
    return await res.json();
  };

  const sendProxy = async () => {
    const res = await fetch('/api/ai/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, headers, body }),
    });
    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.error?.message || errJson.error || JSON.stringify(errJson);
      } catch {
        errText = await res.text() || res.statusText;
      }
      throw new Error(`Proxy error (${res.status}): ${errText}`);
    }
    return await res.json();
  };

  if (useServerProxy) {
    try {
      return await sendProxy();
    } catch (proxyErr) {
      // If server proxy is unreachable (e.g. static dev server or offline), attempt direct fallback
      return await sendDirect();
    }
  }

  try {
    return await sendDirect();
  } catch (directErr) {
    // If browser CORS error occurred (common for local Ollama), attempt automatic server proxy retry
    if (directErr.message?.includes('Failed to fetch') || directErr.name === 'TypeError') {
      try {
        return await sendProxy();
      } catch (_) {}
    }
    throw directErr;
  }
}

/**
 * Test AI endpoint and model connection.
 */
export async function testAIConnection(customSettings = null) {
  const settings = customSettings || getAISettings();
  const { provider, endpoint, apiKey, model, useServerProxy } = settings;

  if (!endpoint && provider !== 'gemini') {
    throw new Error('API endpoint URL is required');
  }
  if (!model) {
    throw new Error('Model name is required');
  }
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  if (preset.requiresKey && !apiKey) {
    throw new Error(`API Key is required for ${preset.name}`);
  }

  // 1. Google Gemini Native
  if (provider === 'gemini') {
    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    const url = `${cleanEndpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents: [
        {
          parts: [{ text: 'Respond with exactly: {"status":"ok","connected":true}' }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 50,
      },
    };

    const data = await dispatchRequest({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      useServerProxy,
    });

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      success: true,
      message: `Gemini connected! Response: ${reply.trim().slice(0, 100)}`,
    };
  }

  // 2. OpenAI / OpenRouter / Ollama / Custom
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'SimVentory';
  }

  const payload = {
    model,
    messages: [
      { role: 'user', content: 'Respond with: {"status":"ok","connected":true}' },
    ],
    max_tokens: 30,
    temperature: 0.1,
  };

  const data = await dispatchRequest({
    url: endpoint,
    method: 'POST',
    headers,
    body: payload,
    useServerProxy,
  });

  const reply = data.choices?.[0]?.message?.content || JSON.stringify(data);
  return {
    success: true,
    message: `Connected successfully to ${model}! Response: ${reply.trim().slice(0, 100)}`,
  };
}

/**
 * Extract electronics component details from an image.
 * @param {Object} options
 * @param {Blob|File|string} options.image - Component photo blob or base64 data URL
 * @param {Array<string>} [options.categories] - List of current category names
 * @param {Object} [options.existingItem] - Existing item data if editing
 * @returns {Promise<Object>} Extracted item details
 */
export async function analyzeComponentImage({ image, categories = [], existingItem = null }) {
  await fetchAISettings().catch(() => {});
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('AI recognition is disabled in Settings.');
  }

  const { provider, endpoint, apiKey, model, useServerProxy } = settings;
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;

  if (preset.requiresKey && !apiKey) {
    throw new Error(`API Key for ${preset.name} is missing. Please configure it in Settings.`);
  }

  // Convert image to base64 (supports Blob, data URL, blob: URL, or fetchable image URL)
  let base64Full = '';
  if (image instanceof Blob) {
    base64Full = await blobToBase64(image);
  } else if (typeof image === 'string') {
    if (image.startsWith('data:')) {
      base64Full = image;
    } else {
      // It's a blob: or http: or /api/ URL — fetch it into a blob first
      const res = await fetch(image);
      const fetchedBlob = await res.blob();
      base64Full = await blobToBase64(fetchedBlob);
    }
  } else {
    throw new Error('Unsupported image format provided for AI recognition.');
  }

  // Split data URL into mimeType and raw base64 data
  const matches = base64Full.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = matches ? matches[1] : 'image/jpeg';
  const base64Data = matches ? matches[2] : base64Full;

  const categoryListStr = categories.length > 0 ? categories.join(', ') : 'Sensors, ICs, Resistors, Capacitors, LEDs, Connectors, Switches, Motors, Modules, Other';

  const promptTemplate = (settings.systemPrompt && settings.systemPrompt.trim()) ? settings.systemPrompt : DEFAULT_SYSTEM_PROMPT;
  const systemInstructions = promptTemplate.includes('{CATEGORIES}')
    ? promptTemplate.replace('{CATEGORIES}', categoryListStr)
    : `${promptTemplate}\n\nAvailable categories in SimVentory: [${categoryListStr}]. Choose the closest matching category.`;

  let rawResponseText = '';

  // 1. Google Gemini Native
  if (provider === 'gemini') {
    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    const url = `${cleanEndpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents: [
        {
          parts: [
            { text: systemInstructions },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: 'application/json',
      },
    };

    const data = await dispatchRequest({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      useServerProxy,
    });

    rawResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    // 2. OpenAI / OpenRouter / Ollama / Custom
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'SimVentory';
    }

    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: systemInstructions,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please identify this electronic component and output the requested JSON object.',
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Full,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    };

    const data = await dispatchRequest({
      url: endpoint,
      method: 'POST',
      headers,
      body: payload,
      useServerProxy,
    });

    rawResponseText = data.choices?.[0]?.message?.content || '';
  }

  // Parse and sanitize JSON
  const parsed = parseAIResponseJSON(rawResponseText);

  // Validate and structure fields
  return {
    name: (parsed.name || '').trim(),
    partNumber: (parsed.partNumber || '').trim(),
    category: matchCategory(parsed.category, categories),
    description: (parsed.description || '').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(t => String(t).trim()).filter(Boolean) : [],
    supplierInfo: (parsed.supplierInfo || '').trim(),
    datasheetUrl: (parsed.datasheetUrl || '').trim(),
    notes: (parsed.notes || '').trim(),
    modelUsed: model,
    providerUsed: provider,
  };
}

/**
 * Safely parse JSON from LLM output (removes markdown backticks if present)
 */
function parseAIResponseJSON(text) {
  if (!text) throw new Error('AI returned an empty response.');

  let clean = text.trim();

  // Strip markdown code fences ```json ... ```
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // If there's surrounding chatter, find first { and last }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(clean);
  } catch (err) {
    console.error('Failed to parse AI JSON:', clean);
    throw new Error('AI response was not valid JSON: ' + err.message);
  }
}

/**
 * Match detected category against active category list (case-insensitive)
 */
function matchCategory(detected, activeCategories = []) {
  if (!detected || activeCategories.length === 0) return 'Other';
  const cleanDetected = detected.trim().toLowerCase();
  const matched = activeCategories.find(c => c.toLowerCase() === cleanDetected);
  return matched || 'Other';
}
