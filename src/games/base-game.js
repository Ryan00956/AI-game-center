/**
 * BaseGame — Shared base class for all games in AI Game Center.
 *
 * Provides common functionality:
 *   - AI player slot rendering & profile binding
 *   - Message system (system / player / private messages)
 *   - Thinking indicator
 *   - User interaction helpers (choice buttons, text input)
 *   - Game layout rendering
 *   - Game-over overlay
 *   - AI call wrapper with error handling
 *
 * Subclasses MUST implement:
 *   - renderSetup()       — render the setup/config screen
 *   - renderPlayerList()   — return HTML string for the player list
 *   - startGame()          — initialize and start gameplay
 *
 * Subclasses CAN override:
 *   - Any method as needed for game-specific behavior
 */
import { aiService } from '../ai-service.js';

// ─── Shared Constants ───
export const AVATARS = ['🧑', '👩', '👨', '🧓', '👴', '👱', '🧔', '👲', '🧕', '👳'];

// Random name pool for AI players
export const AI_NAME_POOL = [
  '小明', '小红', '小刚', '小丽', '小华', '小芳', '小强', '小杰',
  '阿宝', '阿飞', '阿凯', '阿月', '阿星', '阿云', '阿雪', '阿辉',
  '大壮', '大毛', '大勇', '大宝',
  '悟空', '悟净', '悟能', '哪吒', '敖丙',
  '路飞', '鸣人', '柯南', '小兰',
  '豆豆', '团团', '圆圆', '花花', '果果', '糖糖',
  '天天', '乐乐', '欢欢', '安安', '晴晴', '萌萌',
];

// Legacy export for backward compatibility
export const AI_NAMES = AI_NAME_POOL.slice(0, 7);

export const PROFILE_COLORS = [
  '#4f7cff', '#8b5cf6', '#ec4899', '#06b6d4',
  '#10b981', '#f59e0b', '#ef4444', '#f97316',
];

