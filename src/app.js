/**
 * App - Main application controller with routing and page management.
 *
 * Games are loaded dynamically from the game registry.
 * To add a new game, create a file in src/games/ and call registerGame().
 * No changes to this file are needed.
 */
import { aiService, AVAILABLE_MODELS } from './ai-service.js';
import { getAllGames } from './game-registry.js';

export class App {
  constructor() {
    this.currentPage = 'home';
    this.currentGame = null;
    this.root = null;
  }

  mount(root) {
    this.root = root;
    this.render();
  }

  navigate(page) {
    this.currentPage = page;
    if (this.currentGame) {
      this.currentGame.destroy();
      this.currentGame = null;
    }
    this.render();
  }

  render() {
    this.root.innerHTML = '';
    this.root.appendChild(this.createBackground());
    this.root.appendChild(this.createNavbar());
    this.root.appendChild(this.createToastContainer());

    if (this.currentPage === 'home') {
      this.root.appendChild(this.createHomePage());
    } else {
      // Look up game from registry
      const game = getAllGames().find(g => g.id === this.currentPage);
      if (game) {
        this.renderGame(game);
      }
    }

    this.root.appendChild(this.createSettingsModal());
  }

  // ─── Background ───
  createBackground() {
    const bg = document.createElement('div');
    bg.innerHTML = `
      <div class="bg-animation">
        <div class="bg-orb"></div>
        <div class="bg-orb"></div>
        <div class="bg-orb"></div>
      </div>
      <div class="bg-grid"></div>
    `;
    const frag = document.createDocumentFragment();
    while (bg.firstChild) frag.appendChild(bg.firstChild);
    return frag;
  }

  // ─── Navbar (dynamic from registry) ───
  createNavbar() {
    const nav = document.createElement('nav');
    nav.className = 'navbar';
    nav.id = 'navbar';
    const connected = aiService.isConfigured;
    const profileCount = aiService.profiles.length;
    const games = getAllGames();

    const gameButtons = games.map(g =>
      `<button class="nav-btn ${this.currentPage === g.id ? 'active' : ''}" id="nav-${g.id}-btn">${g.name}</button>`
    ).join('');

    nav.innerHTML = `
      <div class="navbar-inner">
        <a class="navbar-brand" id="nav-home">
          <span class="navbar-logo">🎮</span>
          <span class="navbar-title">AI 游戏大厅</span>
        </a>
        <div class="navbar-nav">
          <button class="nav-btn ${this.currentPage === 'home' ? 'active' : ''}" id="nav-home-btn">首页</button>
          ${gameButtons}
          <button class="btn-settings" id="btn-settings">
            <span class="dot ${connected ? 'connected' : ''}"></span>
            模型配置 ${profileCount > 0 ? `(${profileCount})` : ''}
          </button>
        </div>
      </div>
    `;

    setTimeout(() => {
      document.getElementById('nav-home')?.addEventListener('click', () => this.navigate('home'));
      document.getElementById('nav-home-btn')?.addEventListener('click', () => this.navigate('home'));
      games.forEach(g => {
        document.getElementById(`nav-${g.id}-btn`)?.addEventListener('click', () => this.navigate(g.id));
      });
      document.getElementById('btn-settings')?.addEventListener('click', () => this.showSettings());
    }, 0);

    return nav;
  }

