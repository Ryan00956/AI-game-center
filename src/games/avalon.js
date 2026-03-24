import { aiService } from '../ai-service.js';
import { registerGame } from '../game-registry.js';
import { BaseGame, AVATARS } from './base-game.js';

const ROLE_INFO = {
  servant: { name: '忠臣', emoji: '🛡️', color: 'villager', team: 'good' },
  merlin: { name: '梅林', emoji: '🔮', color: 'seer', team: 'good' },
  percival: { name: '派西维尔', emoji: '☀️', color: 'hunter', team: 'good' },
  minion: { name: '爪牙', emoji: '🗡️', color: 'werewolf', team: 'evil' },
  assassin: { name: '刺客', emoji: '🎯', color: 'werewolf', team: 'evil' },
  morgana: { name: '莫甘娜', emoji: '🌑', color: 'witch', team: 'evil' },
};

const GAME_CONFIGS = {
  5: {
    roles: ['merlin', 'servant', 'servant', 'assassin', 'minion'],
    questSizes: [2, 3, 2, 3, 3],
    twoFailsQuest: null,
  },
  6: {
    roles: ['merlin', 'servant', 'servant', 'servant', 'assassin', 'minion'],
    questSizes: [2, 3, 4, 3, 4],
    twoFailsQuest: null,
  },
  7: {
    roles: ['merlin', 'percival', 'servant', 'servant', 'assassin', 'morgana', 'minion'],
    questSizes: [2, 3, 3, 4, 4],
    twoFailsQuest: 3,
  },
  8: {
    roles: ['merlin', 'percival', 'servant', 'servant', 'servant', 'assassin', 'morgana', 'minion'],
    questSizes: [3, 4, 4, 5, 5],
    twoFailsQuest: 3,
  },
};

export class AvalonGame extends BaseGame {
  constructor(container, app) {
    super(container, app);
    this.userName = '';
    this.playerCount = 6;
    this.questIndex = 0;
    this.leaderIndex = 0;
    this.rejectedTeams = 0;
    this.currentTeam = [];
    this.questResults = [];
    this.questHistory = [];
    this.phase = 'setup';
    this.renderSetup();
  }

  get config() {
    return GAME_CONFIGS[this.playerCount] || GAME_CONFIGS[6];
  }

  get currentLeader() {
    return this.players[this.leaderIndex] || null;
  }

  get successfulQuests() {
    return this.questResults.filter(r => r.success).length;
  }

  get failedQuests() {
    return this.questResults.filter(r => !r.success).length;
  }

  get currentQuestSize() {
    return this.config.questSizes[this.questIndex] || this.config.questSizes[this.config.questSizes.length - 1];
  }

  get displayQuestNumber() {
    return Math.min(this.questIndex + 1, this.config.questSizes.length);
  }