export class BaseGame {
  /**
   * @param {HTMLElement} container - The DOM container to render into
   * @param {import('../app.js').App} app - The main App instance
   */
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.state = 'setup';      // 'setup' | 'playing' | 'gameover' | 'destroyed'
    this.players = [];
    this.messages = [];         // Public message log (AI can read these)
    this.gameResult = null;
    this.playerProfiles = {};   // { slotIndex: profileId }
    this.aiPlayerNames = {};    // { slotIndex: customName }
    this._pendingTimers = [];   // Track setTimeout IDs for cleanup
    this.enableLogging = false; // When true, output full AI prompts/responses to game log
  }

  // ════════════════════════════════════════════
  //  LIFECYCLE
  // ════════════════════════════════════════════

  /**
   * Clean up the game instance. Called by App when navigating away.
   * Cancels all pending timers and marks the instance as destroyed
   * so async callbacks (AI responses, etc.) bail out.
   */
  destroy() {
    this.state = 'destroyed';
    for (const id of this._pendingTimers) {
      clearTimeout(id);
    }
    this._pendingTimers = [];
  }

  /** Wrapper around setTimeout that tracks the timer for cleanup. */
  _setTimeout(fn, ms) {
    const id = setTimeout(() => {
      // Remove from tracking once fired
      this._pendingTimers = this._pendingTimers.filter(t => t !== id);
      // Don't execute if game was destroyed
      if (this.state === 'destroyed') return;
      fn();
    }, ms);
    this._pendingTimers.push(id);
    return id;
  }

  /** Returns true if the game instance has been destroyed. Use after every `await`. */
  _d() {
    return this.state === 'destroyed';
  }

  // ════════════════════════════════════════════
  //  AI PLAYER SLOT RENDERING (Setup Screen)
  // ════════════════════════════════════════════

  /**
   * Initialize default profile assignments and names for AI player slots.
   * Call this in renderSetup() and when player count changes.
   */
  initDefaultProfiles(aiCount) {
    const defaultProfile = aiService.getDefaultProfile();
    const usedNames = new Set(Object.values(this.aiPlayerNames));
    for (let i = 0; i < aiCount; i++) {
      const currentId = this.playerProfiles[i];
      // Fix stale profile IDs: if the saved ID no longer exists, reset to default
      if (!currentId || !aiService.getProfile(currentId)) {
        this.playerProfiles[i] = defaultProfile?.id || '';
      }
      // Assign default names if not set
      if (!this.aiPlayerNames[i]) {
        this.aiPlayerNames[i] = this._pickRandomName(usedNames);
        usedNames.add(this.aiPlayerNames[i]);
      }
    }
  }

  /** Pick a random name from the pool that hasn't been used yet. */
  _pickRandomName(usedNames) {
    const available = AI_NAME_POOL.filter(n => !usedNames.has(n));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
    // Fallback: generate a unique name
    let idx = 1;
    while (usedNames.has(`玩家${idx}`)) idx++;
    return `玩家${idx}`;
  }

  /** Get all current AI names as a Set. */
  _getAllAINames() {
    return new Set(Object.values(this.aiPlayerNames));
  }

  /**
   * Get the AI player name for a given slot index.
   * @param {number} index
   * @returns {string}
   */
  getAIName(index) {
    return this.aiPlayerNames[index] || AI_NAME_POOL[index] || `AI_${index + 1}`;
  }

  /** Randomize all AI player names at once. */
  randomizeAllNames() {
    const usedNames = new Set();
    const count = Object.keys(this.aiPlayerNames).length;
    for (let i = 0; i < count; i++) {
      this.aiPlayerNames[i] = this._pickRandomName(usedNames);
      usedNames.add(this.aiPlayerNames[i]);
    }
  }

  /**
   * Validate that user name doesn't collide with any AI name.
   * @param {string} userName
   * @returns {{ valid: boolean, message?: string }}
   */
  validateNames(userName) {
    const aiNames = Object.values(this.aiPlayerNames);

    // Check user name vs AI names
    if (aiNames.some(n => n === userName)) {
      return { valid: false, message: '你的名字和某个 AI 玩家重名了，请修改' };
    }

    // Check AI name duplicates
    const seen = new Set();
    for (const name of aiNames) {
      if (!name.trim()) {
        return { valid: false, message: 'AI 玩家名字不能为空' };
      }
      if (seen.has(name)) {
        return { valid: false, message: `AI 玩家名字「${name}」重复了，请修改` };
      }
      seen.add(name);
    }

    return { valid: true };
  }

  /**
   * Render AI player assignment slots HTML with editable names.
   * @returns {string} HTML string
   */
  renderAISlots(count, profiles) {
    return Array.from({ length: count }, (_, i) => {
      const name = this.aiPlayerNames[i] || AI_NAME_POOL[i] || `AI_${i + 1}`;
      const selectedId = this.playerProfiles[i] || '';
      const profileIdx = profiles.findIndex(p => p.id === selectedId);
      const color = profileIdx >= 0 ? PROFILE_COLORS[profileIdx % PROFILE_COLORS.length] : '#666';
      return `
        <div class="ai-player-row">
          <div class="player-avatar">${AVATARS[i % AVATARS.length]}</div>
          <div class="ai-name-group">
            <input type="text" class="ai-name-input" id="ai-name-${i}" 
              value="${name}" maxlength="8" placeholder="AI名字" />
            <button class="btn-random-name" id="btn-random-${i}" title="随机名字">🎲</button>
          </div>
          <div class="model-color-indicator" style="background:${color}" id="dot-${i}"></div>
          <select class="form-input" id="profile-select-${i}">
            ${!profiles.length ? '<option value="">无可用模型</option>' : ''}
            ${profiles.map(p =>
              `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name} (${p.model})</option>`
            ).join('')}
          </select>
        </div>`;
    }).join('');
  }

  /** Bind change events for AI profile selectors and name inputs. */
  bindProfileSelectors(count) {
    for (let i = 0; i < count; i++) {
      // Profile selector
      const sel = document.getElementById(`profile-select-${i}`);
      if (sel) {
        sel.addEventListener('change', (e) => {
          this.playerProfiles[i] = e.target.value;
          const idx = aiService.profiles.findIndex(p => p.id === e.target.value);
          const dot = document.getElementById(`dot-${i}`);
          if (dot) {
            dot.style.background = idx >= 0 ? PROFILE_COLORS[idx % PROFILE_COLORS.length] : '#666';
          }
        });
      }

      // Name input
      const nameInput = document.getElementById(`ai-name-${i}`);
      if (nameInput) {
        nameInput.addEventListener('input', (e) => {
          this.aiPlayerNames[i] = e.target.value.trim();
        });
      }

      // Random name button
      const randomBtn = document.getElementById(`btn-random-${i}`);
      if (randomBtn) {
        randomBtn.addEventListener('click', () => {
          const usedNames = this._getAllAINames();
          usedNames.delete(this.aiPlayerNames[i]); // Allow reuse of current name's slot
          const newName = this._pickRandomName(usedNames);
          this.aiPlayerNames[i] = newName;
          const input = document.getElementById(`ai-name-${i}`);
          if (input) input.value = newName;
        });
      }
    }
  }

  // ════════════════════════════════════════════
  //  LOGGING TOGGLE (Setup Screen)
  // ════════════════════════════════════════════

  /**
   * Render the logging toggle HTML for the setup screen.
   * Call this in renderSetup() inside the game-setup div.
   * @returns {string} HTML string
   */
  renderLogToggle() {
    return `
      <div class="setup-section">
        <div class="setup-section-title">📋 调试选项</div>
        <label class="log-toggle-label" for="toggle-logging">
          <div class="log-toggle-switch">
            <input type="checkbox" id="toggle-logging" ${this.enableLogging ? 'checked' : ''} />
            <span class="log-toggle-slider"></span>
          </div>
          <div class="log-toggle-text">
            <span class="log-toggle-title">保存完整日志</span>
            <span class="log-toggle-desc">开启后将在游戏记录中显示 AI 的完整 Prompt、原始回复等调试信息</span>
          </div>
        </label>
      </div>
    `;
  }

  /** Bind the logging toggle event. Call after renderSetup DOM is ready. */
  bindLogToggle() {
    const toggle = document.getElementById('toggle-logging');
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        this.enableLogging = e.target.checked;
      });
    }
  }

  // ════════════════════════════════════════════
  //  GAME LAYOUT (Playing Screen)
  // ════════════════════════════════════════════

  /**
   * Render the standard game layout (header + players panel + game log).
   * Call this from your game's renderGameUI() method.
   *
   * @param {Object} opts
   * @param {string} opts.title      - Game title (e.g. '狼人杀')
   * @param {string} opts.emoji      - Title emoji
   * @param {string} opts.phaseLabel - Initial phase text (e.g. '🌙 夜晚')
   * @param {string} opts.phaseClass - 'night' or 'day'
   */
  renderGameLayout({ title, emoji, phaseLabel, phaseClass = 'day' }) {
    this.container.innerHTML = `
      <div class="game-header">
        <div class="game-header-left">
          <button class="btn-back" id="btn-back">←</button>
          <div class="game-title-area">
            <h2>${emoji} ${title}</h2>
            <span id="game-status-text">游戏进行中</span>
          </div>
        </div>
        <span class="phase-indicator ${phaseClass}" id="phase-badge">${phaseLabel}</span>
      </div>
      <div class="game-area">
        <div class="players-panel" id="players-panel">
          <h4>玩家列表</h4>
          ${this.renderPlayerList()}
        </div>
        <div class="game-log" id="game-log">
          <div class="game-log-header">
            <span>游戏记录</span>
            <span id="round-info">准备中</span>
          </div>
          <div class="game-log-messages" id="game-messages"></div>
          <div id="action-area"></div>
          <div class="game-input-area" id="input-area" style="display:none">
            <div class="game-input-row">
              <input type="text" class="game-input" id="game-input" placeholder="输入你的发言..." disabled />
              <button class="btn-send" id="btn-send" disabled>➤</button>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-back')?.addEventListener('click', () => {
      if (confirm('确定要退出游戏吗？')) this.app.navigate('home');
    });

    // Replay existing messages into the log
    const mc = document.getElementById('game-messages');
    if (mc) {
      this.messages.forEach(m => mc.appendChild(this.createMessageElement(m)));
    }
  }

  /** Update the phase badge text and style. */
  setPhaseIndicator(label, className = 'day') {
    if (this.state === 'destroyed') return;
    const b = document.getElementById('phase-badge');
    if (b) {
      b.className = `phase-indicator ${className}`;
      b.textContent = label;
    }
  }

  /** Update the round info text. */
  setRoundInfo(text) {
    if (this.state === 'destroyed') return;
    const r = document.getElementById('round-info');
    if (r) r.textContent = text;
  }

  /** Refresh the players panel. Calls renderPlayerList() which subclasses implement. */
  updatePlayerList() {
    if (this.state === 'destroyed') return;
    const panel = document.getElementById('players-panel');
    if (panel) panel.innerHTML = `<h4>玩家列表</h4>${this.renderPlayerList()}`;
  }

  /**
   * Override in subclass — return HTML for the player list sidebar.
   * @returns {string}
   */
  renderPlayerList() {
    return '<p style="color:var(--text-muted)">暂无玩家</p>';
  }

  // ════════════════════════════════════════════
  //  MESSAGE SYSTEM
  // ════════════════════════════════════════════

  /** Add a system message (visible to AI via this.messages). */
  addSystemMessage(text, type = '') {
    if (this.state === 'destroyed') return;
    const msg = { type: 'system', text, subtype: type };
    this.messages.push(msg);
    this._appendToLog(msg);
  }

  /** Show a message in UI only — NOT added to this.messages, so AI can't see it. */
  addPrivateMessage(text, type = '') {
    if (this.state === 'destroyed') return;
    const msg = { type: 'system', text, subtype: type, private: true };
    this._appendToLog(msg);
  }

  /** Add a player chat message (visible to AI via this.messages). */
  addPlayerMessage(player, text) {
    if (this.state === 'destroyed') return;
    const msg = { type: 'player', player, text };
    this.messages.push(msg);
    this._appendToLog(msg);
  }

  /** @private Append a message element to the game log DOM. */
  _appendToLog(msg) {
    const container = document.getElementById('game-messages');
    if (container) {
      container.appendChild(this.createMessageElement(msg));
      container.scrollTop = container.scrollHeight;
    }
  }

  /** Create a DOM element for a message. */
  createMessageElement(msg) {
    const el = document.createElement('div');
    el.className = 'msg';
    if (msg.type === 'system') {
      el._logData = {
        kind: msg.private ? 'private-system' : 'system',
        text: msg.text,
        subtype: msg.subtype || '',
      };
    } else {
      el._logData = {
        kind: 'player',
        name: msg.player.name,
        isUser: !!msg.player.isUser,
        modelName: msg.player.modelName || '',
        text: msg.text,
      };
    }
    if (msg.type === 'system') {
      el.innerHTML = `<div class="msg-system ${msg.subtype || ''}">${msg.text}</div>`;
    } else {
      const isUser = msg.player.isUser;
      const badge = !isUser && msg.player.modelName
        ? `<span class="msg-model-badge">${msg.player.modelName}</span>` : '';
      el.innerHTML = `
        <div class="msg-player ${isUser ? 'is-user' : ''}">
          <div class="msg-avatar">${msg.player.avatar}</div>
          <div class="msg-body">
            <div class="msg-name">${msg.player.name}${isUser ? ' (你)' : ''}${badge}</div>
            <div class="msg-text">${msg.text}</div>
          </div>
        </div>`;
    }
    return el;
  }

  // ════════════════════════════════════════════
  //  THINKING INDICATOR
  // ════════════════════════════════════════════

  showThinking(player) {
    const container = document.getElementById('game-messages');
    if (!container) return;
    const modelInfo = player.modelName ? ` (${player.modelName})` : '';
    const el = document.createElement('div');
    el.className = 'msg';
    el.id = 'thinking-indicator';
    el.innerHTML = `
      <div class="thinking-indicator">
        <div class="thinking-dots"><span></span><span></span><span></span></div>
        <span>${player.name}${modelInfo} 正在思考...</span>
      </div>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  hideThinking() {
    document.getElementById('thinking-indicator')?.remove();
  }

  // ════════════════════════════════════════════
  //  AI CALL WRAPPER
  // ════════════════════════════════════════════

  /**
   * Call AI with automatic thinking indicator and error handling.
   *
   * @param {Object} player   - The player object (must have profileId, name, modelName)
   * @param {Array}  messages - Chat messages array for the API
   * @param {Object} [opts]
   * @param {number} [opts.temperature=0.85]
   * @param {number} [opts.maxTokens=200]
   * @param {boolean} [opts.silent=false] - If true, no thinking indicator shown
   * @returns {Promise<string|null>} AI response or null on error
   */
  async callAI(player, messages, opts = {}) {
    const { temperature = 0.85, maxTokens = 200, silent = false } = opts;
    if (this.state === 'destroyed') return null;
    if (!silent) this.showThinking(player);

    // Log the prompt when logging is enabled
    if (this.enableLogging) {
      const promptText = messages.map(m => `[${m.role}]\n${m.content}`).join('\n\n');
      this.addDebugLog(`📤 AI请求 → ${player.name} (${player.modelName || '未知'})`, promptText, {
        temperature, maxTokens,
      });
    }

    try {
      const resp = await aiService.chat(messages, { temperature, maxTokens }, player.profileId);
      if (this.state === 'destroyed') return null;
      if (!silent) this.hideThinking();

      // Log the response when logging is enabled
      if (this.enableLogging) {
        this.addDebugLog(`📥 AI回复 ← ${player.name} (${player.modelName || '未知'})`, resp || '(空回复)');
      }

      return resp;
    } catch (err) {
      if (this.state === 'destroyed') return null;
      if (!silent) this.hideThinking();
      if (!silent) {
        this.addSystemMessage(
          `⚠️ ${player.name} (${player.modelName}) API失败: ${err.message}`, 'danger'
        );
      }
      // Log the error when logging is enabled
      if (this.enableLogging) {
        this.addDebugLog(`❌ AI错误 — ${player.name}`, err.message);
      }
      console.error(`AI ${player.name} error:`, err);
      return null;
    }
  }

  // ════════════════════════════════════════════
  //  USER INTERACTION
  // ════════════════════════════════════════════

  /**
   * Show choice buttons and wait for user to pick one.
   * @param {string} title
   * @param {Array<{id: string|number, label: string}>} options
   * @returns {Promise<string|number>}
   */
  waitForUserChoice(title, options) {
    return new Promise(resolve => {
      const area = document.getElementById('action-area');
      if (!area) return;
      area.innerHTML = `
        <div class="action-panel">
          <h4>${title}</h4>
          <div class="action-buttons">
            ${options.map(o =>
              `<button class="btn-vote ${o.id === 'skip' ? 'skip' : ''}" data-choice="${o.id}">${o.label}</button>`
            ).join('')}
          </div>
        </div>`;
      area.querySelectorAll('.btn-vote').forEach(btn => {
        btn.addEventListener('click', () => {
          const choice = btn.dataset.choice;
          area.querySelectorAll('.btn-vote').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          setTimeout(() => {
            area.innerHTML = '';
            resolve(isNaN(choice) ? choice : parseInt(choice));
          }, 300);
        });
      });
      const mc = document.getElementById('game-messages');
      if (mc) mc.scrollTop = mc.scrollHeight;
    });
  }

  /**
   * Show the text input area and wait for user to submit text.
   * @param {string} [placeholder='输入你的发言...']
   * @returns {Promise<string>}
   */
  waitForUserInput(placeholder = '输入你的发言...') {
    const inputArea = document.getElementById('input-area');
    const input = document.getElementById('game-input');
    const btn = document.getElementById('btn-send');
    if (inputArea) inputArea.style.display = 'block';
    if (input) { input.disabled = false; input.placeholder = placeholder; input.focus(); }
    if (btn) btn.disabled = false;

    return new Promise(resolve => {
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.disabled = true;
        btn.disabled = true;
        resolve(text);
      };
      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  // ════════════════════════════════════════════
  //  DEBUG LOGGING
  // ════════════════════════════════════════════

  /**
   * Add a debug log message to the game log (only shown when enableLogging is true).
   * Renders as a collapsible block so it doesn't clutter the view.
   *
   * @param {string} title   - Short summary line
   * @param {string} detail  - Full content (can be multi-line)
   * @param {Object} [meta]  - Optional key-value pairs to display
   */
  addDebugLog(title, detail, meta = null) {
    if (!this.enableLogging) return;
    if (this.state === 'destroyed') return;

    const container = document.getElementById('game-messages');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'msg msg-debug';
    const rawTitle = String(title ?? '');
    const rawDetail = String(detail ?? '');
    el._logData = {
      kind: 'debug',
      title: rawTitle,
      detail: rawDetail,
      meta: meta ? { ...meta } : null,
    };

    const metaHtml = meta
      ? `<div class="debug-meta">${Object.entries(meta).map(([k, v]) => `<span>${this.escapeHtml(k)}: ${this.escapeHtml(v)}</span>`).join('<span class="debug-meta-separator"> | </span>')}</div>`
      : '';

    // Escape HTML in detail
    const escaped = this.escapeHtml(rawDetail).replace(/\n/g, '<br>');

    el.innerHTML = `
      <div class="debug-log">
        <div class="debug-log-header" onclick="this.parentElement.classList.toggle('expanded')">
          <span class="debug-log-icon">🔍</span>
          <span class="debug-log-title">${this.escapeHtml(rawTitle)}</span>
          <span class="debug-log-toggle">▶</span>
        </div>
        ${metaHtml}
        <div class="debug-log-content">
          <pre>${escaped}</pre>
        </div>
      </div>
    `;

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Convenience method for game subclasses to log arbitrary game events.
   * @param {string} event - Event description
   */
  logEvent(event) {
    if (!this.enableLogging) return;
    this.addDebugLog('📝 游戏事件', event);
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ════════════════════════════════════════════
  //  GAME OVER
  // ════════════════════════════════════════════

  /**
   * Show the game-over overlay with result and action buttons.
   *
   * @param {Object} opts
   * @param {string} opts.icon     - Big emoji (e.g. '🎉' or '😢')
   * @param {string} opts.title    - Heading text
   * @param {string} opts.message  - Result description
   * @param {string} [opts.subtitle] - Extra info line
   * @param {string} [opts.extra]    - Second extra info line
   */
  showGameOver({ icon, title, message, subtitle, extra }) {
    this.state = 'gameover';

    // Re-render player list now that state is 'gameover' so all roles are visible
    this.updatePlayerList();

    // If logging was enabled, add a download log button
    const logBtnHtml = this.enableLogging
      ? `<button class="btn btn-ghost" id="btn-download-log" style="margin-top:8px">📋 下载完整日志</button>`
      : '';

    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    overlay.id = 'game-over';
    overlay.innerHTML = `
      <div class="game-over-card">
        <div class="game-over-icon">${icon}</div>
        <h2>${title}</h2>
        <p>${message}</p>
        ${subtitle ? `<p style="color:var(--text-muted);font-size:13px;">${subtitle}</p>` : ''}
        ${extra ? `<p style="color:var(--text-muted);font-size:12px;margin-top:8px;">${extra}</p>` : ''}
        <div class="game-over-actions" style="margin-top:20px">
          <button class="btn btn-primary" id="btn-play-again">🔄 再来一局</button>
          <button class="btn btn-ghost" id="btn-go-home">🏠 返回大厅</button>
          ${logBtnHtml}
        </div>
      </div>`;

    document.getElementById('app').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      overlay.remove();
      this.state = 'setup';
      this.renderSetup();
    });
    document.getElementById('btn-go-home')?.addEventListener('click', () => {
      overlay.remove();
      this.app.navigate('home');
    });
    document.getElementById('btn-download-log')?.addEventListener('click', () => {
      this.downloadLog();
    });
  }

  /** Download the full game log as a text file. */
  downloadLog() {
    const logEl = document.getElementById('game-messages');
    if (!logEl) return;

    // Collect all text content from the game log, including debug entries
    const lines = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    lines.push(`=== AI Game Center 完整日志 ===`);
    lines.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`);
    lines.push(`========================\n`);

    // Iterate through all messages in the log
    for (const child of logEl.children) {
      const record = child._logData;
      if (!record) continue;

      if (record.kind === 'debug') {
        lines.push(`[DEBUG] ${record.title}`);
        if (record.meta) {
          lines.push(`  ${Object.entries(record.meta).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
        }
        lines.push(record.detail);
        lines.push('');
        continue;
      }

      if (record.kind === 'private-system') {
        lines.push(`[仅你可见] ${record.text}`);
        continue;
      }

      if (record.kind === 'system') {
        lines.push(`[系统] ${record.text}`);
        continue;
      }

      if (record.kind === 'player') {
        const suffix = record.isUser ? ' (你)' : '';
        lines.push(`[${record.name}${suffix}] ${record.text}`);
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-log-${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ════════════════════════════════════════════
  //  UTILITIES
  // ════════════════════════════════════════════

  sleep(ms) {
    return new Promise(resolve => this._setTimeout(resolve, ms));
  }
}
