/**
 * =============================================================================
 * Gemini API Integration Module
 * =============================================================================
 *
 * Gemini Vision APIとの連携機能を提供するモジュール
 * - APIキー管理（メモリ保存）
 * - Vision API呼び出し
 * - API設定モーダルコンポーネント
 *
 * =============================================================================
 */

// =============================================================================
// API Configuration
// =============================================================================

/**
 * Gemini API endpoint configuration
 */
const GEMINI_API_CONFIG = {
  model: "gemini-3-flash-preview",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
};

// =============================================================================
// API Key Management (Memory Store)
// =============================================================================

/**
 * Gemini API Key stored in memory (not persisted)
 * @type {string|null}
 */
let geminiApiKey = null;

/**
 * Get the stored Gemini API key
 * @returns {string|null} The API key or null if not set
 */
function getGeminiApiKey() {
  return geminiApiKey;
}

/**
 * Set the Gemini API key
 * @param {string|null} key - The API key to store
 */
function setGeminiApiKey(key) {
  geminiApiKey = key;
}

// =============================================================================
// Alpine.js Component for API Settings Modal
// =============================================================================

/**
 * Alpine.js component for API settings modal
 * @returns {Object} Alpine.js component
 */
function apiSettingsData() {
  return {
    apiKeyInput: geminiApiKey || "",
    showPassword: false,

    get isApiKeySet() {
      return !!geminiApiKey;
    },

    togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
      const input = document.getElementById("geminiApiKey");
      if (input) {
        input.type = this.showPassword ? "text" : "password";
      }
    },

    saveApiKey() {
      if (this.apiKeyInput) {
        setGeminiApiKey(this.apiKeyInput);
        const modal = bootstrap.Modal.getInstance(
          document.getElementById("apiSettingsModal")
        );
        if (modal) modal.hide();
      }
    },

    clearApiKey() {
      setGeminiApiKey(null);
      this.apiKeyInput = "";
    },
  };
}

// =============================================================================
// Gemini Vision API
// =============================================================================

/**
 * Build API request body for Gemini Vision API
 * @param {string} prompt - Text prompt
 * @param {Array<string>} base64Images - Array of base64 encoded images
 * @returns {Object} Request body
 */
function buildVisionRequestBody(prompt, base64Images) {
  return {
    contents: [
      {
        parts: [
          { text: prompt },
          ...base64Images.map((img) => ({
            inline_data: {
              mime_type: "image/png",
              data: img.replace(/^data:image\/\w+;base64,/, ""),
            },
          })),
        ],
      },
    ],
  };
}

/**
 * Call Gemini Vision API with images
 * @param {Array<string>} base64Images - Array of base64 encoded images
 * @param {string} prompt - The prompt to send to the API
 * @returns {Promise<string>} The API response text
 * @throws {Error} If API key is not set or API call fails
 */
async function callGeminiVisionApi(base64Images, prompt) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "APIキーが設定されていません。右上の「API設定」から設定してください。"
    );
  }

  const url = `${GEMINI_API_CONFIG.baseUrl}/${GEMINI_API_CONFIG.model}:generateContent?key=${apiKey}`;
  const body = buildVisionRequestBody(prompt, base64Images);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `API Error: ${response.status}`
    );
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "レスポンスが空です";
}
