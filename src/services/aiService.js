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

Available conditions in SimVentory: ['Unpacked New', 'Unpacked Used', 'Partially Working', 'Packed', 'Damaged'].
Evaluate visual physical condition:
- 'Packed': In manufacturer packaging, sealed anti-static bag, tape reel, or blister pack.
- 'Unpacked New': Loose/unpacked but pristine, untinned/unsoldered clean pins.
- 'Unpacked Used': Shows signs of workbench use, soldering, breadboard insertion, or wear.
- 'Partially Working': Incomplete, missing pins/antenna, or marked as questionable.
- 'Damaged': Visibly cracked, burned, corroded, or broken.
Default to 'Unpacked New' if clean and unpackaged.

CRITICAL INSTRUCTIONS FOR PART NUMBER / SKU:
- Only extract and populate "partNumber" if an actual physical BARCODE, 2D Data Matrix, QR code, or printed Barcode/UPC/EAN/SKU label is clearly visible in the image.
- If NO barcode or barcode number is present in the image, you MUST return an empty string ("") for "partNumber".
- Do NOT put IC markings (like NE555, ESP32, STM32, etc.) into "partNumber" unless they are accompanying a scannable barcode label. Put IC markings, package codes, and component titles in "name" and "description" instead.

ESTIMATED QUANTITY:
- Count or estimate the number of component units visible in the photograph (e.g. 1 for a single IC/board/module, 5 for five loose resistors or ICs, 10 for a tape strip or pack of 10, or a quantity printed on the manufacturer packaging label).
- If only 1 unit is shown or the count cannot be determined with confidence, default to 1.
- Always output an integer >= 1 in "estimatedQuantity".

DIMENSIONS IN DESCRIPTION:
- In the "description" field, ALWAYS include a dedicated "Dimensions:" section/paragraph for each unit.
- If physical dimensions are visible or known from standard package specifications (e.g., standard DIP-8 footprint ~19 mm x 6.5 mm x 3.3 mm, SMD 0805 ~2.0 mm x 1.25 mm, TO-220, ESP32 dev board ~51 mm x 28 mm, or pin pitch), estimate and state them in millimeters (e.g. "Dimensions: ~19 mm x 6.5 mm x 3.3 mm").
- If dimensions cannot be determined from the image or package type, you MUST STILL include the placeholder line: "Dimensions: [Pending measurement - L x W x H mm]" so the user can fill it in later.
- The "description" field MUST ALWAYS conclude with this "Dimensions:" paragraph.

ROBU.IN "WH/IN" BARCODE LABEL SIGNATURE & SEARCH GROUNDING:
- Robu.in uses a standard white barcode label on its sealed bags:
  1. Top: 1D linear barcode.
  2. Center: Prominent bold 4 to 7 digit numeric SKU code (e.g., '44258', '1219056', '270708').
  3. Bottom: Warehouse inward tracking line containing "WH/IN/..." (e.g. 'WH/IN/58718') or "WH/OUT/...".
- When you see a label with "WH/IN" or "WH/IN/...":
  - SUPPLIER: Set "supplierInfo": "Robu.in".
  - SKU / PART NUMBER: Extract ONLY the bold numeric SKU printed directly above the WH/IN line (e.g., '44258') into "partNumber". Do NOT put 'WH/IN/58718' in "partNumber".
  - CONDITION: Set "condition": "Packed" (since it is sealed in the manufacturer/distributor bag).
  - SEARCH GROUNDING: Use Google Search Grounding to search 'site:robu.in "<SKU>"' (e.g. 'site:robu.in "44258"') or 'robu.in SKU <SKU>' to retrieve:
    * The exact official component name (e.g. 'Infrared IR Receiver Module for Arduino').
    * Operating voltage, pinout functions (e.g. VCC, GND, OUT/DAT), carrier frequency, and physical dimensions.
    * The exact product page URL on robu.in for "datasheetUrl".
- If the label also shows "QTY: <number>", populate "estimatedQuantity" with that number (default to 1 if not specified).

