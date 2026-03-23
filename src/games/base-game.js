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
export const AVATARS = ['🧑', '👩', '👨', '🧓', '👴', '👱', '🧔', '👲'];
export const AI_NAMES = ['小明', '小红', '小刚', '小丽', '小华', '小芳', '小强'];
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
    this._pendingTimers = [];   // Track setTimeout IDs for cleanup
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
   * Initialize default profile assignments for AI player slots.
   * Call this in renderSetup() and when player count changes.
   */
  initDefaultProfiles(aiCount) {
    const defaultProfile = aiService.getDefaultProfile();
    for (let i = 0; i < aiCount; i++) {
      const currentId = this.playerProfiles[i];
      // Fix stale profile IDs: if the saved ID no longer exists, reset to default
      if (!currentId || !aiService.getProfile(currentId)) {
        this.playerProfiles[i] = defaultProfile?.id || '';
      }
    }
  }

  /**
   * Render AI player assignment slots HTML.
   * @returns {string} HTML string
   */
  renderAISlots(count, profiles) {
    return AI_NAMES.slice(0, count).map((name, i) => {
      const selectedId = this.playerProfiles[i] || '';
      const profileIdx = profiles.findIndex(p => p.id === selectedId);
      const color = profileIdx >= 0 ? PROFILE_COLORS[profileIdx % PROFILE_COLORS.length] : '#666';
      return `
        <div class="ai-player-row">
          <div class="player-avatar">${AVATARS[i % AVATARS.length]}</div>
          <span class="player-name">${name}</span>
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

  /** Bind change events for AI profile selectors. */
  bindProfileSelectors(count) {
    for (let i = 0; i < count; i++) {
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
    const msg = { type: 'system', text, subtype: type };
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
    try {
      const resp = await aiService.chat(messages, { temperature, maxTokens }, player.profileId);
      if (this.state === 'destroyed') return null;
      if (!silent) this.hideThinking();
      return resp;
    } catch (err) {
      if (this.state === 'destroyed') return null;
      if (!silent) this.hideThinking();
      if (!silent) {
        this.addSystemMessage(
          `⚠️ ${player.name} (${player.modelName}) API失败: ${err.message}`, 'danger'
        );
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
  }

  // ════════════════════════════════════════════
  //  UTILITIES
  // ════════════════════════════════════════════

  sleep(ms) {
    return new Promise(resolve => this._setTimeout(resolve, ms));
  }
}
