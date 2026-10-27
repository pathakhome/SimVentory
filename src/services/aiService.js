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
    defaultModel: 'google/gemini-2.5-flash',
    suggestedModels: [
      'google/gemini-2.5-flash',
      'google/gemini-2.5-flash-lite',
      'google/gemini-2.5-pro',
      'google/gemma-4-31b-it',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.2-11b-vision-instruct',
      'qwen/qwen-2.5-vl-72b-instruct',
      'openai/gpt-4o-mini',
    ],
    placeholderKey: 'sk-or-v1-...',
    requiresKey: true,
    hint: 'Unified gateway for Gemini, Llama 3.2 Vision, Qwen VL, Gemma 4 & GPT-4o-mini.',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini (Native Google AI Studio)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
    ],
    placeholderKey: 'AIzaSy...',
    requiresKey: true,
    hint: 'Direct Google AI Studio API. High speed with generous free tier (Use gemini-2.5-flash).',
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
      'gemma-4-31b-it',
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

ROBU.IN "WH/IN" BARCODE LABEL SIGNATURE:
- Robu.in uses a standard white barcode label on its sealed bags:
  1. Top: 1D linear barcode.
  2. Center: Prominent bold 4 to 7 digit numeric SKU code (e.g., printed numbers like 29793, 31100, 58718).
  3. Bottom: Warehouse inward tracking line containing "WH/IN/..." or "WH/OUT/...".
- When you see a label with "WH/IN" or "WH/IN/...":
  - SUPPLIER: Set "supplierInfo": "Robu.in".
  - SKU / PART NUMBER: Extract ONLY the actual bold numeric SKU printed on the label in the image into "partNumber". Read the actual digits present on the user's label. Do NOT put 'WH/IN/...' in "partNumber".
  - COMPONENT IDENTIFICATION: Identify the component (name, category, description, specifications, pinouts) using pure visual AI inspection of the actual physical electronic part, IC markings, and PCB silkscreen visible in the photo. Do NOT perform web searches for Robu numeric SKUs.
  - CONDITION: Set "condition": "Packed" (since it is sealed in the manufacturer/distributor bag).
  - DATASHEET: Set "datasheetUrl" to "https://robu.in/?s=<SKU>".
- If the label also shows "QTY: <number>", populate "estimatedQuantity" with that number (default to 1 if not specified).

HUBTRONICS.IN "RTB/IN" BARCODE LABEL SIGNATURE:
- Hubtronics uses a white barcode label on its sealed component bags:
  1. Top: Warehouse inward tracking line containing "RTB/IN-" or "RTB/IN" (e.g. 'RTB/IN-27134').
  2. Second line: Numeric item code / barcode (e.g., '1927766437').
  3. Barcode: 1D linear barcode.
  4. Product description: Explicitly printed in English directly below the barcode (e.g., 'MAX98357 I2S 3W Class D Audio Decoder Module').
  5. Bottom line: Storage bin/shelf code (e.g., 'B-11-H').
- When you see a label with "RTB/IN" or "RTB/IN-":
  - SUPPLIER: Set "supplierInfo": "Hubtronics".
  - SKU / PART NUMBER: Extract the numeric item code directly below RTB/IN (e.g., '1927766437') or the component IC part number (e.g., 'MAX98357') into "partNumber". Do NOT put 'RTB/IN-27134' in "partNumber".
  - NAME: Use the printed product title from the label (e.g. 'MAX98357 I2S 3W Class D Audio Decoder Module').
  - CONDITION: Set "condition": "Packed" (since it is sealed in the distributor pouch).
  - DATASHEET / URL: Provide the official Hubtronics product page URL if discovered, or 'https://hubtronics.in/index.php?route=product/search&search=<Title>'.