CRITICAL FORMAT REQUIREMENT:
Even though you are using Google Search Grounding to fetch product details, your final response MUST BE STRICTLY AND ONLY A SINGLE RAW JSON OBJECT (enclosed in { ... }) matching the schema below. Do not return conversational text or markdown explanation outside JSON.
Required JSON schema:
{
  "name": "Concise, descriptive component name (e.g., 'NE555 Precision Timer IC' or 'ESP32-WROOM-32D Development Board')",
  "partNumber": "ONLY populate if a physical barcode, 2D matrix, QR code, or printed barcode SKU is visible in the photo. Otherwise return empty string ''",
  "category": "One category selected from the available categories list above",
  "condition": "One condition selected strictly from: ['Unpacked New', 'Unpacked Used', 'Partially Working', 'Packed', 'Damaged']",
  "estimatedQuantity": 1,
  "description": "Technical summary describing functionality, package type (e.g. DIP-8, SOP-8, SMD 0805, TO-220), pin pitch, operating voltages, or key features.\n\nDimensions: Estimated physical size (e.g., '~19 mm x 6.5 mm x 3.3 mm' or '[Pending measurement - L x W x H mm]')",
  "tags": ["array", "of", "4-8", "searchable", "tags", "e.g.", "timer", "analog", "DIP-8", "5V-15V"],
  "supplierInfo": "Primary manufacturer or distributor (e.g., Texas Instruments, Espressif, STMicroelectronics, Adafruit, SparkFun, Generic)",
  "datasheetUrl": "Direct official datasheet URL if known with high confidence, otherwise empty string",
  "notes": "Brief technical notes, pinout summary, absolute maximum ratings, operating voltage, or pin 1 orientation"
}`;

export const STATIC_JSON_SCHEMA = {
  name: "string (Concise title e.g. 'NE555 Timer IC')",
  partNumber: "string (SKU/Barcode number — ONLY populated if a barcode/QR code is found, otherwise '')",
  category: "string (One matching category from vault)",
  condition: "string (One condition: 'Unpacked New', 'Unpacked Used', 'Partially Working', 'Packed', 'Damaged')",
  estimatedQuantity: "number (Count of visible units or quantity printed on packaging, integer >= 1, default 1)",
  description: "string (Technical summary, package, voltage ratings, and ALWAYS includes a 'Dimensions: ...' paragraph)",
  tags: "string[] (Searchable keywords e.g. ['timer', 'DIP-8', '5V-15V'])",
  supplierInfo: "string (Manufacturer or distributor)",
  datasheetUrl: "string (Manufacturer datasheet link or '')",
  notes: "string (Technical pinout details & operating limits)",
};

export const DEFAULT_AI_SETTINGS = {
  enabled: true,
  provider: 'gemini',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  apiKey: '',
  model: 'gemini-2.0-flash',
  useServerProxy: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  // Primary model rate limit (Requests Per Minute, 0 = unlimited)
  primaryRpmLimit: 5,
  // Live Google Search Grounding for live SKU/Robu product lookups
  webSearchGrounding: true,
  // Backup / Fallback model configuration
  backupEnabled: true,
  backupProvider: 'gemini',
  backupEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  backupApiKey: '',
  backupModel: 'gemini-1.5-flash',
  backupUseServerProxy: false,
};

// In-memory sliding window request timestamps for primary model rate limit
const primaryRequestTimestamps = [];

/**
 * Check if the primary model has reached its configured RPM limit.
 * @param {number} rpmLimit 
 * @returns {{ currentCount: number, rpmLimit: number, isLimitReached: boolean, availableInSeconds: number }}
 */
export function getPrimaryRpmStatus(rpmLimit = 5) {
  const now = Date.now();
  while (primaryRequestTimestamps.length > 0 && now - primaryRequestTimestamps[0] > 60000) {
    primaryRequestTimestamps.shift();
  }
  const currentCount = primaryRequestTimestamps.length;
  const limit = parseInt(rpmLimit, 10) || 0;
  const isLimitReached = limit > 0 && currentCount >= limit;
  const oldestAge = primaryRequestTimestamps[0] ? now - primaryRequestTimestamps[0] : 0;
  const availableInSeconds = isLimitReached ? Math.max(1, Math.ceil((60000 - oldestAge) / 1000)) : 0;
  return {
    currentCount,
    rpmLimit: limit,
    isLimitReached,
    availableInSeconds,
  };
}

function recordPrimaryRequest() {
  const now = Date.now();
  while (primaryRequestTimestamps.length > 0 && now - primaryRequestTimestamps[0] > 60000) {
    primaryRequestTimestamps.shift();
  }
  primaryRequestTimestamps.push(now);
}

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
      signal: AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined,
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
      signal: AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined,
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
 * Internal helper to dispatch a vision inference request to a specific model configuration.
 */
async function executeVisionRequest(config, base64Full, categories = [], hint = '') {
  const { provider, endpoint, apiKey, model, useServerProxy, systemPrompt, webSearchGrounding } = config;
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;

  if (preset.requiresKey && !apiKey) {
    throw new Error(`API Key for ${preset.name} is missing.`);
  }

  const matches = base64Full.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = matches ? matches[1] : 'image/jpeg';
  const base64Data = matches ? matches[2] : base64Full;

  const categoryListStr = categories.length > 0 ? categories.join(', ') : 'Sensors, ICs, Resistors, Capacitors, LEDs, Connectors, Switches, Motors, Modules, Other';

  const trimmedHint = (hint || '').trim();
  let hintSnippet = '';
  if (trimmedHint) {
    hintSnippet = `\n\nUSER-PROVIDED IDENTIFICATION HINT / CLUE:\n"${trimmedHint}"\nPlease take this user clue into account to increase recognition accuracy (e.g., verifying part numbers, package footprint, voltage rating, or IC function), but cross-reference it with the visual evidence in the image.`;
  }

  const promptTemplate = (systemPrompt && systemPrompt.trim()) ? systemPrompt : DEFAULT_SYSTEM_PROMPT;
  let baseInstructions = promptTemplate.includes('{CATEGORIES}')
    ? promptTemplate.replace('{CATEGORIES}', categoryListStr)
    : `${promptTemplate}\n\nAvailable categories in SimVentory: [${categoryListStr}]. Choose the closest matching category.`;

  if (!baseInstructions.toLowerCase().includes('estimatedquantity')) {
    baseInstructions += `\n\nESTIMATED QUANTITY: Count the visible component units in the image and return an integer >= 1 in "estimatedQuantity" (default 1).`;
  }

  if (!baseInstructions.toLowerCase().includes('dimension')) {
    baseInstructions += `\n\nDIMENSIONS IN DESCRIPTION: Always include a dedicated "Dimensions:" paragraph at the end of the "description" field. If physical dimensions are estimated from the package/photo, state them (e.g. "Dimensions: ~19 mm x 6.5 mm x 3.3 mm"); if unknown, write "Dimensions: [Pending measurement - L x W x H mm]".`;
  }

  if (!baseInstructions.toLowerCase().includes('wh/in')) {
    baseInstructions += `\n\nROBU.IN "WH/IN" BARCODE LABEL SIGNATURE:
If the label shows a barcode, a bold 4 to 7 digit number (e.g. 44258), and a line with "WH/IN/..." (e.g. WH/IN/58718):
1. SUPPLIER: Set "supplierInfo": "Robu.in".
2. SKU: Extract the bold number directly above WH/IN (e.g. "44258") as "partNumber".
3. SEARCH GROUNDING: Use Google Search Grounding to search 'site:robu.in <SKU>' to find the exact official component title, specs, pinouts, and dimensions.
4. CONDITION: Set "condition": "Packed".
5. DATASHEET: Set "datasheetUrl" to the live Robu product page.`;
  }

  const systemInstructions = baseInstructions + hintSnippet;

  let rawResponseText = '';
  let extractedWebSources = [];

  // 1. Google Gemini Native
  if (provider === 'gemini') {
    const cleanEndpoint = (endpoint || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/+$/, '');
    const url = `${cleanEndpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const useWebSearch = webSearchGrounding !== false;

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
        // When google_search tool is included, response_mime_type must be omitted to prevent 400 error
        ...(useWebSearch ? {} : { response_mime_type: 'application/json' }),
      },
      ...(useWebSearch ? { tools: [{ google_search: {} }] } : {}),
    };

    let data;
    try {
      data = await dispatchRequest({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        useServerProxy,
      });
    } catch (err) {
      if (useWebSearch && (String(err).includes('tool') || String(err).includes('search') || String(err).includes('400'))) {
        console.warn('[AI Service] Web search grounding failed or unsupported, retrying without tools:', err);
        const fallbackPayload = {
          ...payload,
          generationConfig: {
            temperature: 0.1,
            response_mime_type: 'application/json',
          },
        };
        delete fallbackPayload.tools;
        data = await dispatchRequest({
          url,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: fallbackPayload,
          useServerProxy,
        });
      } else {
        throw err;
      }
    }

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    rawResponseText = parts.map(p => p.text || '').filter(Boolean).join('\n');

    // Extract grounding URLs if available
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    extractedWebSources = groundingChunks.map(c => c.web?.uri).filter(Boolean);
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
              text: 'Please identify this electronic component and output the requested JSON object.' + (trimmedHint ? `\nUser hint: "${trimmedHint}".` : ''),
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
  const VALID_CONDITIONS = ['Unpacked New', 'Unpacked Used', 'Partially Working', 'Packed', 'Damaged'];
  const rawCond = (parsed.condition || '').trim();
  let matchedCond = VALID_CONDITIONS.find(c => c.toLowerCase() === rawCond.toLowerCase()) || 'Unpacked New';

  // Parse estimated quantity (integer >= 1, defaults to 1)
  let estimatedQuantity = 1;
  const rawQty = parsed.estimatedQuantity !== undefined ? parsed.estimatedQuantity : parsed.quantity;
  if (rawQty !== undefined && rawQty !== null) {
    const num = parseInt(rawQty, 10);
    if (!isNaN(num) && num > 0) {
      estimatedQuantity = num;
    }
  }

  // Sanitize description and guarantee a Dimensions paragraph exists
  let description = (parsed.description || '').trim();
  const hasDimensions = /dimensions?:/i.test(description);
  if (!hasDimensions) {
    const dimPlaceholder = 'Dimensions: [Pending measurement - L x W x H mm]';
    description = description ? `${description}\n\n${dimPlaceholder}` : dimPlaceholder;
  }

  let partNumber = (parsed.partNumber || '').trim();
  let supplierInfo = (parsed.supplierInfo || '').trim();
  let datasheetUrl = (parsed.datasheetUrl || '').trim();

  // Detect Robu.in WH/IN warehouse inward barcode signature
  const isRobuWhIn = /WH\s*[\/\\]\s*IN/i.test(rawResponseText) ||
                     /WH\s*[\/\\]\s*IN/i.test(parsed.notes || '') ||
                     /WH\s*[\/\\]\s*IN/i.test(partNumber);

  if (isRobuWhIn) {
    if (!supplierInfo) supplierInfo = 'Robu.in';
    // If condition was default 'Unpacked New', mark as 'Packed' since it's sealed in the distributor pouch
    if (matchedCond === 'Unpacked New') {
      matchedCond = 'Packed';
    }
  }

  // If partNumber accidentally captured WH/IN/..., extract the clean 4-7 digit product SKU
  if (/WH\s*[\/\\]\s*IN/i.test(partNumber)) {
    const skuMatch = partNumber.match(/\b(\d{4,7})\b/);
    partNumber = skuMatch ? skuMatch[1] : '';
  }

  // If partNumber was missed but WH/IN was detected, look for 4-7 digit SKU near WH/IN in raw response
  if (!partNumber && isRobuWhIn) {
    const skuMatch = rawResponseText.match(/\b(\d{4,7})\b[\s\S]{0,40}WH\s*[\/\\]\s*IN/i) ||
                     rawResponseText.match(/WH\s*[\/\\]\s*IN[\s\S]{0,40}\b(\d{4,7})\b/i);
    if (skuMatch) {
      partNumber = skuMatch[1];
    }
  }

  // If datasheetUrl is empty, use web sources from Google Search Grounding
  if (!datasheetUrl && extractedWebSources.length > 0) {
    const robuSource = extractedWebSources.find(u => u.includes('robu.in'));
    datasheetUrl = robuSource || extractedWebSources[0];
  }

  // If Robu packaging was detected or web search hit robu.in, auto-link to Robu product page
  if (!supplierInfo && (datasheetUrl.includes('robu.in') || extractedWebSources.some(u => u.includes('robu.in')))) {
    supplierInfo = 'Robu.in';
  }
  if (supplierInfo.toLowerCase().includes('robu') && partNumber && !datasheetUrl) {
    datasheetUrl = `https://robu.in/?s=${encodeURIComponent(partNumber)}&post_type=product`;
  }

  return {
    name: (parsed.name || '').trim(),
    partNumber,
    category: matchCategory(parsed.category, categories),
    condition: matchedCond,
    estimatedQuantity,
    quantity: estimatedQuantity,
    description,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(t => String(t).trim()).filter(Boolean) : [],
    supplierInfo,
    datasheetUrl,
    notes: (parsed.notes || '').trim(),
    modelUsed: model,
    providerUsed: provider,
  };
}

