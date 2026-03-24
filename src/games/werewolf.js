/**
 * Werewolf Game (狼人杀) — Full AI Version (Sheriff Edition)
 *
 * All AI decisions are made via API calls with complete context.
 * Each AI maintains private memory of role-specific information.
 *
 * Night: Wolf vote (with discussion + re-vote on tie), Seer check, Witch decision, Hunter shot
 * Day 1: Sheriff election (candidates speak + all vote) → 1 round discussion → vote
 * Day 2+: 1 round discussion → vote (sheriff has 1.5x vote weight)
 * Sheriff death: badge is passed to a chosen successor
 */
import { aiService } from '../ai-service.js';
import { registerGame } from '../game-registry.js';
import { BaseGame, AVATARS } from './base-game.js';

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
    this.sheriff = null;
    this.userName = '';
    this.playerCount = 11;
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
              <option value="9" ${this.playerCount === 9 ? 'selected' : ''}>9人 (3狼 + 预言家 + 女巫 + 猎人 + 3村民)</option>
              <option value="10" ${this.playerCount === 10 ? 'selected' : ''}>10人 (3狼 + 预言家 + 女巫 + 猎人 + 4村民)</option>
              <option value="11" ${this.playerCount === 11 ? 'selected' : ''}>11人 (4狼 + 预言家 + 女巫 + 猎人 + 4村民)</option>
            </select>
          </div>
        </div>
        <div class="setup-section">
          <div class="setup-section-title">🤖 AI 玩家模型分配</div>
          <p class="form-hint" style="margin-bottom:12px;">为每个 AI 玩家分配不同的大模型</p>
          <div class="ai-player-list" id="ai-player-list">${this.renderAISlots(aiCount, profiles)}</div>
          ${profiles.length === 0 ? '<p class="form-hint" style="margin-top:8px;color:var(--accent-orange);">⚠️ 请先在右上角「模型配置」中添加模型</p>' : ''}
        </div>
        ${this.renderLogToggle()}
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
    this.bindLogToggle();
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      const name = document.getElementById('input-player-name').value.trim();
      if (!name) { this.app.showToast('请输入你的名字', 'error'); return; }
      if (!aiService.profiles.length) { this.app.showToast('请先添加 AI 模型', 'error'); return; }
      const nameCheck = this.validateNames(name);
      if (!nameCheck.valid) { this.app.showToast(nameCheck.message, 'error'); return; }
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
    this.sheriff = null;
    this.gameResult = null;

    const roles = this.generateRoles(this.playerCount);
    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

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
          id: i, name: this.getAIName(aiIdx), isUser: false, role: roles[i],
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
    if (n === 8) return ['werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'];
    if (n === 9) return ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'];
    if (n === 10) return ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager', 'villager'];
    // 11 players
    return ['werewolf', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager', 'villager'];
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
      const isSheriff = this.sheriff === p.id && p.alive;
      return `<div class="player-item ${p.alive ? '' : 'eliminated'} ${p.isUser ? 'is-user' : ''}">
        <div class="player-avatar">${p.avatar}</div>
        <span class="player-name">${isSheriff ? '🎖️ ' : ''}${p.name}${p.isUser ? ' (你)' : ''}</span>
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
${this.sheriff !== null ? `- 当前警长：${this.players[this.sheriff]?.alive ? this.players[this.sheriff].name : '无（已阵亡）'}（警长投票权重为1.5票）` : '- 警长：尚未选出'}
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
    if (!wolves.length) return;
    const targets = [...this.alive]; // wolves can target anyone including teammates and self

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
            ? `上一轮投票平票了，你们需要重新讨论。请重新分析，提出你认为今晚应该猎杀的目标（从以下存活玩家中选择：${targets.filter(t => t.alive).map(t => t.name).join('、')}），并说明理由。注意：你可以选择刀队友或自刀来帮自己或队友洗清嫌疑，这是高级策略。${wolfChat.length ? '\n同伴的发言：\n' + wolfChat.join('\n') : ''}`
            : `现在是狼人商议时间。请分析当前局势，提出你认为今晚应该猎杀的目标（从以下存活玩家中选择：${targets.filter(t => t.alive).map(t => t.name).join('、')}），并说明你的理由。注意：这是狼人之间的私密对话。你也可以提议刀队友或自刀来洗清嫌疑（高级策略）。${wolfChat.length ? '\n同伴的发言：\n' + wolfChat.join('\n') : ''}`;
          const resp = await this.aiCall(wolf, situation);
          if (this._d()) return;
          if (resp) {
            this.addPrivateMessage(`🐺 ${wolf.name}（队友）：${resp}`);
            wolfChat.push(`${wolf.name}：${resp}`);
            wolf.privateMemory.push(`第${this.dayCount}夜商议 - 你说：${resp}`);
          }
        }
        // All wolves vote (including user)
        this.addPrivateMessage('🐺 请投票选择今晚要猎杀的目标（可以选择队友或自己来自刀洗白）');
        const userPick = await this.waitForUserChoice('投票猎杀目标', targets.filter(t => t.alive).map(t => {
          const isTeammate = t.role === 'werewolf' && !t.isUser;
          const isSelf = t.isUser;
          let label = `${t.avatar} ${t.name}`;
          if (isSelf) label += ' 🔄（自刀）';
          else if (isTeammate) label += ' 🐺（队友）';
          return { id: t.id, label };
        }));
        if (this._d()) return;
        const votes = { [this.user.id]: userPick };
        for (const wolf of wolves.filter(p => !p.isUser)) {
          const votePrompt = `现在狼人要投票决定猎杀目标。之前的讨论：\n${wolfChat.join('\n')}\n\n候选目标（包括队友和自己，可以选择自刀/刀队友来洗白）：${targets.filter(t => t.alive).map(t => t.name).join('、')}\n\n请只回复一个你要猎杀的玩家名字，不要说别的：`;
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
            ? `上一轮投票平票了。请重新考虑并提出猎杀目标（候选：${targets.filter(t => t.alive).map(t => t.name).join('、')}）。你可以刀队友或自刀来洗白嫌疑。简短说明理由。之前的讨论：\n${wolfChat.join('\n')}`
            : `现在是狼人商议时间。你的同伴是${wolves.filter(w => w.id !== wolf.id).map(w => w.name).join('、')}。请分析局势，提出猎杀目标（候选：${targets.filter(t => t.alive).map(t => t.name).join('、')}）。注意：你也可以选择刀队友或自刀来帮自己洗清嫌疑，这是高级策略。简短说明理由。${wolfChat.length ? '\n同伴的发言：\n' + wolfChat.join('\n') : ''}`;
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
          const votePrompt = `现在狼人要投票决定猎杀目标。之前的讨论：\n${wolfChat.join('\n')}\n\n候选目标（包括队友和自己，可以自刀/刀队友来洗白）：${targets.filter(t => t.alive).map(t => t.name).join('、')}\n\n请只回复一个你要猎杀的玩家名字，不要说别的：`;
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
    if (!witch) return;

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
        if (this._d()) return;
      }
    }

    // Sheriff badge pass if sheriff died at night
    for (const dead of nightDeaths) {
      if (this.sheriff === dead.id) {
        await this.sheriffBadgePass(dead);
        if (this._d()) return;
      }
    }

    this.nightKillTarget = null;
    this.nightPoisonTarget = null;
    this.updatePlayerList();
    if (this.checkWin()) return;

    // Sheriff election on Day 1
    if (this.dayCount === 1) {
      await this.sheriffElection();
      if (this._d()) return;
      if (this.checkWin()) return;
    }

    await this.startDay();
  }

  // ════════════════════════════════════════════
  //  DAY PHASE
  // ════════════════════════════════════════════

  async startDay() {
    this.setPhase('day', `☀️ 第${this.dayCount}天`);

    const sheriffPlayer = this.sheriff !== null ? this.players[this.sheriff] : null;
    const sheriffAlive = sheriffPlayer?.alive;
    const sheriffName = sheriffAlive ? sheriffPlayer.name : null;

    // Sheriff decides speaking order
    let speakingOrder = this.alive; // default order
    if (sheriffAlive) {
      speakingOrder = await this.sheriffDecideSpeakingOrder();
      if (this._d()) return;
    }

    this.addSystemMessage(
      `☀️ 第 ${this.dayCount} 天 - 自由讨论${sheriffName ? `（警长：${sheriffName}）` : ''}`,
      'important'
    );
    await this.discussionRound(1, speakingOrder);
    if (this.state !== 'playing') return;

    await this.dayVote();
  }

  /** Sheriff decides the speaking order: pick a starting player and a direction. */
  async sheriffDecideSpeakingOrder() {
    const sheriffPlayer = this.players[this.sheriff];
    const alivePlayers = this.alive;
    // Build a circular-style ordered list based on player IDs
    const others = alivePlayers.filter(p => p.id !== sheriffPlayer.id);

    if (others.length <= 1) return alivePlayers;

    if (sheriffPlayer.isUser) {
      // User is sheriff — choose starting player
      this.addSystemMessage('🎖️ 警长请决定发言顺序');
      const startPick = await this.waitForUserChoice('从谁开始发言？', 
        others.map(p => ({ id: p.id, label: `${p.avatar} ${p.name}` }))
      );
      if (this._d()) return alivePlayers;

      // Choose direction
      const dirPick = await this.waitForUserChoice('发言方向', [
        { id: 'asc', label: '➡️ 顺序（正序发言）' },
        { id: 'desc', label: '⬅️ 逆序（倒序发言）' },
      ]);
      if (this._d()) return alivePlayers;

      const ordered = this.buildSpeakingOrder(alivePlayers, startPick, dirPick === 'desc');
      const startName = this.players[startPick].name;
      const dirLabel = dirPick === 'desc' ? '逆序' : '顺序';
      this.addSystemMessage(`🎖️ 警长决定发言顺序：从 ${startName} 开始，${dirLabel}发言`);
      return ordered;
    } else {
      // AI sheriff decides
      const situation = `你是警长，你需要决定今天的发言顺序。你可以选择从哪位玩家开始发言，以及发言方向（顺序/逆序）。\n存活玩家（除你以外）：${others.map(p => p.name).join('、')}\n\n这是一个重要的策略工具：\n- 让你怀疑的人先发言，可以观察他们的反应\n- 让你信任的人最后发言，可以给他们总结和引导的机会\n\n请回复格式：\"从[玩家名字]开始，[顺序/逆序]\"：`;
      const resp = await this.aiCall(sheriffPlayer, situation, { temperature: 0.5, maxTokens: 30, silent: true });
      if (this._d()) return alivePlayers;

      let startPlayer = null;
      let reverse = false;
      if (resp) {
        startPlayer = others.find(p => resp.includes(p.name));
        reverse = resp.includes('逆序') || resp.includes('倒序');
      }
      if (!startPlayer) {
        startPlayer = others[Math.floor(Math.random() * others.length)];
      }

      const ordered = this.buildSpeakingOrder(alivePlayers, startPlayer.id, reverse);
      const dirLabel = reverse ? '逆序' : '顺序';
      this.addSystemMessage(`🎖️ 警长决定发言顺序：从 ${startPlayer.name} 开始，${dirLabel}发言`);
      sheriffPlayer.privateMemory.push(`第${this.dayCount}天 - 你决定从${startPlayer.name}开始${dirLabel}发言`);
      return ordered;
    }
  }

  /** Build an ordered speaking list starting from a given player, in a given direction. */
  buildSpeakingOrder(alivePlayers, startId, reverse) {
    // Create a copy, optionally reverse
    let ordered = [...alivePlayers];
    if (reverse) ordered.reverse();
    // Rotate so that startId is first
    const startIdx = ordered.findIndex(p => p.id === startId);
    if (startIdx > 0) {
      ordered = [...ordered.slice(startIdx), ...ordered.slice(0, startIdx)];
    }
    return ordered;
  }

  shouldRunForSheriff(resp) {
    if (!resp) return false;
    const text = resp.trim();
    if (!text) return false;
    const negativeHints = ['不上警', '不竞选', '不参与', '不参选', '弃权', '放弃竞选', '不当警长'];
    if (negativeHints.some(hint => text.includes(hint))) return false;
    return ['上警', '参与竞选', '参选', '竞选警长', '我要竞选', '我要上警'].some(hint => text.includes(hint));
  }

  shouldDestroyBadge(resp) {
    if (!resp) return false;
    const text = resp.trim();
    if (!text) return false;
    const negativeHints = ['不撕毁', '别撕毁', '不要撕毁', '不撕警徽', '别撕警徽', '不要撕警徽'];
    if (negativeHints.some(hint => text.includes(hint))) return false;
    return ['撕毁', '撕警徽', '不传', '不移交'].some(hint => text.includes(hint));
  }

  async discussionRound(roundNum, speakingOrder) {
    const players = speakingOrder || this.alive;
    for (const player of players) {
      if (!player.alive || this.state !== 'playing') return;
      if (player.isUser) {
        await this.userSpeak(roundNum);
      } else {
        await this.aiSpeak(player, roundNum);
      }
    }
  }

  async userSpeak(roundNum) {
    this.addSystemMessage('轮到你发言了');
    const text = await this.waitForUserInput('输入你的发言...');
    if (this._d()) return;
    this.addPlayerMessage(this.user, text);
    return text;
  }

  async aiSpeak(player, roundNum) {
    const situation = `现在是白天自由讨论时间。请发表你对当前局势的看法。可以分析谁可疑、回应其他人的发言、分享你知道的信息（但要注意策略）、质疑可疑玩家、为自己辩护、或表明立场。请点名回应至少一位其他玩家。`;
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

      // Tally — sheriff vote counts as 1.5
      await this.sleep(500);
      const tally = {};
      Object.entries(votes).forEach(([voterId, targetId]) => {
        const weight = (parseInt(voterId) === this.sheriff) ? 1.5 : 1;
        tally[targetId] = (tally[targetId] || 0) + weight;
      });

      if (!Object.keys(tally).length) {
        this.addSystemMessage('本轮没有人被投票淘汰');
        resolved = true;
      } else {
        const maxV = Math.max(...Object.values(tally));
        const tied = Object.entries(tally).filter(([, v]) => v === maxV);

        const voteDetails = Object.entries(tally).map(([id, count]) => {
          const countStr = Number.isInteger(count) ? `${count}票` : `${count}票`;
          return `${this.players[parseInt(id)].name}: ${countStr}`;
        }).join('  |  ');
        this.addSystemMessage(`投票结果：${voteDetails}${this.sheriff !== null ? '（🎖️警长票=1.5）' : ''}`);

        if (tied.length === 1) {
          const eliminated = this.players[parseInt(tied[0][0])];
          eliminated.alive = false;
          const ri = ROLE_INFO[eliminated.role];
          this.addSystemMessage(`${eliminated.name} 被淘汰了！身份是：${ri.emoji} ${ri.name}`, 'danger');
          if (eliminated.role === 'hunter') {
            await this.hunterShot(eliminated);
            if (this._d()) return;
          }
          // Sheriff badge pass if the eliminated player was sheriff
          if (this.sheriff === eliminated.id) {
            await this.sheriffBadgePass(eliminated);
            if (this._d()) return;
          }
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
      const shotTarget = this.players[pick];
      shotTarget.alive = false;
      this.addSystemMessage(`猎人带走了 ${shotTarget.name}！`, 'danger');
      // Sheriff badge pass if hunter shot the sheriff
      if (this.sheriff === shotTarget.id) {
        await this.sheriffBadgePass(shotTarget);
      }
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
      // Sheriff badge pass if hunter shot the sheriff
      if (this.sheriff === target.id) {
        await this.sheriffBadgePass(target);
      }
    }
    this.updatePlayerList();
  }

  // ════════════════════════════════════════════
  //  SHERIFF ELECTION & BADGE PASS
  // ════════════════════════════════════════════

  async sheriffElection() {
    this.setPhase('day', '🎖️ 警长竞选');
    this.addSystemMessage('🎖️ 警长竞选开始！警长拥有 1.5 票的投票权重，死后可以指定继承人。', 'important');
    await this.sleep(800);
    if (this._d()) return;

    // Phase 1: Each player decides whether to run
    const candidates = [];
    this.addSystemMessage('📢 请各位玩家决定是否参与竞选警长');
    await this.sleep(500);
    if (this._d()) return;

    for (const player of this.alive) {
      if (this._d()) return;
      if (player.isUser) {
        const choice = await this.waitForUserChoice('是否竞选警长？', [
          { id: 'yes', label: '🎖️ 上警（参与竞选）' },
          { id: 'no', label: '❌ 不上警' },
        ]);
        if (this._d()) return;
        if (choice === 'yes') {
          candidates.push(player);
          this.addSystemMessage(`${player.name} 选择上警 ✋`);
        } else {
          this.addSystemMessage(`${player.name} 选择不上警`);
        }
      } else {
        // AI decides whether to run
        const situation = `现在是警长竞选阶段。你需要决定是否竞选警长。\n警长拥有1.5票的投票权重，死后可以指定警徽继承人。\n上警意味着你需要发表竞选演讲，会成为关注焦点。\n\n请根据你的身份和策略考虑：\n${player.role === 'werewolf' ? '- 你是狼人，上警可以抢夺话语权，但也可能暴露自己。权衡利弊后决定。' : ''}${player.role === 'seer' ? '- 你是预言家，上警可以传递查验信息并利用1.5票优势。通常建议上警。' : ''}${player.role === 'witch' ? '- 你是女巫，上警可以引导局势，但也会成为狼人目标。' : ''}${player.role === 'hunter' ? '- 你是猎人，上警后如果被投出可以开枪，有一定威慑力。' : ''}${player.role === 'villager' ? '- 你是村民，上警可以帮好人阵营，但没有特殊信息支撑。' : ''}\n\n请只回复"上警"或"不上警"：`;
        const resp = await this.aiCall(player, situation, { temperature: 0.6, maxTokens: 10, silent: true });
        if (this._d()) return;
        const willRun = this.shouldRunForSheriff(resp);
        if (willRun) {
          candidates.push(player);
          this.addSystemMessage(`${player.name} 选择上警 ✋`);
        } else {
          this.addSystemMessage(`${player.name} 选择不上警`);
        }
      }
      await this.sleep(300);
    }

    if (candidates.length === 0) {
      this.addSystemMessage('没有人上警，本局无警长 🤷', 'important');
      return;
    }

    if (candidates.length === 1) {
      this.sheriff = candidates[0].id;
      this.addSystemMessage(`只有 ${candidates[0].name} 上警，自动当选警长！🎖️`, 'success');
      candidates[0].privateMemory.push(`第${this.dayCount}天 - 你当选了警长（无竞争自动当选）`);
      this.updatePlayerList();
      return;
    }

    // Phase 2: Candidates give speeches
    this.addSystemMessage(`📣 共 ${candidates.length} 人上警，请竞选者依次发表演讲`, 'important');
    await this.sleep(500);
    if (this._d()) return;

    for (const candidate of candidates) {
      if (this._d()) return;
      if (candidate.isUser) {
        this.addSystemMessage('轮到你发表竞选演讲了');
        const speech = await this.waitForUserInput('发表你的竞选演讲...');
        if (this._d()) return;
        this.addPlayerMessage(candidate, speech);
      } else {
        const situation = `现在是警长竞选演讲时间，你是候选人之一。其他候选人有：${candidates.filter(c => c.id !== candidate.id).map(c => c.name).join('、')}。\n\n请发表你的竞选演讲（1-3句话），说服大家投你为警长。你可以：\n- 表明你的立场和分析\n- 暗示你掌握的信息（注意策略性）\n- 解释为什么你适合当警长\n${candidate.role === 'seer' ? '你是预言家，可以考虑在演讲中公开查验结果来争取信任。' : ''}${candidate.role === 'werewolf' ? '你是狼人，需要假装好人，可以尝试悍跳预言家或表现出可信度。' : ''}`;
        const resp = await this.aiCall(candidate, situation);
        if (this._d()) return;
        if (resp) {
          this.addPlayerMessage(candidate, resp);
          candidate.privateMemory.push(`第${this.dayCount}天 - 你的竞选演讲：${resp}`);
        } else {
          this.addPlayerMessage(candidate, '我希望大家信任我，投我一票。');
        }
      }
      await this.sleep(500);
    }

    // Phase 3: All alive players vote for sheriff
    this.addSystemMessage('🗳️ 请所有玩家投票选出警长', 'important');
    await this.sleep(500);
    if (this._d()) return;

    const votes = {};

    // User votes
    if (this.user.alive) {
      const options = [
        ...candidates.filter(c => !c.isUser).map(c => ({ id: c.id, label: `${c.avatar} ${c.name}` })),
        { id: 'skip', label: '🟡 弃票' },
      ];
      // If user is a candidate, they can't vote for themselves typically, but we allow abstain
      const pick = await this.waitForUserChoice('投票选警长', options);
      if (this._d()) return;
      if (pick !== 'skip') {
        votes[this.user.id] = pick;
        this.addSystemMessage(`你投给了 ${this.players[pick].name}`);
      } else {
        this.addSystemMessage('你选择了弃票');
      }
    }

    // AI votes
    for (const player of this.alive) {
      if (player.isUser) continue;
      if (this._d()) return;
      await this.sleep(300);
      const voteCandidates = candidates.filter(c => c.id !== player.id);
      if (!voteCandidates.length) continue;

      const situation = `现在投票选警长。候选人有：${voteCandidates.map(c => c.name).join('、')}\n\n请根据候选人的演讲和你的判断，选择一位你信任的候选人。只回复一个候选人的名字：`;
      const resp = await this.aiCall(player, situation, { temperature: 0.4, maxTokens: 20, silent: true });
      if (this._d()) return;
      if (resp) {
        const target = voteCandidates.find(c => resp.includes(c.name));
        if (target) votes[player.id] = target.id;
      }
      if (!votes[player.id]) {
        votes[player.id] = voteCandidates[Math.floor(Math.random() * voteCandidates.length)].id;
      }
      this.addSystemMessage(`${player.name} 投了一票`);
    }

    // Tally
    await this.sleep(500);
    const tally = {};
    Object.values(votes).forEach(id => tally[id] = (tally[id] || 0) + 1);

    if (!Object.keys(tally).length) {
      this.addSystemMessage('无人投票，本局无警长', 'important');
      return;
    }

    const maxV = Math.max(...Object.values(tally));
    const tied = Object.entries(tally).filter(([, v]) => v === maxV);

    const voteDetails = Object.entries(tally)
      .map(([id, count]) => `${this.players[parseInt(id)].name}: ${count}票`)
      .join('  |  ');
    this.addSystemMessage(`警长投票结果：${voteDetails}`);

    if (tied.length === 1) {
      const winner = this.players[parseInt(tied[0][0])];
      this.sheriff = winner.id;
      this.addSystemMessage(`🎖️ ${winner.name} 当选警长！`, 'success');
      winner.privateMemory.push(`第${this.dayCount}天 - 你当选了警长，你的投票权重为1.5票`);
      // Inform all players
      for (const p of this.alive) {
        if (p.id !== winner.id) {
          p.privateMemory.push(`第${this.dayCount}天 - ${winner.name}当选了警长`);
        }
      }
    } else {
      // Tie — runoff between tied candidates
      const tiedNames = tied.map(([id]) => this.players[parseInt(id)].name).join('、');
      this.addSystemMessage(`${tiedNames} 之间平票！进行决选`, 'important');

      const runoffCandidates = tied.map(([id]) => this.players[parseInt(id)]);
      const runoffVotes = {};

      if (this.user.alive) {
        const options = [
          ...runoffCandidates.filter(c => !c.isUser).map(c => ({ id: c.id, label: `${c.avatar} ${c.name}` })),
          { id: 'skip', label: '🟡 弃票' },
        ];
        const pick = await this.waitForUserChoice('决选投票', options);
        if (this._d()) return;
        if (pick !== 'skip') runoffVotes[this.user.id] = pick;
      }

      for (const player of this.alive) {
        if (player.isUser) continue;
        if (this._d()) return;
        const rc = runoffCandidates.filter(c => c.id !== player.id);
        if (!rc.length) continue;
        const situation = `警长决选！候选人：${rc.map(c => c.name).join('、')}。请只回复一个名字：`;
        const resp = await this.aiCall(player, situation, { temperature: 0.3, maxTokens: 10, silent: true });
        if (this._d()) return;
        if (resp) {
          const t = rc.find(c => resp.includes(c.name));
          if (t) runoffVotes[player.id] = t.id;
        }
        if (!runoffVotes[player.id]) {
          runoffVotes[player.id] = rc[Math.floor(Math.random() * rc.length)].id;
        }
      }

      const runoffTally = {};
      Object.values(runoffVotes).forEach(id => runoffTally[id] = (runoffTally[id] || 0) + 1);

      if (Object.keys(runoffTally).length) {
        const maxRV = Math.max(...Object.values(runoffTally));
        const runoffWinners = Object.entries(runoffTally).filter(([, v]) => v === maxRV);
        // Pick first winner (or random if still tied)
        const winnerId = parseInt(runoffWinners[Math.floor(Math.random() * runoffWinners.length)][0]);
        const winner = this.players[winnerId];
        this.sheriff = winner.id;
        this.addSystemMessage(`🎖️ 决选结果：${winner.name} 当选警长！`, 'success');
        winner.privateMemory.push(`第${this.dayCount}天 - 你当选了警长，你的投票权重为1.5票`);
        for (const p of this.alive) {
          if (p.id !== winner.id) {
            p.privateMemory.push(`第${this.dayCount}天 - ${winner.name}当选了警长`);
          }
        }
      } else {
        this.addSystemMessage('决选无人投票，本局无警长', 'important');
      }
    }

    this.updatePlayerList();
    await this.sleep(800);
  }

  /** Handle sheriff badge passing when sheriff dies */
  async sheriffBadgePass(deadSheriff) {
    this.addSystemMessage(`🎖️ 警长 ${deadSheriff.name} 阵亡了！需要移交警徽`, 'important');
    await this.sleep(500);
    if (this._d()) return;

    const candidates = this.alive.filter(p => p.id !== deadSheriff.id);
    if (!candidates.length) {
      this.sheriff = null;
      this.addSystemMessage('没有存活玩家可以继承警徽');
      return;
    }

    if (deadSheriff.isUser) {
      const options = [
        ...candidates.map(p => ({ id: p.id, label: `🎖️→ ${p.avatar} ${p.name}` })),
        { id: 'destroy', label: '💥 撕毁警徽（不传）' },
      ];
      const pick = await this.waitForUserChoice('移交警徽给谁？', options);
      if (this._d()) return;
      if (pick === 'destroy') {
        this.sheriff = null;
        this.addSystemMessage(`${deadSheriff.name} 选择撕毁警徽！本局不再有警长`, 'important');
      } else {
        this.sheriff = pick;
        const successor = this.players[pick];
        this.addSystemMessage(`${deadSheriff.name} 将警徽传给了 ${successor.name}！`, 'success');
        successor.privateMemory.push(`第${this.dayCount}天 - ${deadSheriff.name}将警徽传给了你，你现在是警长，投票权重为1.5票`);
      }
    } else {
      // AI sheriff passes badge
      const situation = `你是警长，你刚刚阵亡了。你需要决定将警徽传给谁（警徽流）。\n可以选择的存活玩家：${candidates.map(p => p.name).join('、')}\n\n请根据你的判断，选择一位你最信任的好人玩家继承警徽。你也可以选择"撕毁"警徽。\n请只回复一个玩家的名字，或回复"撕毁"：`;
      const resp = await this.aiCall(deadSheriff, situation, { temperature: 0.4, maxTokens: 20 });
      if (this._d()) return;

      if (this.shouldDestroyBadge(resp)) {
        this.sheriff = null;
        this.addSystemMessage(`${deadSheriff.name} 选择撕毁警徽！本局不再有警长`, 'important');
      } else {
        let successor = null;
        if (resp) successor = candidates.find(p => resp.includes(p.name));
        if (!successor) {
          // Fallback: pass to a non-wolf if possible
          const goodGuys = candidates.filter(p => p.role !== 'werewolf');
          successor = goodGuys.length ? goodGuys[Math.floor(Math.random() * goodGuys.length)]
            : candidates[Math.floor(Math.random() * candidates.length)];
        }
        this.sheriff = successor.id;
        this.addSystemMessage(`${deadSheriff.name} 将警徽传给了 ${successor.name}！`, 'success');
        successor.privateMemory.push(`第${this.dayCount}天 - ${deadSheriff.name}将警徽传给了你，你现在是警长，投票权重为1.5票`);
        deadSheriff.privateMemory.push(`第${this.dayCount}天 - 你将警徽传给了${successor.name}`);
      }
    }
    this.updatePlayerList();
    await this.sleep(500);
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
  description: '经典社交推理游戏（警长版）。包含警长竞选、1.5票权、警徽流等机制。在白天讨论中找出隐藏的狼人，或者作为狼人偷偷猎杀村民。',
  playerRange: '6-11 人',
  duration: '15-30 分钟',
  features: '🎭 角色扮演',
  GameClass: WerewolfGame,
});