  renderSetup() {
    const profiles = aiService.profiles;
    const aiCount = this.playerCount - 1;
    this.initDefaultProfiles(aiCount);

    this.container.innerHTML = `
      <div class="game-header">
        <div class="game-header-left">
          <button class="btn-back" id="btn-back">←</button>
          <div class="game-title-area">
            <h2>🏰 阿瓦隆</h2>
            <span>设置你的游戏参数</span>
          </div>
        </div>
      </div>
      <div class="game-setup">
        <h3>🎮 游戏设置</h3>
        <div class="setup-section">
          <div class="setup-section-title">玩家信息</div>
          <div class="form-group">
            <label class="form-label">你的名字</label>
            <input type="text" class="form-input" id="input-player-name"
              placeholder="输入你的游戏名字" value="${this.userName || ''}" maxlength="8" />
          </div>
        </div>
        <div class="setup-section">
          <div class="setup-section-title">游戏人数</div>
          <div class="form-group">
            <label class="form-label">总玩家数 (包含你自己)</label>
            <select class="form-input" id="select-player-count">
              <option value="5" ${this.playerCount === 5 ? 'selected' : ''}>5人 (梅林 + 2忠臣 vs 刺客 + 爪牙)</option>
              <option value="6" ${this.playerCount === 6 ? 'selected' : ''}>6人 (梅林 + 3忠臣 vs 刺客 + 爪牙)</option>
              <option value="7" ${this.playerCount === 7 ? 'selected' : ''}>7人 (梅林 + 派西维尔 + 2忠臣 vs 刺客 + 莫甘娜 + 爪牙)</option>
              <option value="8" ${this.playerCount === 8 ? 'selected' : ''}>8人 (梅林 + 派西维尔 + 3忠臣 vs 刺客 + 莫甘娜 + 爪牙)</option>
            </select>
          </div>
        </div>
        <div class="setup-section">
          <div class="setup-section-title">🤖 AI 玩家模型分配</div>
          <p class="form-hint" style="margin-bottom:12px;">为每个 AI 玩家分配模型，观察它们在组队、投票和刺杀中的博弈</p>
          <div class="ai-player-list" id="ai-player-list">
            ${this.renderAISlots(aiCount, profiles)}
          </div>
          ${profiles.length === 0 ? '<p class="form-hint" style="margin-top:8px;color:var(--accent-orange);">⚠️ 请先在右上角「模型配置」中添加模型</p>' : ''}
        </div>
        ${this.renderLogToggle()}
        <button class="btn btn-primary btn-block" id="btn-start-game" style="margin-top:8px">🏰 开始游戏</button>
      </div>
    `;

    document.getElementById('btn-back')?.addEventListener('click', () => this.app.navigate('home'));
    document.getElementById('select-player-count')?.addEventListener('change', (e) => {
      this.playerCount = parseInt(e.target.value, 10);
      const count = this.playerCount - 1;
      this.initDefaultProfiles(count);
      document.getElementById('ai-player-list').innerHTML = this.renderAISlots(count, aiService.profiles);
      this.bindProfileSelectors(count);
    });

    this.bindProfileSelectors(aiCount);
    this.bindLogToggle();

    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      const name = document.getElementById('input-player-name').value.trim();
      if (!name) {
        this.app.showToast('请输入你的名字', 'error');
        return;
      }
      if (!aiService.profiles.length) {
        this.app.showToast('请先添加 AI 模型', 'error');
        return;
      }
      const nameCheck = this.validateNames(name);
      if (!nameCheck.valid) {
        this.app.showToast(nameCheck.message, 'error');
        return;
      }
      this.userName = name;
      this.playerCount = parseInt(document.getElementById('select-player-count').value, 10);
      this.startGame();
    });
  }

  startGame() {
    this.state = 'playing';
    this.phase = 'team';
    this.questIndex = 0;
    this.rejectedTeams = 0;
    this.currentTeam = [];
    this.questResults = [];
    this.questHistory = [];
    this.messages = [];
    this.gameResult = null;

    const roles = [...this.config.roles];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const userPos = Math.floor(Math.random() * this.playerCount);
    this.players = [];
    let aiIdx = 0;

    for (let i = 0; i < this.playerCount; i++) {
      const role = roles[i];
      if (i === userPos) {
        this.players.push({
          id: i,
          name: this.userName,
          isUser: true,
          role,
          avatar: '🎮',
          profileId: null,
          privateMemory: [],
        });
      } else {
        const profileId = this.playerProfiles[aiIdx] || aiService.getDefaultProfile()?.id || null;
        const profile = aiService.getProfile(profileId);
        this.players.push({
          id: i,
          name: this.getAIName(aiIdx),
          isUser: false,
          role,
          avatar: AVATARS[aiIdx % AVATARS.length],
          profileId,
          modelName: profile?.name || profile?.model || '未知',
          privateMemory: [],
        });
        aiIdx++;
      }
    }

    this.leaderIndex = Math.floor(Math.random() * this.playerCount);
    this.initializePrivateMemories();

    this.renderGameUI();
    this.addSystemMessage('阿瓦隆开始！圆桌会议已建立。', 'important');
    this.addPrivateMessage(`你的身份是：${ROLE_INFO[this.user.role].emoji} ${ROLE_INFO[this.user.role].name}`, 'important');
    for (const note of this.user.privateMemory) {
      this.addPrivateMessage(note);
    }

    this._setTimeout(() => this.startQuestRound(), 1200);
  }

  get user() {
    return this.players.find(p => p.isUser);
  }

  initializePrivateMemories() {
    const evilPlayers = this.players.filter(p => this.isEvil(p.role));
    const evilNames = evilPlayers.map(p => p.name).join('、');
    const merlin = this.players.find(p => p.role === 'merlin');
    const morgana = this.players.find(p => p.role === 'morgana');
    const percival = this.players.find(p => p.role === 'percival');

    for (const player of this.players) {
      const notes = [];
      if (player.role === 'merlin') {
        notes.push(`你是【梅林】。你知道邪恶阵营是：${evilNames}。`);
        notes.push('你要引导好人组出安全队伍，但不能暴露自己太明显，否则最后可能被刺客猜中。');
      } else if (player.role === 'percival') {
        const candidates = [merlin, morgana].filter(Boolean);
        this.shuffle(candidates);
        notes.push(`你是【派西维尔】。你看到的“梅林候选人”是：${candidates.map(p => p.name).join('、')}。`);
        notes.push('其中一位是真梅林，另一位可能是莫甘娜。请保护真正的梅林。');
      } else if (this.isEvil(player.role)) {
        const teammates = evilPlayers.filter(p => p.id !== player.id);
        notes.push(`你属于【邪恶阵营】。你的邪恶同伴是：${teammates.length ? teammates.map(p => `${p.name}(${ROLE_INFO[p.role].name})`).join('、') : '无'}。`);
        if (player.role === 'assassin') {
          notes.push('如果好人先完成三次任务，你还可以刺杀一名你认为是梅林的玩家。');
        } else if (player.role === 'morgana') {
          notes.push('你会伪装成梅林，误导派西维尔。');
        } else {
          notes.push('你需要伪装成好人，推动可疑队伍通过投票。');
        }
      } else {
        notes.push('你是【忠臣】。你不知道任何隐藏身份，只能通过组队和投票记录判断。');
      }
      player.privateMemory = notes;
    }
  }

  renderGameUI() {
    this.renderGameLayout({
      title: '阿瓦隆',
      emoji: '🏰',
      phaseLabel: '👑 组队阶段',
      phaseClass: 'day',
    });
    this.updateStatusUI();
  }

  updateStatusUI() {
    const status = document.getElementById('game-status-text');
    if (status) {
      status.textContent = this.phase === 'assassination'
        ? `好人 ${this.successfulQuests} : ${this.failedQuests} 邪恶 · 刺杀阶段`
        : `好人 ${this.successfulQuests} : ${this.failedQuests} 邪恶`;
    }
    const roundLabel = this.phase === 'assassination'
      ? `刺杀阶段 · 刺客 ${this.players.find(p => p.role === 'assassin')?.name || '-'}`
      : `任务 ${this.displayQuestNumber}/5 · 队长 ${this.currentLeader?.name || '-'} · 否决 ${this.rejectedTeams}/5`;
    this.setRoundInfo(roundLabel);
    this.updatePlayerList();
  }

  renderPlayerList() {
    const currentQuest = this.displayQuestNumber;
    const currentNeeds = this.currentQuestSize;
    const failRule = this.needsTwoFailsForCurrentQuest() ? '本轮需 2 张失败' : '1 张失败即可破坏';
    const quests = this.config.questSizes.map((size, index) => {
      const result = this.questResults[index];
      const cls = result ? (result.success ? 'success' : 'fail') : (index === this.questIndex ? 'current' : 'pending');
      const label = result ? (result.success ? '成功' : `失败 · ${result.fails}张`) : `任务${index + 1}`;
      return `<div class="avalon-quest ${cls}">
        <span class="avalon-quest-index">${index + 1}</span>
        <span class="avalon-quest-size">${size}人</span>
        <span class="avalon-quest-label">${label}</span>
      </div>`;
    }).join('');

    const teamPreview = this.currentTeam.length
      ? this.currentTeam.map(id => `<span class="avalon-team-chip">${this.players[id].name}</span>`).join('')
      : '<span class="avalon-team-empty">等待队长提名</span>';

    const playerRows = this.players.map(p => {
      const ri = ROLE_INFO[p.role];
      const showRole = p.isUser || this.state === 'gameover';
      const statusBadges = [
        p.id === this.leaderIndex ? '<span class="player-role-badge hunter">队长</span>' : '',
        this.currentTeam.includes(p.id) ? '<span class="player-role-badge seer">任务队</span>' : '',
      ].join('');

      return `
        <div class="player-item ${p.isUser ? 'is-user' : ''} ${p.id === this.leaderIndex ? 'is-leader' : ''}">
          <div class="player-avatar">${p.avatar}</div>
          <span class="player-name">${p.name}${p.isUser ? ' (你)' : ''}</span>
          ${!p.isUser && p.modelName ? `<span class="player-model-tag">${p.modelName}</span>` : ''}
          ${showRole ? `<span class="player-role-badge ${ri.color}">${ri.emoji} ${ri.name}</span>` : ''}
          ${statusBadges}
        </div>
      `;
    }).join('');

    return `
      <div class="avalon-board">
        <div class="avalon-score">
          <span class="avalon-score-badge good">好人 ${this.successfulQuests}</span>
          <span class="avalon-score-badge evil">邪恶 ${this.failedQuests}</span>
        </div>
        <div class="avalon-board-meta">
          当前任务：第 ${currentQuest} 轮 · ${currentNeeds} 人执行
        </div>
        <div class="avalon-board-meta">
          ${failRule}
        </div>
        <div class="avalon-quests">${quests}</div>
        <div class="avalon-team-preview">${teamPreview}</div>
      </div>
      ${playerRows}
    `;
  }

  async startQuestRound() {
    if (this._d() || this.state !== 'playing') return;
    if (this.successfulQuests >= 3) {
      await this.startAssassinationPhase();
      return;
    }
    if (this.failedQuests >= 3) {
      this.endGame('evil', '邪恶阵营完成了三次破坏任务。');
      return;
    }

    this.phase = 'team';
    this.currentTeam = [];
    this.setPhaseIndicator('👑 组队阶段', 'day');
    this.updateStatusUI();
    this.addSystemMessage(
      `第 ${this.displayQuestNumber} 个任务开始。队长 ${this.currentLeader.name} 需要提名 ${this.currentQuestSize} 名玩家执行任务。`,
      'important'
    );

    const team = this.currentLeader.isUser
      ? await this.waitForUserTeamSelection(this.currentQuestSize)
      : await this.getAITeamProposal(this.currentLeader, this.currentQuestSize);
    if (this._d() || this.state !== 'playing') return;

    this.currentTeam = team;
    this.updateStatusUI();
    this.addSystemMessage(`队长 ${this.currentLeader.name} 提议任务队伍：${this.formatPlayerNames(team)}`);

    await this.sleep(500);
    await this.startTeamVote();
  }

  async waitForUserTeamSelection(requiredCount) {
    const options = this.players.map(p => ({ id: p.id, label: `${p.avatar} ${p.name}` }));
    return new Promise(resolve => {
      const area = document.getElementById('action-area');
      if (!area) return resolve([]);

      const selected = new Set();
      area.innerHTML = `
        <div class="action-panel">
          <h4>你是队长，请选择 ${requiredCount} 名执行任务的玩家</h4>
          <div class="action-buttons">
            ${options.map(o => `<button class="btn-vote" data-id="${o.id}">${o.label}</button>`).join('')}
          </div>
          <div class="avalon-selection-summary" id="avalon-selection-summary">已选择 0 / ${requiredCount}</div>
          <button class="btn btn-primary" id="avalon-team-confirm" disabled>确认队伍</button>
        </div>
      `;

      const summary = document.getElementById('avalon-selection-summary');
      const confirmBtn = document.getElementById('avalon-team-confirm');
      const buttons = area.querySelectorAll('.btn-vote');

      const renderState = () => {
        const names = Array.from(selected).map(id => this.players[parseInt(id, 10)].name);
        summary.textContent = names.length
          ? `已选择 ${selected.size} / ${requiredCount}：${names.join('、')}`
          : `已选择 0 / ${requiredCount}`;
        confirmBtn.disabled = selected.size !== requiredCount;
      };

      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (selected.has(id)) {
            selected.delete(id);
            btn.classList.remove('selected');
          } else if (selected.size < requiredCount) {
            selected.add(id);
            btn.classList.add('selected');
          }
          renderState();
        });
      });

      confirmBtn?.addEventListener('click', () => {
        area.innerHTML = '';
        resolve(Array.from(selected).map(id => parseInt(id, 10)));
      });
    });
  }

  async getAITeamProposal(player, teamSize) {
    const candidates = this.players;
    const messages = this.buildAIContext(
      player,
      `你现在是队长。请从候选人 ${candidates.map(p => p.name).join('、')} 中提名 ${teamSize} 人执行任务。
只回复 ${teamSize} 个名字，用中文逗号分隔，不要解释。`
    );

    const response = await this.callAI(player, messages, {
      temperature: 0.6,
      maxTokens: 80,
    });
    if (this._d()) return [];

    const parsed = this.extractNamedPlayers(response || '', candidates, teamSize);
    if (parsed.length === teamSize) return parsed;
    return this.getFallbackTeamProposal(player, teamSize);
  }

  getFallbackTeamProposal(player, teamSize) {
    const chosen = [];
    const pushUnique = id => {
      if (!chosen.includes(id) && chosen.length < teamSize) chosen.push(id);
    };

    const goodPlayers = this.players.filter(p => !this.isEvil(p.role));
    const evilPlayers = this.players.filter(p => this.isEvil(p.role));
    const previousSuccess = [...this.questHistory].reverse().find(q => q.success);

    pushUnique(player.id);

    if (this.isEvil(player.role)) {
      const desiredEvilCount = this.needsTwoFailsForCurrentQuest() ? 2 : 1;
      this.shuffle(evilPlayers);
      for (const evil of evilPlayers) {
        if (chosen.length >= teamSize) break;
        pushUnique(evil.id);
        if (chosen.filter(id => this.isEvil(this.players[id].role)).length >= desiredEvilCount) break;
      }
      const rest = this.players.filter(p => !chosen.includes(p.id));
      this.shuffle(rest);
      rest.forEach(p => pushUnique(p.id));
      return chosen.slice(0, teamSize);
    }

    if (player.role === 'merlin') {
      const safe = goodPlayers.filter(p => p.id !== player.id);
      this.shuffle(safe);
      safe.forEach(p => pushUnique(p.id));
      return chosen.slice(0, teamSize);
    }

    if (previousSuccess) {
      previousSuccess.team.forEach(id => pushUnique(id));
    }

    const rest = this.players.filter(p => !chosen.includes(p.id));
    this.shuffle(rest);
    rest.forEach(p => pushUnique(p.id));
    return chosen.slice(0, teamSize);
  }

  async startTeamVote() {
    if (this._d() || this.state !== 'playing') return;

    this.phase = 'vote';
    this.setPhaseIndicator('🗳 队伍投票', 'day');
    this.updateStatusUI();
    this.addSystemMessage('所有玩家开始对当前队伍进行投票。', 'important');

    const votes = new Map();

    if (this.user) {
      const userVote = await this.waitForUserChoice('是否同意这支任务队伍？', [
        { id: 'approve', label: '✅ 同意' },
        { id: 'reject', label: '❌ 反对' },
      ]);
      if (this._d()) return;
      votes.set(this.user.id, userVote);
    }

    for (const player of this.players) {
      if (player.isUser) continue;
      await this.sleep(250);
      if (this._d()) return;
      const vote = await this.getAIVote(player);
      if (this._d()) return;
      votes.set(player.id, vote);
      this.addSystemMessage(`${player.name} 已完成投票`);
    }

    const approvals = Array.from(votes.values()).filter(v => v === 'approve').length;
    const rejections = votes.size - approvals;

    this.addSystemMessage('投票公开：', 'important');
    for (const player of this.players) {
      const vote = votes.get(player.id);
      this.addSystemMessage(`${player.name}：${vote === 'approve' ? '同意' : '反对'}`);
    }

    if (approvals > this.players.length / 2) {
      this.addSystemMessage(`队伍通过！${approvals} 票同意，${rejections} 票反对。`, 'success');
      this.rejectedTeams = 0;
      await this.sleep(700);
      await this.runQuest();
      return;
    }

    this.rejectedTeams++;
    this.addSystemMessage(`队伍未通过。${approvals} 票同意，${rejections} 票反对。`, 'danger');
    if (this.rejectedTeams >= 5) {
      this.endGame('evil', '连续 5 次组队未通过，邪恶阵营直接获胜。');
      return;
    }

    this.advanceLeader();
    this.currentTeam = [];
    this.updateStatusUI();
    this._setTimeout(() => this.startQuestRound(), 1000);
  }

  async getAIVote(player) {
    const messages = this.buildAIContext(
      player,
      `当前提议的任务队伍是：${this.formatPlayerNames(this.currentTeam)}。
请只回复“同意”或“反对”。`
    );

    const response = await this.callAI(player, messages, {
      temperature: 0.4,
      maxTokens: 20,
      silent: true,
    });
    if (this._d()) return 'reject';

    if (response?.includes('同意') || response?.toLowerCase().includes('approve')) return 'approve';
    if (response?.includes('反对') || response?.toLowerCase().includes('reject')) return 'reject';
    return this.getFallbackVote(player);
  }

  getFallbackVote(player) {
    const evilOnTeam = this.currentTeam.filter(id => this.isEvil(this.players[id].role)).length;
    if (this.rejectedTeams >= 4) {
      return this.isEvil(player.role) ? 'reject' : 'approve';
    }
    if (this.isEvil(player.role)) {
      return evilOnTeam > 0 ? 'approve' : 'reject';
    }
    if (player.role === 'merlin') {
      return evilOnTeam > 0 ? 'reject' : 'approve';
    }
    if (this.currentTeam.includes(player.id)) {
      return 'approve';
    }
    return Math.random() < 0.6 ? 'approve' : 'reject';
  }

  async runQuest() {
    if (this._d() || this.state !== 'playing') return;

    this.phase = 'quest';
    this.setPhaseIndicator('⚔️ 执行任务', 'night');
    this.updateStatusUI();
    this.addSystemMessage(`任务队伍出发：${this.formatPlayerNames(this.currentTeam)}。`, 'important');

    const teamPlayers = this.currentTeam.map(id => this.players[id]);
    const evilTeamPlayers = teamPlayers.filter(p => this.isEvil(p.role));
    let failCount = 0;

    if (this.user && this.currentTeam.includes(this.user.id)) {
      const userAction = await this.getUserQuestAction();
      if (this._d()) return;
      if (userAction === 'fail') failCount++;
      this.addPrivateMessage(`你提交了：${userAction === 'fail' ? '失败' : '成功'} 卡`);
    }

    const remainingEvil = evilTeamPlayers.filter(p => !p.isUser);
    for (let i = 0; i < remainingEvil.length; i++) {
      const player = remainingEvil[i];
      const action = this.getAIQuestAction(player, failCount, remainingEvil.length - i);
      if (action === 'fail') failCount++;
    }

    for (const member of teamPlayers) {
      if (member.isUser) {
        this.addSystemMessage(`${member.name} 已提交任务卡`);
      } else if (this.isEvil(member.role)) {
        this.addSystemMessage(`${member.name} 秘密提交了一张任务卡`);
      } else {
        this.addSystemMessage(`${member.name} 已提交任务卡`);
      }
      await this.sleep(180);
      if (this._d()) return;
    }

    const requiredFails = this.needsTwoFailsForCurrentQuest() ? 2 : 1;
    const success = failCount < requiredFails;
    this.questResults.push({ success, fails: failCount });
    this.questHistory.push({ quest: this.questIndex + 1, team: [...this.currentTeam], success, fails: failCount });

    if (success) {
      this.addSystemMessage(`任务成功！本轮出现 ${failCount} 张失败卡。`, 'success');
    } else {
      this.addSystemMessage(`任务失败！本轮出现 ${failCount} 张失败卡。`, 'danger');
    }

    this.questIndex++;
    this.advanceLeader();
    this.currentTeam = [];
    this.updateStatusUI();

    if (this.failedQuests >= 3) {
      this.endGame('evil', '邪恶阵营完成了三次破坏任务。');
      return;
    }

    if (this.successfulQuests >= 3) {
      this._setTimeout(() => this.startAssassinationPhase(), 1400);
      return;
    }

    this._setTimeout(() => this.startQuestRound(), 1400);
  }

  async getUserQuestAction() {
    const user = this.user;
    if (!user || !this.currentTeam.includes(user.id)) return 'success';
    if (!this.isEvil(user.role)) {
      await this.waitForUserChoice('你在任务队中。好人只能提交成功卡。', [
        { id: 'success', label: '✅ 提交成功' },
      ]);
      return 'success';
    }
    return this.waitForUserChoice('你在任务队中。要提交哪张卡？', [
      { id: 'success', label: '✅ 成功' },
      { id: 'fail', label: '❌ 失败' },
    ]);
  }

  getAIQuestAction(player, currentFails, remainingEvilCount) {
    if (!this.isEvil(player.role)) return 'success';

    const requiredFails = this.needsTwoFailsForCurrentQuest() ? 2 : 1;
    const totalEvilOnTeam = this.currentTeam.filter(id => this.isEvil(this.players[id].role)).length;

    if (this.needsTwoFailsForCurrentQuest() && totalEvilOnTeam < 2) return 'success';
    if (currentFails >= requiredFails) return 'success';
    if (this.failedQuests >= 2 || this.successfulQuests >= 2) return 'fail';
    if (this.questIndex === 0 && totalEvilOnTeam === 1) return 'success';
    if (remainingEvilCount <= requiredFails - currentFails) return 'fail';
    return currentFails === 0 ? 'fail' : 'success';
  }

  async startAssassinationPhase() {
    if (this._d() || this.state !== 'playing') return;

    this.phase = 'assassination';
    this.setPhaseIndicator('🎯 刺杀阶段', 'night');
    this.updateStatusUI();
    this.addSystemMessage('好人已完成三次任务。刺客现在要找出梅林。', 'important');

    const assassin = this.players.find(p => p.role === 'assassin');
    if (!assassin) {
      this.endGame('good', '好人阵营完成三次任务并成功躲过刺杀。');
      return;
    }

    const options = this.players.filter(p => p.id !== assassin.id);
    const targetId = assassin.isUser
      ? await this.waitForUserChoice('你是刺客，请选择要刺杀的对象', options.map(p => ({
          id: p.id,
          label: `${p.avatar} ${p.name}`,
        })))
      : await this.getAIAssassinationTarget(assassin, options);

    if (this._d()) return;

    const target = this.players.find(p => p.id === targetId) || options[0];
    this.addSystemMessage(`刺客 ${assassin.name} 指认 ${target.name} 是梅林。`, 'danger');

    if (target.role === 'merlin') {
      this.endGame('evil', `刺杀成功！${target.name} 的真实身份正是梅林。`);
    } else {
      this.endGame('good', `刺杀失败！${target.name} 不是梅林，好人阵营守住了胜利。`);
    }
  }

  async getAIAssassinationTarget(player, candidates) {
    const messages = this.buildAIContext(
      player,
      `你是刺客。候选目标有：${candidates.map(p => p.name).join('、')}。
请只回复一个你最像梅林的名字。`
    );

    const response = await this.callAI(player, messages, {
      temperature: 0.5,
      maxTokens: 30,
    });
    if (this._d()) return candidates[0]?.id ?? 0;

    const parsed = this.extractNamedPlayers(response || '', candidates, 1);
    if (parsed.length === 1) return parsed[0];
    return this.getFallbackAssassinationTarget(candidates);
  }

  getFallbackAssassinationTarget(candidates) {
    const percival = this.players.find(p => p.role === 'percival');
    if (percival && candidates.some(p => p.id === percival.id)) return percival.id;

    const trustedGood = [...this.questHistory]
      .filter(q => q.success)
      .flatMap(q => q.team)
      .map(id => this.players[id])
      .filter(Boolean)
      .filter(p => !this.isEvil(p.role));
    if (trustedGood.length) return trustedGood[0].id;

    return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? 0;
  }

  buildAIContext(player, situationPrompt) {
    const publicLog = this.messages.slice(-30).map(m => {
      if (m.type === 'system') return `[系统] ${m.text}`;
      return `[${m.player.name}] ${m.text}`;
    }).join('\n');

    const questSummary = this.config.questSizes.map((size, index) => {
      const result = this.questResults[index];
      if (!result) return `任务${index + 1}: ${size}人`;
      return `任务${index + 1}: ${result.success ? '成功' : `失败(${result.fails}张失败卡)`}`;
    }).join('\n');

    const system = `你正在玩一局阿瓦隆。你的名字是"${player.name}"。

【你的身份】
${player.privateMemory.join('\n')}

【当前局势】
- 当前任务：第 ${this.displayQuestNumber} 轮
- 当前队长：${this.currentLeader?.name || '未知'}
- 当前任务需要人数：${this.currentQuestSize}
- 连续被否决次数：${this.rejectedTeams} / 5
- 任务比分：好人 ${this.successfulQuests} : ${this.failedQuests} 邪恶
- 本轮任务是否需要两张失败卡：${this.needsTwoFailsForCurrentQuest() ? '是' : '否'}
- 当前提议队伍：${this.currentTeam.length ? this.formatPlayerNames(this.currentTeam) : '尚未提议'}

【任务记录】
${questSummary}

【发言要求】
- 只用中文回复
- 像真人玩家一样自然、克制、简短
- 不要暴露你是 AI
- 邪恶阵营必须伪装成好人
- 梅林要尽量引导正确队伍，但避免暴露自己`;

    return [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `【公开记录】\n${publicLog || '暂无'}\n\n${situationPrompt}`,
      },
    ];
  }

  extractNamedPlayers(response, candidates, needed) {
    const hits = candidates
      .map(p => ({ id: p.id, idx: response.indexOf(p.name) }))
      .filter(x => x.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    const result = [];
    const seen = new Set();
    for (const hit of hits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      result.push(hit.id);
      if (result.length >= needed) break;
    }
    return result;
  }

  isEvil(role) {
    return ROLE_INFO[role]?.team === 'evil';
  }

  needsTwoFailsForCurrentQuest() {
    return this.config.twoFailsQuest === this.questIndex;
  }

  formatPlayerNames(ids) {
    return ids.map(id => this.players[id]?.name || `玩家${id}`).join('、');
  }

  advanceLeader() {
    this.leaderIndex = (this.leaderIndex + 1) % this.players.length;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  buildRoleSummary() {
    return this.players
      .map(p => `${p.name}: ${ROLE_INFO[p.role].emoji}${ROLE_INFO[p.role].name}`)
      .join(' | ');
  }

  endGame(winner, message) {
    this.gameResult = winner;
    this.addSystemMessage(`🎉 游戏结束！${message}`, winner === 'good' ? 'success' : 'danger');
    this.addSystemMessage(`身份揭晓：${this.buildRoleSummary()}`, 'important');

    const userWon = (winner === 'good' && !this.isEvil(this.user.role)) ||
      (winner === 'evil' && this.isEvil(this.user.role));
    const role = ROLE_INFO[this.user.role];

    this.showGameOver({
      icon: userWon ? '🎉' : '😢',
      title: userWon ? '恭喜你赢了！' : '游戏失败',
      message,
      subtitle: `你的身份：${role.emoji} ${role.name}`,
      extra: this.buildRoleSummary(),
    });
  }
}

registerGame({
  id: 'avalon',
  name: '阿瓦隆',
  icon: '🏰',
  tag: '阵营博弈',
  description: '经典隐藏身份推理游戏。队长组队、全员投票、任务成败与最终刺杀交织在一起，适合观察不同模型的阵营演技。',
  playerRange: '5-8 人',
  duration: '10-25 分钟',
  features: '🗳 组队投票',
  GameClass: AvalonGame,
});