  // ─── Toast Container ───
  createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    return container;
  }

  // ─── Settings Modal (Multi-Profile) ───
  createSettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'settings-modal';
    overlay.innerHTML = `
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>⚙️ 模型配置</h2>
          <button class="modal-close" id="settings-close">✕</button>
        </div>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
          添加多个 AI 模型档案，在游戏中为不同角色分配不同的模型，观看不同 AI 的对战！
        </p>
        <div id="profiles-list"></div>
        <button class="btn btn-ghost btn-block" id="btn-add-profile" style="margin-top:12px;">
          ＋ 添加新模型档案
        </button>
      </div>
    `;

    setTimeout(() => {
      document.getElementById('settings-close')?.addEventListener('click', () => this.hideSettings());
      document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') this.hideSettings();
      });
      document.getElementById('btn-add-profile')?.addEventListener('click', () => {
        this.showProfileEditor(null);
      });
      this.renderProfilesList();
    }, 0);

    return overlay;
  }

  renderProfilesList() {
    const container = document.getElementById('profiles-list');
    if (!container) return;

    if (aiService.profiles.length === 0) {
      container.innerHTML = `
        <div class="empty-profiles">
          <p style="color:var(--text-muted);text-align:center;padding:20px 0;">
            还没有配置任何模型<br>
            <span style="font-size:12px;">点击下方按钮添加你的第一个 AI 模型</span>
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = aiService.profiles.map((p, i) => `
      <div class="profile-card" data-profile-id="${p.id}">
        <div class="profile-card-left">
          <div class="profile-color-dot" style="background:${this.getProfileColor(i)}"></div>
          <div class="profile-info">
            <div class="profile-name">${p.name}</div>
            <div class="profile-detail">${p.model} · ${this.shortenUrl(p.apiUrl)}</div>
          </div>
        </div>
        <div class="profile-card-actions">
          <button class="btn-icon btn-edit-profile" data-id="${p.id}" title="编辑">✏️</button>
          <button class="btn-icon btn-delete-profile" data-id="${p.id}" title="删除">🗑️</button>
        </div>
      </div>
    `).join('');

    // Bind events
    container.querySelectorAll('.btn-edit-profile').forEach(btn => {
      btn.addEventListener('click', () => {
        const profile = aiService.getProfile(btn.dataset.id);
        if (profile) this.showProfileEditor(profile);
      });
    });
    container.querySelectorAll('.btn-delete-profile').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('确定删除这个模型档案吗？')) {
          aiService.removeProfile(btn.dataset.id);
          this.renderProfilesList();
          this.updateSettingsButton();
          this.showToast('档案已删除', 'success');
        }
      });
    });
  }

  showProfileEditor(existingProfile) {
    const isEdit = !!existingProfile;
    const container = document.getElementById('profiles-list');
    if (!container) return;


    // Insert editor form at the top
    const editorId = 'profile-editor';
    document.getElementById(editorId)?.remove();

    // Build model options HTML
    const modelOptionsHtml = AVAILABLE_MODELS.map(group => 
      `<optgroup label="${group.group}">
        ${group.models.map(m => 
          `<option value="${m.id}" ${isEdit && existingProfile.model === m.id ? 'selected' : ''}>${m.name} — ${m.desc}</option>`
        ).join('')}
      </optgroup>`
    ).join('');

    const editor = document.createElement('div');
    editor.id = editorId;
    editor.className = 'profile-editor';
    editor.innerHTML = `
      <h4 style="font-size:14px;margin-bottom:12px;">${isEdit ? '✏️ 编辑模型' : '✨ 添加新模型'}</h4>
      <div class="form-group">
        <label class="form-label">档案名称 *</label>
        <input type="text" class="form-input" id="pe-name" placeholder="例: Gemini Flash / Claude Sonnet" 
          value="${isEdit ? existingProfile.name : ''}" />
        <p class="form-hint">给这个模型取个好记的名字</p>
      </div>
      <div class="form-group">
        <label class="form-label">API 密钥 *</label>
        <input type="password" class="form-input" id="pe-key" placeholder="sk-..." 
          value="${isEdit ? existingProfile.apiKey : ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">API 地址</label>
        <input type="text" class="form-input" id="pe-url" 
          placeholder="https://llm.xiaochisaas.com/v1/chat/completions" 
          value="${isEdit ? existingProfile.apiUrl : 'https://llm.xiaochisaas.com/v1/chat/completions'}" />
        <p class="form-hint">默认使用小弛SaaS，也支持其他 OpenAI 兼容接口</p>
      </div>
      <div class="form-group">
        <label class="form-label">选择模型 *</label>
        <select class="form-input" id="pe-model-select">
          <option value="">-- 选择模型 --</option>
          ${modelOptionsHtml}
          <option value="__custom__">✏️ 自定义模型名称...</option>
        </select>
      </div>
      <div class="form-group" id="pe-custom-model-group" style="display:none">
        <label class="form-label">自定义模型名称</label>
        <input type="text" class="form-input" id="pe-model-custom" placeholder="输入模型名称" 
          value="" />
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary" id="pe-save">${isEdit ? '保存修改' : '添加档案'}</button>
        <button class="btn btn-ghost" id="pe-cancel">取消</button>
      </div>
    `;

    container.parentNode.insertBefore(editor, container);

    // If editing and model is not in the list, show custom field
    const selectEl = document.getElementById('pe-model-select');
    const customGroup = document.getElementById('pe-custom-model-group');
    const customInput = document.getElementById('pe-model-custom');

    if (isEdit) {
      const found = selectEl.querySelector(`option[value="${existingProfile.model}"]`);
      if (found) {
        selectEl.value = existingProfile.model;
      } else {
        selectEl.value = '__custom__';
        customGroup.style.display = 'block';
        customInput.value = existingProfile.model;
      }
    }

    // Auto-fill name from model selection
    selectEl.addEventListener('change', () => {
      if (selectEl.value === '__custom__') {
        customGroup.style.display = 'block';
        customInput.focus();
      } else {
        customGroup.style.display = 'none';
        // Auto-fill name if empty
        const nameInput = document.getElementById('pe-name');
        if (!nameInput.value.trim() && selectEl.value) {
          const selectedOption = selectEl.options[selectEl.selectedIndex];
          nameInput.value = selectedOption.text.split(' — ')[0];
        }
      }
    });

    document.getElementById('pe-cancel').addEventListener('click', () => editor.remove());
    document.getElementById('pe-save').addEventListener('click', () => {
      const name = document.getElementById('pe-name').value.trim();
      const key = document.getElementById('pe-key').value.trim();
      const url = document.getElementById('pe-url').value.trim();
      const modelSelect = document.getElementById('pe-model-select').value;
      const modelCustom = document.getElementById('pe-model-custom').value.trim();
      const model = modelSelect === '__custom__' ? modelCustom : modelSelect;

      if (!name) { this.showToast('请输入档案名称', 'error'); return; }
      if (!key) { this.showToast('请输入 API 密钥', 'error'); return; }
      if (!model) { this.showToast('请选择或输入模型名称', 'error'); return; }

      if (isEdit) {
        aiService.updateProfile(existingProfile.id, { name, apiKey: key, apiUrl: url, model });
        this.showToast('档案已更新 ✓', 'success');
      } else {
        aiService.addProfile(name, key, url, model);
        this.showToast('档案已添加 ✓', 'success');
      }

      editor.remove();
      this.renderProfilesList();
      this.updateSettingsButton();
    });
  }

  updateSettingsButton() {
    const btn = document.querySelector('.btn-settings');
    if (!btn) return;
    const dot = btn.querySelector('.dot');
    const count = aiService.profiles.length;
    if (dot) {
      dot.classList.toggle('connected', count > 0);
    }
    btn.childNodes[btn.childNodes.length - 1].textContent = ` 模型配置 ${count > 0 ? `(${count})` : ''}`;
  }

  getProfileColor(index) {
    const colors = ['#4f7cff', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#f97316'];
    return colors[index % colors.length];
  }

  shortenUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return url.substring(0, 30);
    }
  }

  showSettings() {
    document.getElementById('settings-modal')?.classList.add('active');
    this.renderProfilesList();
  }

  hideSettings() {
    document.getElementById('settings-modal')?.classList.remove('active');
    document.getElementById('profile-editor')?.remove();
  }

  // ─── Toast Notifications ───
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ─── Home Page (dynamic from registry) ───
  createHomePage() {
    const games = getAllGames();
    const page = document.createElement('div');

    const gameCards = games.map(g => `
      <div class="game-card ${g.id}" id="card-${g.id}">
        <div class="game-card-bg"></div>
        <div class="game-card-content">
          <span class="game-card-icon">${g.icon}</span>
          <span class="game-card-tag">${g.tag}</span>
          <h3>${g.name}</h3>
          <p>${g.description}</p>
          <div class="game-card-meta">
            <span>👥 ${g.playerRange}</span>
            <span>⏱ ${g.duration}</span>
            <span>${g.features}</span>
          </div>
        </div>
        <div class="game-card-arrow">→</div>
      </div>
    `).join('');

    page.innerHTML = `
      <section class="hero container">
        <div class="hero-badge">
          <span class="pulse"></span>
          AI 驱动 · 多模型对战
        </div>
        <h1>
          与 <span class="gradient-text">AI</span> 一起玩<br>
          社交推理游戏
        </h1>
        <p class="hero-subtitle">
          配置多个 AI 模型，为每个角色分配不同的大模型，<br>
          观看 GPT、DeepSeek、GLM 等模型之间的精彩对决！
        </p>
      </section>

      <section class="container">
        <div class="games-grid" id="games-grid">
          ${gameCards}
        </div>
      </section>
    `;

    setTimeout(() => {
      games.forEach(g => {
        document.getElementById(`card-${g.id}`)?.addEventListener('click', () => {
          if (!aiService.isConfigured) {
            this.showToast('请先在「模型配置」中添加至少一个 AI 模型', 'error');
            this.showSettings();
            return;
          }
          this.navigate(g.id);
        });
      });
    }, 0);

    return page;
  }

  // ─── Game Page (dynamic from registry) ───
  renderGame(gameConfig) {
    const container = document.createElement('div');
    container.className = 'game-page';
    container.innerHTML = `<div class="container" id="game-container"></div>`;
    this.root.appendChild(container);

    setTimeout(() => {
      const gc = document.getElementById('game-container');
      if (!gc) return;
      this.currentGame = new gameConfig.GameClass(gc, this);
    }, 0);
  }
}
