/**
 * Werewolf Game (狼人杀) — Full AI Version
 *
 * All AI decisions are made via API calls with complete context.
 * Each AI maintains private memory of role-specific information.
 *
 * Night: Wolf vote (with discussion + re-vote on tie), Seer check, Witch decision, Hunter shot
 * Day: 2 rounds of discussion + vote (re-vote on tie with extra discussion)
 */
import { aiService } from '../ai-service.js';
import { registerGame } from '../game-registry.js';
import { BaseGame, AVATARS, AI_NAMES } from './base-game.js';

const ROLE_INFO = {
  werewolf: { name: '狼人', emoji: '🐺', color: 'werewolf', team: 'wolf' },
  villager: { name: '村民', emoji: '👤', color: 'villager', team: 'village' },
  seer:     { name: '预言家', emoji: '🔮', color: 'seer', team: 'village' },
  witch:    { name: '女巫', emoji: '🧙', color: 'witch', team: 'village' },
  hunter:   { name: '猎人', emoji: '🏹', color: 'hunter', team: 'village' },
};

export class WerewolfGame extends BaseGame {
  constructor(container, app) {
    super(container, app);
    this.dayCount = 0;
    this.phase = 'night';
    this.witchHealUsed = false;
    this.witchPoisonUsed = false;
    this.nightKillTarget = null;
    this.nightPoisonTarget = null;
    this.userName = '';
    this.playerCount = 7;
    this.renderSetup();
  }

  // ════════════════════════════════════════════
  //  SETUP
  // ════════════════════════════════════════════