/**
 * Extract electronics component details from an image.
 * Evaluates Primary model RPM rate limit, auto-switching to backup model if limit reached,
 * and automatically fails over to the backup model in case of any runtime errors.
 * @param {Object} options
 * @param {Blob|File|string} options.image - Component photo blob or base64 data URL
 * @param {Array<string>} [options.categories] - List of current category names
 * @param {Object} [options.existingItem] - Existing item data if editing
 * @param {string} [options.hint] - Optional user hint/clue to boost recognition accuracy
 * @returns {Promise<Object>} Extracted item details
 */
export async function analyzeComponentImage({ image, categories = [], existingItem = null, hint = '' }) {
  await fetchAISettings().catch(() => {});
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('AI recognition is disabled in Settings.');
  }

  // Convert image to base64 (supports Blob, data URL, blob: URL, or fetchable image URL)
  let base64Full = '';
  if (image instanceof Blob) {
    base64Full = await blobToBase64(image);
  } else if (typeof image === 'string') {
    if (image.startsWith('data:')) {
      base64Full = image;
    } else {
      const res = await fetch(image);
      const fetchedBlob = await res.blob();
      base64Full = await blobToBase64(fetchedBlob);
    }
  } else {
    throw new Error('Unsupported image format provided for AI recognition.');
  }

  const primaryConfig = {
    provider: settings.provider,
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    model: settings.model,
    useServerProxy: settings.useServerProxy,
    systemPrompt: settings.systemPrompt,
    webSearchGrounding: settings.webSearchGrounding !== false,
  };

  const backupProvider = settings.backupProvider || settings.provider;
  const backupPreset = PROVIDER_PRESETS[backupProvider] || PROVIDER_PRESETS.custom;
  const backupEndpoint = (settings.backupEndpoint && settings.backupEndpoint.trim())
    ? settings.backupEndpoint.trim()
    : (backupPreset.endpoint || settings.endpoint);
  const backupApiKey = (settings.backupApiKey && settings.backupApiKey.trim())
    ? settings.backupApiKey.trim()
    : (backupProvider === settings.provider ? settings.apiKey : '');

  const backupConfig = {
    provider: backupProvider,
    endpoint: backupEndpoint,
    apiKey: backupApiKey,
    model: settings.backupModel,
    useServerProxy: settings.backupUseServerProxy !== undefined ? settings.backupUseServerProxy : settings.useServerProxy,
    systemPrompt: settings.systemPrompt,
    webSearchGrounding: settings.webSearchGrounding !== false,
  };

  const hasBackup = settings.backupEnabled && Boolean(settings.backupModel && settings.backupModel.trim());
  const rpmStatus = getPrimaryRpmStatus(settings.primaryRpmLimit);

  // 1. Proactive Rate Limit Switching:
  // If primary model has hit its RPM threshold, switch directly to the backup model!
  if (hasBackup && rpmStatus.isLimitReached) {
    console.warn(`[AI Service] Primary model rate limit (${rpmStatus.rpmLimit} req/min) reached. Auto-switching to backup model (${backupConfig.model}). Resets in ${rpmStatus.availableInSeconds}s.`);
    try {
      const backupResult = await executeVisionRequest(backupConfig, base64Full, categories, hint);
      backupResult.switchedToBackup = true;
      backupResult.backupReason = `Primary model rate limit (${rpmStatus.rpmLimit} req/min) reached. Auto-switched to backup model.`;
      backupResult.modelUsed = `${backupConfig.model} (Backup: Rate limit)`;
      return backupResult;
    } catch (backupErr) {
      console.error('[AI Service] Backup model also failed after rate limit switch:', backupErr);
      throw new Error(`Primary reached ${rpmStatus.rpmLimit} req/min limit. Backup model failed: ${backupErr.message}`);
    }
  }

  // 2. Try Primary Model
  try {
    recordPrimaryRequest();
    const result = await executeVisionRequest(primaryConfig, base64Full, categories, hint);
    result.switchedToBackup = false;
    return result;
  } catch (primaryErr) {
    // 3. Reactive Failover on Error:
    // If primary model fails with 429 quota exhaustion, 5xx server error, timeout, or malformed reply:
    if (hasBackup) {
      console.warn(`[AI Service] Primary model (${primaryConfig.model}) failed: ${primaryErr.message}. Invoking backup model (${backupConfig.model})...`);
      try {
        const backupResult = await executeVisionRequest(backupConfig, base64Full, categories, hint);
        backupResult.switchedToBackup = true;
        backupResult.backupReason = `Primary model failed (${primaryErr.message}). Automatically switched to backup model.`;
        backupResult.modelUsed = `${backupConfig.model} (Backup: Failover)`;
        return backupResult;
      } catch (backupErr) {
        console.error('[AI Service] Backup model also failed during failover:', backupErr);
        throw new Error(`Primary failed (${primaryErr.message}). Backup model failed: ${backupErr.message}`);
      }
    }

    throw primaryErr;
  }
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