CRITICAL FORMAT REQUIREMENT:
Your final response MUST BE STRICTLY AND ONLY A SINGLE RAW JSON OBJECT (enclosed in { ... }) matching the schema below. Do not return conversational text or markdown explanation outside JSON.
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
  model: 'gemini-2.5-flash',
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
  backupModel: 'gemini-2.0-flash',
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
If the label shows a barcode, a bold 4 to 7 digit numeric SKU, and a line with "WH/IN/...":
1. SUPPLIER: Set "supplierInfo": "Robu.in".
2. SKU: Extract ONLY the actual bold digits printed directly above WH/IN as "partNumber". Read strictly from the image.
3. COMPONENT IDENTIFICATION: Identify the component name, specs, and pinouts visually from the physical part/IC visible in the photo. Do NOT perform web searches for Robu numeric SKUs.
4. CONDITION: Set "condition": "Packed".
5. DATASHEET: Set "datasheetUrl" to "https://robu.in/?s=<SKU>".`;
  }

  if (!baseInstructions.toLowerCase().includes('rtb/in')) {
    baseInstructions += `\n\nHUBTRONICS.IN "RTB/IN" BARCODE LABEL SIGNATURE:
If the label shows "RTB/IN-" or "RTB/IN" (e.g. RTB/IN-27134), a numeric code (e.g. 1927766437), or printed product description:
1. SUPPLIER: Set "supplierInfo": "Hubtronics".
2. SKU: Extract the numeric item code directly below RTB/IN (e.g. "1927766437") or component IC part number as "partNumber".
3. NAME: Use the printed product title from the label if visible.
4. CONDITION: Set "condition": "Packed".
5. DATASHEET: Set "datasheetUrl" to the Hubtronics product page.`;
  }

  const systemInstructions = baseInstructions + hintSnippet;

  let rawResponseText = '';
  let extractedWebSources = [];

  // 1. Google Gemini Native
  if (provider === 'gemini') {
    const cleanEndpoint = (endpoint || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/+$/, '');
    const url = `${cleanEndpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    // Only native Gemini models (gemini-*) support Google's proprietary search grounding tool
    const isGeminiFamily = (model || '').toLowerCase().startsWith('gemini');
    const useWebSearch = webSearchGrounding !== false && isGeminiFamily;

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
      if (useWebSearch && (String(err).includes('tool') || String(err).includes('search') || String(err).includes('400') || String(err).includes('500'))) {
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

  // Detect Robu.in WH/IN warehouse inward barcode signature safely from parsed fields
  const isRobuWhIn = /WH\s*[\/\\]\s*IN/i.test(partNumber) ||
                     /WH\s*[\/\\]\s*IN/i.test(parsed.notes || '') ||
                     /WH\s*[\/\\]\s*IN/i.test(parsed.description || '') ||
                     (supplierInfo && supplierInfo.toLowerCase().includes('robu'));

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

  // If partNumber was missed but WH/IN notes were explicitly detected, look for 4-7 digit SKU in notes or partNumber
  if (!partNumber && isRobuWhIn) {
    const skuMatch = (parsed.notes || '').match(/WH\s*[\/\\]\s*IN[^\d]*(\d{4,7})\b/i) ||
                     (parsed.notes || '').match(/\b(\d{4,7})\b[^\n]*WH\s*[\/\\]\s*IN/i) ||
                     (parsed.description || '').match(/\b(\d{4,7})\b[^\n]*WH\s*[\/\\]\s*IN/i);
    if (skuMatch) {
      partNumber = skuMatch[1];
    }
  }

  // If datasheetUrl is empty, use web sources from Google Search Grounding
  // For Robu products with a valid SKU, generate direct SKU search URL on Robu.in without post_type=product
  if (supplierInfo.toLowerCase().includes('robu') && partNumber) {
    const numericSku = partNumber.match(/\b(\d{4,8})\b/);
    const cleanSku = numericSku ? numericSku[1] : partNumber.trim();
    if (numericSku) {
      partNumber = cleanSku;
    }
    // Always set direct store search link on Robu for the detected SKU
    datasheetUrl = `https://robu.in/?s=${encodeURIComponent(cleanSku)}`;
  } else if (!datasheetUrl && extractedWebSources.length > 0) {
    // If other component datasheet found from manufacturer web sources
    datasheetUrl = extractedWebSources[0];
  }

  // Ensure post_type=product is stripped if present in any robu.in URL
  if (datasheetUrl.includes('robu.in')) {
    datasheetUrl = datasheetUrl.replace(/[?&]post_type=product/g, '').replace('?&', '?');
  }

  // Detect Hubtronics.in RTB/IN warehouse inward barcode signature safely from parsed fields
  const isHubtronics = /RTB\s*[\/\\]\s*IN/i.test(partNumber) ||
                       /RTB\s*[\/\\]\s*IN/i.test(parsed.notes || '') ||
                       (supplierInfo && supplierInfo.toLowerCase().includes('hubtronics'));

  if (isHubtronics) {
    if (!supplierInfo) supplierInfo = 'Hubtronics';
    if (matchedCond === 'Unpacked New') {
      matchedCond = 'Packed';
    }
  }

  // If partNumber captured RTB/IN-..., strip it and extract clean numeric code (e.g. 1927766437)
  if (/RTB\s*[\/\\]\s*IN/i.test(partNumber)) {
    const numMatch = partNumber.match(/\b(\d{6,12})\b/);
    partNumber = numMatch ? numMatch[1] : '';
  }

  // If partNumber was missed but Hubtronics detected in notes, extract numeric code
  if (!partNumber && isHubtronics) {
    const codeMatch = (parsed.notes || '').match(/RTB\s*[\/\\]\s*IN[^\n]*\n?\s*(\d{6,12})/i);
    if (codeMatch) {
      partNumber = codeMatch[1];
    }
  }

  // Auto-link to Hubtronics search if supplier is Hubtronics or hubtronics.in in web sources
  if (!supplierInfo && (datasheetUrl.includes('hubtronics.in') || extractedWebSources.some(u => u.includes('hubtronics.in')))) {
    supplierInfo = 'Hubtronics';
  }
  if (supplierInfo.toLowerCase().includes('hubtronics') && !datasheetUrl) {
    const searchTarget = (parsed.name || partNumber || '').trim();
    if (searchTarget) {
      datasheetUrl = `https://hubtronics.in/index.php?route=product/search&search=${encodeURIComponent(searchTarget)}`;
    }
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

export const DEFAULT_INVOICE_PROMPT = `You are an expert electronics inventory & invoice parsing assistant.
Analyze the provided purchase invoice, delivery challan, packing slip, order receipt, or order summary document/image.
Extract all electronics components, chips, modules, dev boards, sensors, passives, switches, connectors, and hardware accessories.

Available categories in SimVentory: [{CATEGORIES}].
Choose the closest matching category for each line item.

CRITICAL INSTRUCTIONS FOR INVOICE EXTRACTION:
1. SUPPLIER / DISTRIBUTOR:
   - Identify the vendor name (e.g. Robu.in, Mouser Electronics, DigiKey, Hubtronics, LCSC, Adafruit, SparkFun, Amazon, etc.).
   - Extract the invoice or order number into "invoiceNumber".
   - Extract the invoice date (YYYY-MM-DD or readable string) into "invoiceDate".
   - Extract currency symbol/code (e.g. "INR", "USD", "EUR", "₹", "$") into "currency".
   - Extract total amount into "totalAmount" (number or string).

2. ITEMS LIST:
   - Extract EVERY individual component or hardware line item into the "items" array.
   - "name": Clean, concise, descriptive product title (e.g. "ESP32-WROOM-32D Development Board", "NE555 Precision Timer IC DIP-8", "0.1uF 50V Ceramic Capacitor 100-Pack").
   - "partNumber": The distributor SKU, Manufacturer Part Number (MPN), or catalog item code from the invoice. For Robu, extract the product SKU/Item Code; for Hubtronics, extract the item code or MPN. If none found, leave empty string "".
   - "quantity": The exact quantity ordered/delivered as an integer >= 1 (e.g. 5, 10, 50). Do not confuse unit price with quantity.
   - "unitPrice": The price per single unit if visible, or null.
   - "totalPrice": The line item total price if visible, or null.
   - "category": Choose the closest category from the available categories list above.
   - "condition": Default to 'Packed' since newly received from distributor.
   - "description": Technical summary or specs mentioned on the invoice line item.
   - "tags": Array of 3-6 relevant keywords (e.g. ["ESP32", "WiFi", "Microcontroller"]).

Return STRICTLY AND ONLY a single valid JSON object matching this schema:
{
  "supplierName": "Robu.in",
  "invoiceNumber": "INV-10924",
  "invoiceDate": "2026-10-25",
  "currency": "INR",
  "totalAmount": 1250.00,
  "items": [
    {
      "name": "ESP32 Dev Board",
      "partNumber": "29793",
      "quantity": 2,
      "unitPrice": 350.00,
      "totalPrice": 700.00,
      "category": "Modules",
      "condition": "Packed",
      "description": "ESP-WROOM-32 WiFi and Bluetooth development board",
      "tags": ["ESP32", "WiFi", "Bluetooth", "Module"]
    }
  ]
}`;

function sanitizeInvoiceResult(parsed, categories = [], model = '', provider = '') {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI invoice response was empty or malformed.');
  }

  const supplierName = (parsed.supplierName || parsed.vendor || parsed.distributor || '').trim();
  const invoiceNumber = (parsed.invoiceNumber || parsed.orderNumber || parsed.invoiceNo || '').trim();
  const invoiceDate = (parsed.invoiceDate || parsed.orderDate || parsed.date || '').trim();
  const currency = (parsed.currency || '').trim();
  const totalAmount = parsed.totalAmount !== undefined ? parsed.totalAmount : null;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const VALID_CONDITIONS = ['Unpacked New', 'Unpacked Used', 'Partially Working', 'Packed', 'Damaged'];

  const items = rawItems.map(item => {
    const rawCond = (item.condition || '').trim();
    const matchedCond = VALID_CONDITIONS.find(c => c.toLowerCase() === rawCond.toLowerCase()) || 'Packed';

    let quantity = 1;
    const rawQty = item.quantity !== undefined ? item.quantity : item.qty;
    if (rawQty !== undefined && rawQty !== null) {
      const num = parseInt(rawQty, 10);
      if (!isNaN(num) && num > 0) {
        quantity = num;
      }
    }

    const name = (item.name || item.title || item.description || 'Unlabeled Component').trim();
    let partNumber = (item.partNumber || item.sku || item.itemCode || item.mpn || '').trim();
    // Clean WH/IN signatures if present
    if (/WH\s*[\/\\]\s*IN/i.test(partNumber)) {
      const match = partNumber.match(/\b(\d{4,8})\b/);
      partNumber = match ? match[1] : '';
    }

    return {
      name,
      partNumber,
      quantity,
      unitPrice: item.unitPrice !== undefined ? item.unitPrice : null,
      totalPrice: item.totalPrice !== undefined ? item.totalPrice : null,
      category: matchCategory(item.category, categories),
      condition: matchedCond,
      description: (item.description || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags.map(t => String(t).trim()).filter(Boolean) : [],
    };
  });

  return {
    supplierName,
    invoiceNumber,
    invoiceDate,
    currency,
    totalAmount,
    items,
    modelUsed: model,
    providerUsed: provider,
  };
}

async function executeInvoiceRequest(config, base64Images = [], rawText = '', categories = [], hint = '') {
  const { provider, endpoint, apiKey, model, useServerProxy } = config;
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;

  if (preset.requiresKey && !apiKey) {
    throw new Error(`API Key for ${preset.name} is missing.`);
  }

  const categoryListStr = categories.length > 0
    ? categories.join(', ')
    : 'Sensors, ICs, Resistors, Capacitors, LEDs, Connectors, Switches, Motors, Modules, Other';

  const systemInstructions = DEFAULT_INVOICE_PROMPT.replace('{CATEGORIES}', categoryListStr) +
    (hint ? `\n\nUSER-PROVIDED INVOICE CLUE / HINT:\n"${hint}"` : '');

  let rawResponseText = '';

  if (provider === 'gemini') {
    const cleanEndpoint = (endpoint || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/+$/, '');
    const url = `${cleanEndpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const inlineParts = base64Images.map(img => {
      const matches = img.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = matches ? matches[1] : 'image/jpeg';
      const base64Data = matches ? matches[2] : img;
      return {
        inline_data: {
          mime_type: mimeType,
          data: base64Data,
        },
      };
    });

    const textParts = [{ text: systemInstructions }];
    if (rawText && rawText.trim()) {
      textParts.push({ text: `\n\nEXTRACTED INVOICE TEXT CONTENT:\n${rawText.trim()}` });
    }

    const payload = {
      contents: [
        {
          parts: [...textParts, ...inlineParts],
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

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    rawResponseText = parts.map(p => p.text || '').filter(Boolean).join('\n');
  } else {
    // OpenAI / OpenRouter / Local Ollama / Custom
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'SimVentory';
    }

    const userParts = [
      {
        type: 'text',
        text: 'Extract all electronics components, quantities, prices, and distributor details from this invoice.' +
          (rawText ? `\n\nExtracted invoice text:\n${rawText}` : '') +
          (hint ? `\n\nUser hint: "${hint}"` : ''),
      },
      ...base64Images.map(img => ({
        type: 'image_url',
        image_url: { url: img },
      })),
    ];

    const payload = {
      model,
      messages: [
        { role: 'system', content: systemInstructions },
        { role: 'user', content: userParts },
      ],
      temperature: 0.1,
      max_tokens: 4000,
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

  const parsed = parseAIResponseJSON(rawResponseText);
  return sanitizeInvoiceResult(parsed, categories, model, provider);
}

/**
 * Extract electronics components, quantities, and distributor metadata from an invoice.
 * Supports image frames, PDF text, rate-limiting, and backup model auto-failover.
 * @param {Object} options
 * @param {Array<string|Blob>} options.images - Array of image Data URLs or Blobs
 * @param {string} [options.rawText] - Optional text extracted from PDF
 * @param {Array<string>} [options.categories] - List of category names
 * @param {string} [options.hint] - Optional user hint or distributor note
 * @returns {Promise<Object>} Extracted invoice details and items
 */
export async function analyzeInvoiceDocument({ images = [], rawText = '', categories = [], hint = '' }) {
  await fetchAISettings().catch(() => {});
  const settings = getAISettings();
  if (!settings.enabled) {
    throw new Error('AI recognition is disabled in Settings.');
  }

  if (images.length === 0 && (!rawText || !rawText.trim())) {
    throw new Error('Please provide at least one invoice image page or document text.');
  }

  // Convert all images to Base64 data URLs
  const base64Images = [];
  for (const img of images) {
    if (img instanceof Blob) {
      base64Images.push(await blobToBase64(img));
    } else if (typeof img === 'string') {
      if (img.startsWith('data:')) {
        base64Images.push(img);
      } else {
        const res = await fetch(img);
        const blob = await res.blob();
        base64Images.push(await blobToBase64(blob));
      }
    }
  }

  const primaryConfig = {
    provider: settings.provider,
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    model: settings.model,
    useServerProxy: settings.useServerProxy,
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
  };

  const hasBackup = settings.backupEnabled && Boolean(settings.backupModel && settings.backupModel.trim());
  const rpmStatus = getPrimaryRpmStatus(settings.primaryRpmLimit);

  // 1. Rate Limit Proactive Switching
  if (hasBackup && rpmStatus.isLimitReached) {
    console.warn(`[AI Service] Primary model rate limit reached. Auto-switching invoice parsing to backup model (${backupConfig.model}).`);
    try {
      const backupResult = await executeInvoiceRequest(backupConfig, base64Images, rawText, categories, hint);
      backupResult.switchedToBackup = true;
      backupResult.backupReason = `Primary model rate limit (${rpmStatus.rpmLimit} req/min) reached. Auto-switched to backup model.`;
      backupResult.modelUsed = `${backupConfig.model} (Backup: Rate limit)`;
      return backupResult;
    } catch (backupErr) {
      console.error('[AI Service] Backup model invoice parsing failed after rate limit switch:', backupErr);
      throw new Error(`Primary reached ${rpmStatus.rpmLimit} req/min limit. Backup model failed: ${backupErr.message}`);
    }
  }

  // 2. Try Primary Model
  try {
    recordPrimaryRequest();
    const result = await executeInvoiceRequest(primaryConfig, base64Images, rawText, categories, hint);
    result.switchedToBackup = false;
    return result;
  } catch (primaryErr) {
    // 3. Reactive Failover
    if (hasBackup) {
      console.warn(`[AI Service] Primary model (${primaryConfig.model}) invoice parsing failed: ${primaryErr.message}. Invoking backup model...`);
      try {
        const backupResult = await executeInvoiceRequest(backupConfig, base64Images, rawText, categories, hint);
        backupResult.switchedToBackup = true;
        backupResult.backupReason = `Primary failed (${primaryErr.message.slice(0, 100)}). Auto-switched to backup model.`;
        backupResult.modelUsed = `${backupConfig.model} (Backup: Failover)`;
        return backupResult;
      } catch (backupErr) {
        console.error('[AI Service] Backup model invoice parsing also failed:', backupErr);
        throw new Error(`Primary failed: ${primaryErr.message} | Backup failed: ${backupErr.message}`);
      }
    }
    throw primaryErr;
  }
}