  renderSetup() {
    const profiles = aiService.profiles;
    const aiCount = this.playerCount - 1;
    this.initDefaultProfiles(aiCount);

    this.container.innerHTML = `
      <div class="game-header">
        <div class="game-header-left">
          <button class="btn-back" id="btn-back">←</button>
          <div class="game-title-area"><h2>🐺 狼人杀</h2><span>设置你的游戏参数</span></div>
        </div>
      </div>
      <div class="game-setup">
        <h3>🎮 游戏设置</h3>
        <div class="setup-section">
          <div class="setup-section-title">玩家信息</div>
          <div class="form-group">
            <label class="form-label">你的名字</label>
            <input type="text" class="form-input" id="input-player-name" placeholder="输入你的游戏名字" value="${this.userName || ''}" maxlength="8" />
          </div>
        </div>
        <div class="setup-section">
          <div class="setup-section-title">游戏人数</div>
          <div class="form-group">
            <label class="form-label">总玩家数 (包含你自己)</label>
            <select class="form-input" id="select-player-count">
              <option value="6" ${this.playerCount === 6 ? 'selected' : ''}>6人 (2狼 + 预言家 + 女巫 + 2村民)</option>
              <option value="7" ${this.playerCount === 7 ? 'selected' : ''}>7人 (2狼 + 预言家 + 女巫 + 猎人 + 2村民)</option>
              <option value="8" ${this.playerCount === 8 ? 'selected' : ''}>8人 (2狼 + 预言家 + 女巫 + 猎人 + 3村民)</option>
            </select>
          </div>
        </div>
        <div class="setup-section">
          <div class="setup-section-title">🤖 AI 玩家模型分配</div>
          <p class="form-hint" style="margin-bottom:12px;">为每个 AI 玩家分配不同的大模型</p>
          <div class="ai-player-list" id="ai-player-list">${this.renderAISlots(aiCount, profiles)}</div>
          ${profiles.length === 0 ? '<p class="form-hint" style="margin-top:8px;color:var(--accent-orange);">⚠️ 请先在右上角「模型配置」中添加模型</p>' : ''}
        </div>
        <button class="btn btn-primary btn-block" id="btn-start-game" style="margin-top:8px">🎲 开始游戏</button>
      </div>
    `;

    document.getElementById('btn-back')?.addEventListener('click', () => this.app.navigate('home'));
    document.getElementById('select-player-count')?.addEventListener('change', (e) => {
      this.playerCount = parseInt(e.target.value);
      const n = this.playerCount - 1;
      this.initDefaultProfiles(n);
      document.getElementById('ai-player-list').innerHTML = this.renderAISlots(n, aiService.profiles);
      this.bindProfileSelectors(n);
    });
    this.bindProfileSelectors(aiCount);
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      const name = document.getElementById('input-player-name').value.trim();
      if (!name) { this.app.showToast('请输入你的名字', 'error'); return; }
      if (!aiService.profiles.length) { this.app.showToast('请先添加 AI 模型', 'error'); return; }
      this.userName = name;
      this.playerCount = parseInt(document.getElementById('select-player-count').value);
      this.startGame();
    });
  }

  // ════════════════════════════════════════════
  //  GAME INIT
  // ════════════════════════════════════════════

  startGame() {
    this.state = 'playing';
    this.dayCount = 0;
    this.messages = [];
    this.witchHealUsed = false;
    this.witchPoisonUsed = false;
    this.nightKillTarget = null;
    this.nightPoisonTarget = null;
    this.gameResult = null;

    const roles = this.generateRoles(this.playerCount);
    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const aiNames = AI_NAMES.slice(0, this.playerCount - 1);
    const userPos = Math.floor(Math.random() * this.playerCount);

    this.players = [];
    let aiIdx = 0;
    for (let i = 0; i < this.playerCount; i++) {
      if (i === userPos) {
        this.players.push({
          id: i, name: this.userName, isUser: true, role: roles[i],
          alive: true, avatar: '🎮', profileId: null,
          privateMemory: [],
        });
      } else {
        const profileId = this.playerProfiles[aiIdx] || aiService.getDefaultProfile()?.id || null;
        const profile = aiService.getProfile(profileId);
        this.players.push({
          id: i, name: aiNames[aiIdx], isUser: false, role: roles[i],
          alive: true, avatar: AVATARS[aiIdx % AVATARS.length],
          profileId, modelName: profile?.name || profile?.model || '未知',
          privateMemory: [],
        });
        aiIdx++;
      }
    }

    // Initialize private memories
    for (const p of this.players) {
      if (p.role === 'werewolf') {
        const teammates = this.players.filter(q => q.role === 'werewolf' && q.id !== p.id);
        p.privateMemory.push(`你的身份是【狼人】。你的狼人同伴是：${teammates.map(t => t.name).join('、')}。你们需要在夜晚商议并投票选择猎杀目标，白天伪装成好人。`);
      } else if (p.role === 'seer') {
        p.privateMemory.push('你的身份是【预言家】。每晚你可以查验一名玩家的身份（好人/狼人）。你需要决定何时公开查验结果。');
      } else if (p.role === 'witch') {
        p.privateMemory.push('你的身份是【女巫】。你有一瓶解药（救人）和一瓶毒药（杀人），各只能用一次。每晚你会得知谁被狼人杀了。');
      } else if (p.role === 'hunter') {
        p.privateMemory.push('你的身份是【猎人】。当你死亡时，你可以开枪带走一名玩家。');
      } else {
        p.privateMemory.push('你的身份是【村民】。你没有特殊技能，但你的投票和分析对好人阵营至关重要。');
      }
    }

    this.renderGameUI();
    this.addSystemMessage('游戏开始！所有玩家已就位。');
    this.addPrivateMessage(`你的身份是：${ROLE_INFO[this.user.role].emoji} ${ROLE_INFO[this.user.role].name}`, 'important');
    if (this.user.role === 'werewolf') {
      const mates = this.players.filter(p => p.role === 'werewolf' && !p.isUser);
      if (mates.length) this.addPrivateMessage(`你的狼人同伴是: ${mates.map(p => p.name).join(', ')}`, 'important');
    }

    this._setTimeout(() => this.startNight(), 1500);
  }

  generateRoles(n) {
    if (n === 6) return ['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'];
    if (n === 7) return ['werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager'];
    return ['werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'];
  }

  get user() { return this.players.find(p => p.isUser); }
  get alive() { return this.players.filter(p => p.alive); }
  get aliveWolves() { return this.players.filter(p => p.alive && p.role === 'werewolf'); }
  get aliveVillagers() { return this.players.filter(p => p.alive && p.role !== 'werewolf'); }

  // ════════════════════════════════════════════
  //  GAME UI
  // ════════════════════════════════════════════

  renderGameUI() {
    this.renderGameLayout({
      title: '狼人杀',
      emoji: '🐺',
      phaseLabel: this.phase === 'night' ? '🌙 夜晚' : '☀️ 白天',
      phaseClass: this.phase === 'night' ? 'night' : 'day',
    });
  }

  renderPlayerList() {
    return this.players.map(p => {
      const ri = ROLE_INFO[p.role];
      const showRole = !p.alive || p.isUser || this.state === 'gameover';
      return `<div class="player-item ${p.alive ? '' : 'eliminated'} ${p.isUser ? 'is-user' : ''}">
        <div class="player-avatar">${p.avatar}</div>
        <span class="player-name">${p.name}${p.isUser ? ' (你)' : ''}</span>
        ${!p.isUser && p.modelName ? `<span class="player-model-tag">${p.modelName}</span>` : ''}
        ${showRole ? `<span class="player-role-badge ${ri.color}">${ri.emoji}</span>` : ''}
        ${!p.alive ? '<span style="font-size:11px;color:var(--accent-red)">💀</span>' : ''}
      </div>`;
    }).join('');
  }

  setPhase(phase, label) {
    this.phase = phase;
    this.setPhaseIndicator(label, phase.includes('night') ? 'night' : 'day');
    this.setRoundInfo(`第 ${this.dayCount} 轮`);
  }

  // ════════════════════════════════════════════
  //  CONTEXT BUILDING (core of AI quality)
  // ════════════════════════════════════════════

  /** Build complete context for an AI player */
  buildContext(player, situationPrompt) {
    const ri = ROLE_INFO[player.role];
    const dead = this.players.filter(p => !p.alive);
    const publicLog = this.messages.slice(-40).map(m => {
      if (m.type === 'system') return `[系统] ${m.text}`;
      return `[${m.player.name}] ${m.text}`;
    }).join('\n');

    const system = `你正在玩一局狼人杀游戏。你的名字是"${player.name}"。

【你的身份信息】
${player.privateMemory.join('\n')}

【当前游戏状态】
- 当前是第 ${this.dayCount} 天
- 存活玩家（${this.alive.length}人）：${this.alive.map(p => p.name).join('、')}
- 已死亡玩家：${dead.length > 0 ? dead.map(p => `${p.name}(${ROLE_INFO[p.role].name})`).join('、') : '无'}
${player.role === 'witch' ? `- 解药状态：${this.witchHealUsed ? '已使用' : '未使用'}\n- 毒药状态：${this.witchPoisonUsed ? '已使用' : '未使用'}` : ''}

【重要规则】
- 像真人一样自然说话，用中文，1-3句即可
- 不要暴露你是AI
- 不要直接说出自己的身份（除非你是预言家且决定跳预言家）
- 发言要有策略性，要引用其他人说的话、分析别人的行为
${player.role === 'werewolf' ? '- 你是狼人！绝对不能暴露身份。你可以栽赃好人、假装好人、质疑预言家的真假。' : ''}
${player.role === 'seer' ? '- 你是预言家，你可以选择时机公开查验结果，但要注意暴露后可能被狼人针对。' : ''}`;

    return [
      { role: 'system', content: system },
      { role: 'user', content: `【公开的游戏记录】\n${publicLog}\n\n${situationPrompt}` },
    ];
  }

  /** Call AI with context building + error handling */
  async aiCall(player, situationPrompt, opts = {}) {
    const messages = this.buildContext(player, situationPrompt);
    return this.callAI(player, messages, opts);
  }

  // ════════════════════════════════════════════
  //  NIGHT PHASE
  // ════════════════════════════════════════════

  async startNight() {
    this.dayCount++;
    this.setPhase('night', `🌙 第${this.dayCount}夜`);
    this.addSystemMessage(`🌙 第 ${this.dayCount} 个夜晚降临了...`, 'important');
    await this.sleep(1000);
    if (this._d()) return;

    await this.wolfNight();
    if (this._d()) return;
    await this.seerNight();
    if (this._d()) return;
    await this.witchNight();
    if (this._d()) return;
    await this.resolveNight();
  }

  // ── Wolf Night: discuss + vote (hidden from non-wolf users) ──

  async wolfNight() {
    const wolves = this.aliveWolves;
    const targets = this.alive.filter(p => p.role !== 'werewolf');
    if (!targets.length) return;

    const userIsWolf = wolves.some(p => p.isUser);

    // Non-wolves only see a generic message
    if (!userIsWolf) {
      this.addSystemMessage('🌙 夜晚进行中...');
    } else {
      this.addPrivateMessage('🐺 狼人请睁眼...');
    }
    await this.sleep(500);
    if (this._d()) return;

    let resolved = false;
    let attempt = 0;

    while (!resolved && attempt < 3) {
      attempt++;
      const isRetry = attempt > 1;

      if (userIsWolf) {
        // ── User is wolf: discuss + vote ──
        const wolfChat = [];
        for (const wolf of wolves.filter(p => !p.isUser)) {
          const situation = isRetry
            ? `上一轮投票平票了，你们需要重新讨论。请重新分析，提出你认为今晚应该猎杀的目标（从以下存活好人中选择：${targets.filter(t => t.alive).map(t => t.name).join('、')}），并说明理由。${wolfChat.length ? '\n同伴的发言：\n' + wolfChat.join('\n') : ''}`
            : `现在是狼人商议时间。请分析当前局势，提出你认为今晚应该猎杀的目标（从以下存活好人中选择：${targets.filter(t => t.alive).map(t => t.name).join('、')}），并说明你的理由。注意：这是狼人之间的私密对话。${wolfChat.length ? '\n同伴的发言：\n' + wolfChat.join('\n') : ''}`;
          const resp = await this.aiCall(wolf, situation);
          if (this._d()) return;
          if (resp) {
            this.addPrivateMessage(`🐺 ${wolf.name}（队友）：${resp}`);
            wolfChat.push(`${wolf.name}：${resp}`);
            wolf.privateMemory.push(`第${this.dayCount}夜商议 - 你说：${resp}`);
          }
        }
        // All wolves vote (including user)
        this.addPrivateMessage('🐺 请投票选择今晚要猎杀的目标');
        const userPick = await this.waitForUserChoice('投票猎杀目标', targets.filter(t => t.alive).map(t => ({ id: t.id, label: `${t.avatar} ${t.name}` })));
        if (this._d()) return;
        const votes = { [this.user.id]: userPick };
        for (const wolf of wolves.filter(p => !p.isUser)) {
          const votePrompt = `现在狼人要投票决定猎杀目标。之前的讨论：\n${wolfChat.join('\n')}\n\n候选目标：${targets.filter(t => t.alive).map(t => t.name).join('、')}\n\n请只回复一个你要猎杀的玩家名字，不要说别的：`;
          const resp = await this.aiCall(wolf, votePrompt, { temperature: 0.3, maxTokens: 20, silent: true });
          if (this._d()) return;
          if (resp) {
            const vt = targets.filter(t => t.alive).find(t => resp.includes(t.name));
            if (vt) votes[wolf.id] = vt.id;
          }
          if (!votes[wolf.id]) {
            const fb = targets.filter(t => t.alive);
            votes[wolf.id] = fb[Math.floor(Math.random() * fb.length)].id;
          }
        }
        // Tally
        const tally = {};
        Object.values(votes).forEach(id => tally[id] = (tally[id] || 0) + 1);
        const maxV = Math.max(...Object.values(tally));
        const tied = Object.entries(tally).filter(([, v]) => v === maxV);
        if (tied.length === 1) {
          this.nightKillTarget = this.players[parseInt(tied[0][0])];
          this.addPrivateMessage(`🐺 投票一致，决定猎杀 ${this.nightKillTarget.name}`);
          for (const w of wolves) w.privateMemory.push(`第${this.dayCount}夜 - 狼人投票决定猎杀${this.nightKillTarget.name}`);
          resolved = true;
        } else {
          this.addPrivateMessage(`🐺 投票平票！${attempt < 3 ? '需要重新商议' : ''}`, 'important');
          for (const w of wolves) w.privateMemory.push(`第${this.dayCount}夜 - 狼人投票平票，需要重新商议`);
        }
      } else {
        // ── All AI wolves: discuss silently, then vote ──
        const wolfChat = [];
        for (const wolf of wolves) {
          const situation = isRetry
            ? `上一轮投票平票了。请重新考虑并提出猎杀目标（候选：${targets.filter(t => t.alive).map(t => t.name).join('、')}）。简短说明理由。之前的讨论：\n${wolfChat.join('\n')}`
            : `现在是狼人商议时间。你的同伴是${wolves.filter(w => w.id !== wolf.id).map(w => w.name).join('、')}。请分析局势，提出猎杀目标（候选：${targets.filter(t => t.alive).map(t => t.name).join('、')}）。简短说明理由。${wolfChat.length ? '\n同伴的发言：\n' + wolfChat.join('\n') : ''}`;
          const resp = await this.aiCall(wolf, situation, { silent: true });
          if (this._d()) return;
          if (resp) {
            wolfChat.push(`${wolf.name}：${resp}`);
            wolf.privateMemory.push(`第${this.dayCount}夜商议 - 你说：${resp}`);
          }
        }

        // Wolves vote (silently)
        const votes = {};
        for (const wolf of wolves) {
          const votePrompt = `现在狼人要投票决定猎杀目标。之前的讨论：\n${wolfChat.join('\n')}\n\n候选目标：${targets.filter(t => t.alive).map(t => t.name).join('、')}\n\n请只回复一个你要猎杀的玩家名字，不要说别的：`;
          const resp = await this.aiCall(wolf, votePrompt, { temperature: 0.3, maxTokens: 20, silent: true });
          if (this._d()) return;
          if (resp) {
            const target = targets.filter(t => t.alive).find(t => resp.includes(t.name));
            if (target) votes[wolf.id] = target.id;
          }
          if (!votes[wolf.id]) {
            const fallback = targets.filter(t => t.alive);
            votes[wolf.id] = fallback[Math.floor(Math.random() * fallback.length)].id;
          }
        }

        // Tally
        const tally = {};
        Object.values(votes).forEach(id => tally[id] = (tally[id] || 0) + 1);
        const maxV = Math.max(...Object.values(tally));
        const tied = Object.entries(tally).filter(([, v]) => v === maxV);

        if (tied.length === 1) {
          this.nightKillTarget = this.players[parseInt(tied[0][0])];
          for (const w of wolves) w.privateMemory.push(`第${this.dayCount}夜 - 狼人投票决定猎杀${this.nightKillTarget.name}`);
          resolved = true;
        } else {
          for (const w of wolves) w.privateMemory.push(`第${this.dayCount}夜 - 狼人投票平票，需要重新商议`);
        }
      }
    }

    // If still not resolved after 3 attempts, random
    if (!this.nightKillTarget) {
      const fallback = targets.filter(t => t.alive);
      this.nightKillTarget = fallback[Math.floor(Math.random() * fallback.length)];
      for (const w of wolves) w.privateMemory.push(`第${this.dayCount}夜 - 狼人最终猎杀${this.nightKillTarget.name}`);
    }
    await this.sleep(500);
  }

  // ── Seer Night ──


  async seerNight() {
    const seer = this.alive.find(p => p.role === 'seer');
    if (!seer) return;

    const others = this.alive.filter(p => p.id !== seer.id);

    if (seer.isUser) {
      this.addPrivateMessage('🔮 预言家请睁眼，选择要查验的玩家');
      const target = await this.waitForUserChoice('选择查验目标', others.map(p => ({ id: p.id, label: `${p.avatar} ${p.name}` })));
      if (this._d()) return;
      const checked = this.players[target];
      const isWolf = checked.role === 'werewolf';
      this.addPrivateMessage(`查验结果：${checked.name} 是 ${isWolf ? '🐺 狼人！' : '✅ 好人'}`, isWolf ? 'danger' : 'success');
      seer.privateMemory.push(`第${this.dayCount}夜查验 - ${checked.name}是${isWolf ? '狼人' : '好人'}`);
    } else {
      const situation = `现在是预言家查验时间。你可以选择一名玩家查验其身份。\n候选查验对象：${others.map(p => p.name).join('、')}\n\n请分析谁最可疑或最需要查验，然后只回复一个玩家的名字：`;
      const resp = await this.aiCall(seer, situation, { temperature: 0.5, maxTokens: 30, silent: true });
      if (this._d()) return;
      let target = null;
      if (resp) target = others.find(p => resp.includes(p.name));
      if (!target) target = others[Math.floor(Math.random() * others.length)];

      const isWolf = target.role === 'werewolf';
      seer.privateMemory.push(`第${this.dayCount}夜查验 - ${target.name}是${isWolf ? '狼人' : '好人'}`);
    }
    await this.sleep(500);
  }

  // ── Witch Night ──

  async witchNight() {
    const witch = this.alive.find(p => p.role === 'witch');
    if (!witch || !this.nightKillTarget) return;

    if (witch.isUser) {
      // --- User is Witch: full UI ---
      if (!this.witchHealUsed) {
        this.addPrivateMessage(`🧙 女巫请睁眼。今晚 ${this.nightKillTarget.name} 被狼人猎杀了`);
        const heal = await this.waitForUserChoice('是否使用解药？', [
          { id: 'yes', label: '💊 使用解药（救人）' },
          { id: 'no', label: '❌ 不使用' },
        ]);
        if (this._d()) return;
        if (heal === 'yes') {
          this.witchHealUsed = true;
          witch.privateMemory.push(`第${this.dayCount}夜 - 你用解药救了${this.nightKillTarget.name}`);
          this.nightKillTarget = null;
          this.addPrivateMessage('你使用了解药，被猎杀的玩家获救了');
        }
      }
      if (!this.witchPoisonUsed) {
        const candidates = this.alive.filter(p => p.id !== witch.id);
        const poisonChoices = [
          { id: 'skip', label: '❌ 不使用毒药' },
          ...candidates.map(p => ({ id: p.id, label: `☠️ 毒杀 ${p.avatar} ${p.name}` })),
        ];
        this.addPrivateMessage('🧙 是否使用毒药？');
        const pt = await this.waitForUserChoice('选择毒药目标', poisonChoices);
        if (this._d()) return;
        if (pt !== 'skip') {
          this.witchPoisonUsed = true;
          this.nightPoisonTarget = this.players[pt];
          witch.privateMemory.push(`第${this.dayCount}夜 - 你用毒药毒杀了${this.players[pt].name}`);
          this.addPrivateMessage(`你毒杀了 ${this.players[pt].name}`);
        }
      }
    } else {
      // --- AI Witch: all silent ---
      witch.privateMemory.push(`第${this.dayCount}夜 - 狼人杀了${this.nightKillTarget.name}`);

      if (!this.witchHealUsed) {
        const situation = `你是女巫。今晚${this.nightKillTarget.name}被狼人杀了。\n你还有解药（未使用），是否救${this.nightKillTarget.name}？\n\n请考虑这个人对好人阵营的重要性，然后回复"救"或"不救"（只回复这两个字之一）：`;
        const resp = await this.aiCall(witch, situation, { temperature: 0.5, maxTokens: 10, silent: true });
        if (this._d()) return;
        if (resp && resp.includes('救') && !resp.includes('不救')) {
          this.witchHealUsed = true;
          witch.privateMemory.push(`第${this.dayCount}夜 - 你用解药救了${this.nightKillTarget.name}`);
          this.nightKillTarget = null;
        }
      }

      if (!this.witchPoisonUsed) {
        const candidates = this.alive.filter(p => p.id !== witch.id);
        const situation = `你是女巫，你还有毒药（未使用）。是否使用毒药？\n如果要使用，回复"毒 [玩家名字]"；如果不使用，回复"不用"。\n存活玩家：${candidates.map(p => p.name).join('、')}\n请回复：`;
        const resp = await this.aiCall(witch, situation, { temperature: 0.5, maxTokens: 20, silent: true });
        if (this._d()) return;
        if (resp && !resp.includes('不用') && !resp.includes('不使用')) {
          const target = candidates.find(p => resp.includes(p.name));
          if (target) {
            this.witchPoisonUsed = true;
            this.nightPoisonTarget = target;
            witch.privateMemory.push(`第${this.dayCount}夜 - 你用毒药毒杀了${target.name}`);
          }
        }
      }
    }
    await this.sleep(500);
  }

  // ── Resolve Night ──

  async resolveNight() {
    this.addSystemMessage('☀️ 天亮了！');
    await this.sleep(800);
    if (this._d()) return;

    const nightDeaths = [];

    if (this.nightPoisonTarget && this.nightKillTarget &&
        this.nightPoisonTarget.id === this.nightKillTarget.id) {
      this.nightPoisonTarget = null;
    }

    if (this.nightKillTarget) {
      this.nightKillTarget.alive = false;
      nightDeaths.push(this.nightKillTarget);
    }
    if (this.nightPoisonTarget) {
      this.nightPoisonTarget.alive = false;
      nightDeaths.push(this.nightPoisonTarget);
    }

    if (nightDeaths.length === 0) {
      this.addSystemMessage('昨晚是个平安夜，没有人死亡 🎉', 'success');
    } else {
      const names = nightDeaths.map(p => p.name).join('、');
      this.addSystemMessage(`昨晚 ${names} 死亡了！💀`, 'danger');
    }

    for (const dead of nightDeaths) {
      if (dead.role === 'hunter') {
        await this.hunterShot(dead);
      }
    }

    this.nightKillTarget = null;
    this.nightPoisonTarget = null;
    this.updatePlayerList();
    if (this.checkWin()) return;
    await this.startDay();
  }

  // ════════════════════════════════════════════
  //  DAY PHASE
  // ════════════════════════════════════════════

  async startDay() {
    this.setPhase('day', `☀️ 第${this.dayCount}天`);

    this.addSystemMessage(`☀️ 第 ${this.dayCount} 天 - 讨论第1轮：请每位玩家发表看法`, 'important');
    await this.discussionRound(1);
    if (this.state !== 'playing') return;

    this.addSystemMessage(`💬 讨论第2轮：回应与质疑`, 'important');
    await this.discussionRound(2);
    if (this.state !== 'playing') return;

    await this.dayVote();
  }

  async discussionRound(roundNum) {
    const alivePlayers = this.alive;
    for (const player of alivePlayers) {
      if (!player.alive || this.state !== 'playing') return;
      if (player.isUser) {
        await this.userSpeak(roundNum);
      } else {
        await this.aiSpeak(player, roundNum);
      }
    }
  }

  async userSpeak(roundNum) {
    this.addSystemMessage(`轮到你发言了${roundNum === 2 ? '（你可以回应其他人的发言）' : ''}`);
    const text = await this.waitForUserInput('输入你的发言...');
    if (this._d()) return;
    this.addPlayerMessage(this.user, text);
    return text;
  }

  async aiSpeak(player, roundNum) {
    let situation;
    if (roundNum === 1) {
      situation = `现在是白天讨论的第1轮。请发表你对当前局势的看法。可以分析谁可疑、分享你知道的信息（但要注意策略）、或表明立场。`;
    } else {
      situation = `现在是白天讨论的第2轮。请回应其他人的发言：你可以支持或反驳某人的观点、质疑可疑玩家、为自己辩护、或补充新的分析。请点名回应至少一位其他玩家。`;
    }
    const resp = await this.aiCall(player, situation);
    if (this._d()) return;
    if (resp) {
      this.addPlayerMessage(player, resp);
    } else {
      this.addPlayerMessage(player, this.fallbackSpeech(player));
    }
    await this.sleep(600);
  }

  fallbackSpeech(player) {
    const pool = {
      werewolf: ['我觉得我们不能急着投票，要仔细分析。', '我暂时没看出谁有问题。'],
      villager: ['我没有特殊信息，但有些人确实可疑。', '我选择相信大家的分析。'],
      seer: ['我有些信息，但我还在考虑要不要现在说。', '大家看看谁的发言最不自然。'],
      witch: ['我们需要保护关键角色。', '昨晚的情况让我有想法。'],
      hunter: ['大家不用担心我。', '我会注意观察的。'],
    };
    const p = pool[player.role] || pool.villager;
    return p[Math.floor(Math.random() * p.length)];
  }

  // ── Day Vote ──

  async dayVote() {
    let resolved = false;
    let attempt = 0;

    while (!resolved && attempt < 3) {
      attempt++;
      this.setPhase('day-vote', `🗳 投票${attempt > 1 ? '（重投）' : ''}`);
      if (attempt > 1) {
        this.addSystemMessage(`🗳 上轮投票平票！追加一轮讨论后重新投票`, 'important');
        await this.discussionRound(3);
      } else {
        this.addSystemMessage('🗳 投票阶段！请选择要淘汰的玩家', 'important');
      }

      const votes = {};
      const alivePlayers = this.alive;

      // User vote
      if (this.user.alive) {
        const target = await this.waitForUserChoice('投票淘汰', [
          ...alivePlayers.filter(p => !p.isUser).map(p => ({ id: p.id, label: `${p.avatar} ${p.name}` })),
          { id: 'skip', label: '🟡 弃票' },
        ]);
        if (this._d()) return;
        if (target !== 'skip') {
          votes[this.user.id] = target;
          this.addSystemMessage(`你投票给了 ${this.players[target].name}`);
        } else {
          this.addSystemMessage('你选择了弃票');
        }
      }

      // AI votes
      for (const player of alivePlayers) {
        if (player.isUser) continue;
        await this.sleep(300);
        const candidates = alivePlayers.filter(p => p.id !== player.id);
        const situation = `现在是投票阶段，你需要投票淘汰一个玩家。\n候选人：${candidates.map(p => p.name).join('、')}\n\n${player.role === 'werewolf' ? '你是狼人，应该投给对狼人威胁最大的好人（如预言家、女巫）。' : '你应该投给你觉得最可疑的玩家。'}\n\n请只回复一个玩家的名字：`;
        const resp = await this.aiCall(player, situation, { temperature: 0.4, maxTokens: 20 });
        if (this._d()) return;
        let voted = false;
        if (resp) {
          const target = candidates.find(p => resp.includes(p.name));
          if (target) { votes[player.id] = target.id; voted = true; }
        }
        if (!voted) {
          if (player.role === 'werewolf') {
            const nw = candidates.filter(p => p.role !== 'werewolf');
            votes[player.id] = (nw.length ? nw : candidates)[Math.floor(Math.random() * (nw.length || candidates.length))].id;
          } else {
            votes[player.id] = candidates[Math.floor(Math.random() * candidates.length)].id;
          }
        }
        this.addSystemMessage(`${player.name} 投了一票`);
      }

      // Tally
      await this.sleep(500);
      const tally = {};
      Object.values(votes).forEach(id => tally[id] = (tally[id] || 0) + 1);

      if (!Object.keys(tally).length) {
        this.addSystemMessage('本轮没有人被投票淘汰');
        resolved = true;
      } else {
        const maxV = Math.max(...Object.values(tally));
        const tied = Object.entries(tally).filter(([, v]) => v === maxV);

        const voteDetails = Object.entries(tally).map(([id, count]) => `${this.players[parseInt(id)].name}: ${count}票`).join('  |  ');
        this.addSystemMessage(`投票结果：${voteDetails}`);

        if (tied.length === 1) {
          const eliminated = this.players[parseInt(tied[0][0])];
          eliminated.alive = false;
          const ri = ROLE_INFO[eliminated.role];
          this.addSystemMessage(`${eliminated.name} 被淘汰了！身份是：${ri.emoji} ${ri.name}`, 'danger');
          if (eliminated.role === 'hunter') await this.hunterShot(eliminated);
          resolved = true;
        } else {
          const tiedNames = tied.map(([id]) => this.players[parseInt(id)].name).join('、');
          this.addSystemMessage(`${tiedNames} 之间平票！${attempt < 3 ? '将进行额外讨论后重新投票' : '本轮无人淘汰'}`, 'important');
          if (attempt >= 3) resolved = true;
        }
      }
    }

    this.updatePlayerList();
    if (this.checkWin()) return;
    this._setTimeout(() => this.startNight(), 2000);
  }

  // ════════════════════════════════════════════
  //  HUNTER
  // ════════════════════════════════════════════

  async hunterShot(hunter) {
    this.addSystemMessage(`🏹 ${hunter.name} 是猎人！可以带走一个人！`, 'important');
    const targets = this.alive.filter(p => p.id !== hunter.id);
    if (!targets.length) return;

    if (hunter.isUser) {
      const pick = await this.waitForUserChoice('猎人开枪', targets.map(p => ({ id: p.id, label: `🎯 ${p.avatar} ${p.name}` })));
      if (this._d()) return;
      this.players[pick].alive = false;
      this.addSystemMessage(`猎人带走了 ${this.players[pick].name}！`, 'danger');
    } else {
      const situation = `你是猎人，你刚刚死亡，你可以开枪带走一名玩家。\n候选目标：${targets.map(p => p.name).join('、')}\n\n请分析谁最可能是狼人，然后只回复一个名字：`;
      const resp = await this.aiCall(hunter, situation, { temperature: 0.4, maxTokens: 20 });
      if (this._d()) return;
      let target = null;
      if (resp) target = targets.find(p => resp.includes(p.name));
      if (!target) {
        const wolves = targets.filter(p => p.role === 'werewolf');
        target = wolves.length ? wolves[0] : targets[Math.floor(Math.random() * targets.length)];
      }
      target.alive = false;
      this.addSystemMessage(`猎人 ${hunter.name} 开枪带走了 ${target.name}！`, 'danger');
    }
    this.updatePlayerList();
  }

  // ════════════════════════════════════════════
  //  WIN CONDITION
  // ════════════════════════════════════════════

  checkWin() {
    const w = this.aliveWolves;
    const v = this.aliveVillagers;
    if (!w.length) { this.endGame('village', '好人阵营获胜！所有狼人已被消灭！'); return true; }
    if (w.length >= v.length) { this.endGame('wolf', '狼人获胜！狼人数量已不少于好人！'); return true; }
    return false;
  }

  endGame(winner, message) {
    this.gameResult = winner;
    this.addSystemMessage(`🎉 游戏结束！${message}`, winner === 'village' ? 'success' : 'danger');

    const userWon = (winner === 'village' && this.user.role !== 'werewolf') ||
                    (winner === 'wolf' && this.user.role === 'werewolf');
    const ri = ROLE_INFO[this.user.role];

    this.showGameOver({
      icon: userWon ? '🎉' : '😢',
      title: userWon ? '恭喜你赢了！' : '游戏失败',
      message,
      subtitle: `你的身份：${ri.emoji} ${ri.name}`,
    });
  }
}

// ─── Register this game ───
registerGame({
  id: 'werewolf',
  name: '狼人杀',
  icon: '🐺',
  tag: '社交推理',
  description: '经典社交推理游戏。在白天讨论中找出隐藏的狼人，或者作为狼人每晚偷偷猎杀村民。包含预言家、女巫、猎人等特殊角色。',
  playerRange: '6-8 人',
  duration: '15-30 分钟',
  features: '🎭 角色扮演',
  GameClass: WerewolfGame,
});
