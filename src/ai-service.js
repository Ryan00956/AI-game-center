/**
 * AI Service - Supports multiple API profiles for different AI players
 * 
 * Default: OpenAI API (also compatible with any OpenAI-format endpoint)
 * Base URL: https://api.openai.com/v1
 */

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_API_URL = DEFAULT_BASE_URL + '/chat/completions';
const STORAGE_KEY = 'ai_game_profiles';

// Available models
export const AVAILABLE_MODELS = [
  { group: 'Gemini (Google)', models: [
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', desc: '快速、性价比高' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: '经典快速模型' },
    { id: 'gemini-3-pro-low', name: 'Gemini 3 Pro (Low)', desc: '高质量推理' },
    { id: 'gemini-3-pro-high', name: 'Gemini 3 Pro (High)', desc: '最高质量' },
    { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)', desc: '最新 Pro' },
    { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', desc: '最新高质量' },
  ]},
  { group: 'Claude (Anthropic)', models: [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', desc: '性能均衡' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', desc: '经典 Sonnet' },
    { id: 'claude-sonnet-4-6-thinking', name: 'Claude Sonnet 4.6 (Thinking)', desc: '深度思考' },
    { id: 'claude-opus-4-5-thinking', name: 'Claude Opus 4.5 (Thinking)', desc: '最强推理' },
    { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', desc: '最新最强' },
  ]},
  { group: 'GPT (OpenAI)', models: [
    { id: 'gpt-5.1', name: 'GPT 5.1', desc: '基础版' },
    { id: 'gpt-5.2', name: 'GPT 5.2', desc: '增强版' },
    { id: 'gpt-5.4', name: 'GPT 5.4', desc: '最新旗舰' },
  ]},
  { group: 'Grok (xAI)', models: [
    { id: 'grok-3-mini', name: 'Grok 3 Mini', desc: '轻量快速' },
    { id: 'grok-3', name: 'Grok 3', desc: '经典版本' },
    { id: 'grok-4', name: 'Grok 4', desc: '新一代' },
    { id: 'grok-4.1-fast', name: 'Grok 4.1 Fast', desc: '快速推理' },
    { id: 'grok-4.1-mini', name: 'Grok 4.1 Mini', desc: '最新轻量' },
  ]},
];

class AIService {
  constructor() {
    this.profiles = this.loadProfiles();
  }

  // ─── Profile Management ───

  get isConfigured() {
    return this.profiles.length > 0;
  }

  loadProfiles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const profiles = JSON.parse(raw);
        // Migrate old profiles that used OpenAI URL
        return profiles.map(p => {
          if (p.apiUrl && p.apiUrl.includes('api.openai.com')) {
            p.apiUrl = DEFAULT_API_URL;
          }
          return p;
        });
      }
    } catch {}
    // Migrate from old single-config format
    const oldKey = localStorage.getItem('ai_game_api_key');
    if (oldKey) {
      const profile = {
        id: this.generateId(),
        name: localStorage.getItem('ai_game_model') || 'gemini-3-flash',
        apiKey: oldKey,
        apiUrl: DEFAULT_API_URL,
        model: localStorage.getItem('ai_game_model') || 'gemini-3-flash',
      };
      this.profiles = [profile];
      this.saveProfiles();
      localStorage.removeItem('ai_game_api_key');
      localStorage.removeItem('ai_game_api_url');
      localStorage.removeItem('ai_game_model');
      return [profile];
    }
    return [];
  }

  saveProfiles() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
  }

  addProfile(name, apiKey, apiUrl, model) {
    const profile = {
      id: this.generateId(),
      name: name || model || 'Unnamed',
      apiKey,
      apiUrl: apiUrl || DEFAULT_API_URL,
      model: model || 'gemini-3-flash',
    };
    this.profiles.push(profile);
    this.saveProfiles();
    return profile;
  }

  updateProfile(id, data) {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.profiles[idx] = { ...this.profiles[idx], ...data };
      this.saveProfiles();
    }
  }

  removeProfile(id) {
    this.profiles = this.profiles.filter(p => p.id !== id);
    this.saveProfiles();
  }

  getProfile(id) {
    return this.profiles.find(p => p.id === id) || null;
  }

  getDefaultProfile() {
    return this.profiles[0] || null;
  }

  generateId() {
    return 'p_' + Math.random().toString(36).substring(2, 9);
  }

  // ─── Connection Test ───

  /**
   * Test if a profile can successfully connect and get a response
   * @param {string} profileId
   * @returns {Promise<{success: boolean, message: string, latency: number}>}
   */
  async testConnection(profileId) {
    const profile = profileId ? this.getProfile(profileId) : this.getDefaultProfile();
    if (!profile) {
      return { success: false, message: '档案不存在', latency: 0 };
    }

    const startTime = Date.now();

    let targetUrl = profile.apiUrl || DEFAULT_API_URL;
    if (targetUrl.endsWith('/v1') || targetUrl.endsWith('/v1/')) {
      targetUrl = targetUrl.replace(/\/+$/, '') + '/chat/completions';
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${profile.apiKey}`,
          'X-Target-URL': targetUrl,
        },
        body: JSON.stringify({
          model: profile.model,
          messages: [{ role: 'user', content: 'Hi! Please reply with "OK" only.' }],
          temperature: 0,
          max_tokens: 10,
          stream: false,
        }),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errMsg = err.error?.message || `HTTP ${response.status}`;
        return { success: false, message: errMsg, latency };
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) {
        return { success: true, message: `模型响应正常 (${latency}ms)`, latency };
      } else {
        return { success: false, message: '模型返回了空响应', latency };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      if (error.message.includes('Failed to fetch')) {
        return { success: false, message: '网络连接失败，请检查 API 地址', latency };
      }
      return { success: false, message: error.message, latency };
    }
  }

  // ─── Chat API ───

  /**
   * Send a chat completion request using a specific profile
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   * @param {string} [profileId] - which profile to use; defaults to first profile
   * @returns {Promise<string>}
   */
  async chat(messages, options = {}, profileId = null) {
    const profile = profileId ? this.getProfile(profileId) : this.getDefaultProfile();
    if (!profile) {
      throw new Error('请先配置 API 模型档案');
    }

    const { temperature = 0.8, maxTokens = 500 } = options;

    // Build the correct target API URL
    let targetUrl = profile.apiUrl || DEFAULT_API_URL;
    // If user only provided a base URL without /chat/completions, append it
    if (targetUrl.endsWith('/v1') || targetUrl.endsWith('/v1/')) {
      targetUrl = targetUrl.replace(/\/+$/, '') + '/chat/completions';
    }

    try {
      // Route through our local Vite proxy to avoid CORS issues
      // The proxy reads X-Target-URL to know where to forward the request
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${profile.apiKey}`,
          'X-Target-URL': targetUrl,
        },
        body: JSON.stringify({
          model: profile.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败 (${profile.name}): ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (error) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error(`网络连接失败 (${profile.name})，请检查 API 地址和网络`);
      }
      throw error;
    }
  }
}

export const aiService = new AIService();
export default aiService;
