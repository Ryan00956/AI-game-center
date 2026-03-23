/**
 * Undercover Game (谁是卧底)
 * 
 * Rules:
 * - All players get a word. Most get the same "civilian" word.
 * - 1-2 players get a similar but different "undercover" word.
 * - Optionally 1 player gets no word (blank/白板).
 * - Each round: describe your word → vote out someone.
 * 
 * Each AI player can be assigned a different API profile (model).
 */
import { aiService } from '../ai-service.js';

const AVATARS = ['🧑', '👩', '👨', '🧓', '👴', '👱', '🧔', '👲'];
const AI_NAMES = ['小明', '小红', '小刚', '小丽', '小华', '小芳', '小强'];

const PROFILE_COLORS = ['#4f7cff', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#f97316'];

// Word pairs: [civilian word, undercover word]
const WORD_PAIRS = [
  ['苹果', '梨子'],
  ['眼镜', '墨镜'],
  ['牛奶', '豆浆'],
  ['面包', '蛋糕'],
  ['足球', '篮球'],
  ['筷子', '叉子'],
  ['电脑', '平板'],
  ['高铁', '地铁'],
  ['微信', '支付宝'],
  ['冰箱', '空调'],
  ['书包', '手提包'],
  ['手机', '电话'],
  ['西瓜', '哈密瓜'],
  ['可乐', '雪碧'],
  ['沙发', '椅子'],
  ['医生', '护士'],
  ['钢琴', '吉他'],
  ['太阳', '月亮'],
  ['大海', '湖泊'],
  ['饺子', '馄饨'],
  ['火锅', '烧烤'],
  ['猫', '狗'],
  ['玫瑰', '百合'],
  ['雨伞', '雨衣'],
  ['口红', '唇膏'],
  ['饼干', '薯片'],
  ['公交车', '出租车'],
  ['泡面', '米线'],
  ['毛巾', '浴巾'],
  ['枕头', '抱枕'],
];

export class UndercoverGame {
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.state = 'setup';
    this.players = [];
    this.roundCount = 0;
    this.messages = [];
    this.civilianWord = '';
    this.undercoverWord = '';
    this.userName = '';
    this.playerCount = 6;
    this.undercoverCount = 1;
    this.hasBlank = false;
    this.isProcessing = false;
    this.gameResult = null;
    // Per-player profile assignments
    this.playerProfiles = {};

    this.renderSetup();
  }

  // ─── Setup ───
  renderSetup() {
    const profiles = aiService.profiles;
    const aiCount = this.playerCount - 1;
    const defaultProfile = aiService.getDefaultProfile();

    for (let i = 0; i < aiCount; i++) {
      if (!this.playerProfiles[i]) {
        this.playerProfiles[i] = defaultProfile?.id || '';
      }
    }

    this.container.innerHTML = `
      <div class="game-header">
        <div class="game-header-left">
          <button class="btn-back" id="btn-back">←</button>
          <div class="game-title-area">
            <h2>🕵️ 谁是卧底</h2>
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
            <label class="form-label">总玩家数</label>
            <select class="form-input" id="select-player-count">
              <option value="5" ${this.playerCount === 5 ? 'selected' : ''}>5人 (4平民 + 1卧底)</option>
              <option value="6" ${this.playerCount === 6 ? 'selected' : ''}>6人 (4平民 + 1卧底 + 1白板)</option>
              <option value="7" ${this.playerCount === 7 ? 'selected' : ''}>7人 (5平民 + 2卧底)</option>
              <option value="8" ${this.playerCount === 8 ? 'selected' : ''}>8人 (5平民 + 2卧底 + 1白板)</option>
            </select>
          </div>
        </div>

        <div class="setup-section">
          <div class="setup-section-title">🤖 AI 玩家模型分配</div>
          <p class="form-hint" style="margin-bottom:12px;">为每个 AI 玩家分配不同的大模型，观看不同模型之间的对决！</p>
          <div class="ai-player-list" id="ai-player-list">
            ${this.renderAIPlayerAssignments(aiCount, profiles)}
          </div>
          ${profiles.length === 0 ? '<p class="form-hint" style="margin-top:8px;color:var(--accent-orange);">⚠️ 还没有配置模型档案，请先在右上角「模型配置」中添加</p>' : ''}
        </div>

        <button class="btn btn-primary btn-block" id="btn-start-game" style="margin-top:8px">
          🎲 开始游戏
        </button>
      </div>
    `;

    document.getElementById('btn-back')?.addEventListener('click', () => this.app.navigate('home'));

    document.getElementById('select-player-count')?.addEventListener('change', (e) => {
      this.playerCount = parseInt(e.target.value);
      const newAiCount = this.playerCount - 1;
      const def = aiService.getDefaultProfile();
      for (let i = 0; i < newAiCount; i++) {
        if (!this.playerProfiles[i]) {
          this.playerProfiles[i] = def?.id || '';
        }
      }
      document.getElementById('ai-player-list').innerHTML =
        this.renderAIPlayerAssignments(newAiCount, aiService.profiles);
      this.bindProfileSelectors(newAiCount);
    });

    this.bindProfileSelectors(aiCount);

    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      const name = document.getElementById('input-player-name').value.trim();
      if (!name) {
        this.app.showToast('请输入你的名字', 'error');
        return;
      }
      if (aiService.profiles.length === 0) {
        this.app.showToast('请先在「模型配置」中添加至少一个 AI 模型', 'error');
        return;
      }
      this.userName = name;
      this.playerCount = parseInt(document.getElementById('select-player-count').value);
      this.startGame();
    });
  }

  renderAIPlayerAssignments(aiCount, profiles) {
    const names = AI_NAMES.slice(0, aiCount);
    return names.map((name, i) => {
      const selectedId = this.playerProfiles[i] || '';
      const profileIdx = profiles.findIndex(p => p.id === selectedId);
      const color = profileIdx >= 0 ? PROFILE_COLORS[profileIdx % PROFILE_COLORS.length] : '#666';
      return `
        <div class="ai-player-row">
          <div class="player-avatar">${AVATARS[i % AVATARS.length]}</div>
          <span class="player-name">${name}</span>
          <div class="model-color-indicator" style="background:${color}" id="dot-${i}"></div>
          <select class="form-input" id="profile-select-${i}" data-slot="${i}">
            ${profiles.length === 0 ? '<option value="">无可用模型</option>' : ''}
            ${profiles.map((p, pi) => `
              <option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name} (${p.model})</option>
            `).join('')}
          </select>
        </div>
      `;
    }).join('');
  }

  bindProfileSelectors(aiCount) {
    for (let i = 0; i < aiCount; i++) {
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

  // ─── Game Init ───
  startGame() {
    this.state = 'playing';
    this.roundCount = 0;
    this.messages = [];
    this.gameResult = null;

    const config = this.getConfig(this.playerCount);
    this.undercoverCount = config.undercover;
    this.hasBlank = config.blank;

    const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
    if (Math.random() < 0.5) {
      this.civilianWord = pair[0];
      this.undercoverWord = pair[1];
    } else {
      this.civilianWord = pair[1];
      this.undercoverWord = pair[0];
    }

    const roles = [];
    for (let i = 0; i < config.civilian; i++) roles.push('civilian');
    for (let i = 0; i < config.undercover; i++) roles.push('undercover');
    if (config.blank) roles.push('blank');

    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const aiNames = AI_NAMES.slice(0, this.playerCount - 1);
    const userPos = Math.floor(Math.random() * this.playerCount);

    this.players = [];
    let aiIdx = 0;
    for (let i = 0; i < this.playerCount; i++) {
      const role = roles[i];
      const word = role === 'civilian' ? this.civilianWord :
                   role === 'undercover' ? this.undercoverWord : '（无词）';
      if (i === userPos) {
        this.players.push({
          id: i,
          name: this.userName,
          isUser: true,
          role,
          word,
          alive: true,
          avatar: '🎮',
          descriptions: [],
          profileId: null,
        });
      } else {
        const profileId = this.playerProfiles[aiIdx] || aiService.getDefaultProfile()?.id || null;
        const profile = aiService.getProfile(profileId);
        this.players.push({
          id: i,
          name: aiNames[aiIdx],
          isUser: false,
          role,
          word,
          alive: true,
          avatar: AVATARS[aiIdx % AVATARS.length],
          descriptions: [],
          profileId,
          modelName: profile?.name || profile?.model || '未知',
        });
        aiIdx++;
      }
    }

    this.renderGameUI();
    this.showWordReveal();
  }

  getConfig(count) {
    switch (count) {
      case 5: return { civilian: 4, undercover: 1, blank: false };
      case 6: return { civilian: 4, undercover: 1, blank: true };
      case 7: return { civilian: 5, undercover: 2, blank: false };
      case 8: return { civilian: 5, undercover: 2, blank: true };
      default: return { civilian: 4, undercover: 1, blank: false };
    }
  }

  get userPlayer() {
    return this.players.find(p => p.isUser);
  }

  get alivePlayers() {
    return this.players.filter(p => p.alive);
  }

  get aliveUndercovers() {
    return this.players.filter(p => p.alive && p.role === 'undercover');
  }

  // ─── Game UI ───
  renderGameUI() {
    this.container.innerHTML = `
      <div class="game-header">
        <div class="game-header-left">
          <button class="btn-back" id="btn-back">←</button>
          <div class="game-title-area">
            <h2>🕵️ 谁是卧底</h2>
            <span id="game-status-text">游戏进行中...</span>
          </div>
        </div>
        <div>
          <span class="phase-indicator day" id="phase-badge">🗣 描述阶段</span>
        </div>
      </div>
      <div class="game-area">
        <div class="players-panel" id="players-panel">
          <h4>玩家列表</h4>
          ${this.renderPlayerList()}
        </div>
        <div class="game-log" id="game-log">
          <div class="game-log-header">
            <span>游戏记录</span>
            <span id="round-info">准备中...</span>
          </div>
          <div class="game-log-messages" id="game-messages"></div>
          <div id="action-area"></div>
          <div class="game-input-area" id="input-area" style="display:none">
            <div class="game-input-row">
              <input type="text" class="game-input" id="game-input" 
                placeholder="输入你对词语的描述..." disabled />
              <button class="btn-send" id="btn-send" disabled>➤</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-back')?.addEventListener('click', () => {
      if (confirm('确定要退出游戏吗？')) this.app.navigate('home');
    });

    const msgContainer = document.getElementById('game-messages');
    this.messages.forEach(msg => {
      msgContainer.appendChild(this.createMessageElement(msg));
    });
  }

  renderPlayerList() {
    return this.players.map(p => {
      const showRole = !p.alive || this.state === 'gameover';
      const roleLabel = p.role === 'civilian' ? '平民' : p.role === 'undercover' ? '卧底' : '白板';
      const roleColor = p.role === 'civilian' ? 'villager' : p.role === 'undercover' ? 'werewolf' : 'seer';
      return `
        <div class="player-item ${p.alive ? '' : 'eliminated'} ${p.isUser ? 'is-user' : ''}" data-pid="${p.id}">
          <div class="player-avatar">${p.avatar}</div>
          <span class="player-name">${p.name}${p.isUser ? ' (你)' : ''}</span>
          ${!p.isUser && p.modelName ? `<span class="player-model-tag">${p.modelName}</span>` : ''}
          ${showRole && !p.isUser ? `<span class="player-role-badge ${roleColor}">${roleLabel}</span>` : ''}
          ${p.isUser ? `<span class="player-role-badge ${roleColor}">${roleLabel}</span>` : ''}
          ${!p.alive ? '<span style="font-size:11px;color:var(--accent-red)">💀</span>' : ''}
        </div>
      `;
    }).join('');
  }

  updatePlayerList() {
    const panel = document.getElementById('players-panel');
    if (panel) panel.innerHTML = `<h4>玩家列表</h4>${this.renderPlayerList()}`;
  }

  showWordReveal() {
    const user = this.userPlayer;

    this.addSystemMessage('游戏开始！每位玩家已收到自己的词语。');
    
    const area = document.getElementById('action-area');
    if (area) {
      area.innerHTML = `
        <div class="word-reveal">
          <p>🎴 你收到的词语是：</p>
          <div class="your-word">${user.word}</div>
          <p>${user.role === 'blank' ? '你没有词语，请根据其他人的描述来伪装自己！' : '请用一句话描述你的词语，但不要说得太明显！'}</p>
          <button class="btn btn-primary" id="btn-word-confirm" style="margin-top:16px">我准备好了 ✓</button>
        </div>
      `;
    }

    document.getElementById('btn-word-confirm')?.addEventListener('click', () => {
      area.innerHTML = '';
      this.startRound();
    });
  }

  // ─── Round Flow ───
  async startRound() {
    this.roundCount++;
    const badge = document.getElementById('phase-badge');
    if (badge) badge.textContent = `🗣 第${this.roundCount}轮描述`;
    const roundInfo = document.getElementById('round-info');
    if (roundInfo) roundInfo.textContent = `第 ${this.roundCount} 轮`;

    this.addSystemMessage(`📢 第 ${this.roundCount} 轮开始！请每位玩家依次描述自己的词语`, 'important');

    const alive = this.alivePlayers;

    for (const player of alive) {
      if (!player.alive || this.state !== 'playing') break;

      if (player.isUser) {
        await this.userDescribe();
      } else {
        await this.aiDescribe(player);
      }
    }

    if (this.state !== 'playing') return;

    await this.startVote();
  }

  async userDescribe() {
    this.addSystemMessage('轮到你描述了，请输入你对词语的描述');

    const inputArea = document.getElementById('input-area');
    const input = document.getElementById('game-input');
    const btn = document.getElementById('btn-send');

    if (inputArea) inputArea.style.display = 'block';
    if (input) { input.disabled = false; input.placeholder = '描述你的词语（不要直接说出来）...'; input.focus(); }
    if (btn) btn.disabled = false;

    return new Promise(resolve => {
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.disabled = true;
        btn.disabled = true;
        this.userPlayer.descriptions.push(text);
        this.addPlayerMessage(this.userPlayer, text);
        resolve(text);
      };

      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  async aiDescribe(player) {
    this.showThinking(player);

    try {
      const prompt = this.buildDescribePrompt(player);
      const response = await aiService.chat(prompt, { temperature: 0.9, maxTokens: 100 }, player.profileId);
      this.hideThinking();
      player.descriptions.push(response);
      this.addPlayerMessage(player, response);
    } catch (err) {
      this.hideThinking();
      this.addSystemMessage(`⚠️ ${player.name} (${player.modelName}) API调用失败: ${err.message}`, 'danger');
      const desc = this.getFallbackDescription(player);
      player.descriptions.push(desc);
      this.addPlayerMessage(player, desc);
      console.error(`AI ${player.name} (${player.modelName}) error:`, err);
    }

    await this.sleep(600);
  }

  buildDescribePrompt(player) {
    const recentMessages = this.messages.slice(-15).map(m => {
      if (m.type === 'system') return `[系统]: ${m.text}`;
      return `[${m.player.name}]: ${m.text}`;
    }).join('\n');

    const prevDescs = player.descriptions.length > 0
      ? `你之前的描述: ${player.descriptions.join('; ')}`
      : '';

    let roleInfo = '';
    if (player.role === 'civilian') {
      roleInfo = `你的词语是"${player.word}"。你是平民，大多数人和你拿的词一样。你需要描述你的词语来证明你不是卧底，但不要说得太具体以免卧底获得线索。`;
    } else if (player.role === 'undercover') {
      roleInfo = `你的词语是"${player.word}"。你是卧底，你的词和平民的词不太一样但很相似。你需要伪装成平民，让别人以为你也是平民。注意根据其他人的描述来调整你的发言，让你的描述看起来和大家一样。`;
    } else {
      roleInfo = `你是白板，没有词语。你需要根据其他人的描述来猜测词语是什么，然后伪装成平民。`;
    }

    return [
      {
        role: 'system',
        content: `你在玩"谁是卧底"游戏。你的名字是"${player.name}"。
${roleInfo}
${prevDescs}

规则：
1. 用一句简短的中文描述你的词语
2. 不要直接说出词语本身
3. 描述要自然，像真人一样说话
4. 不要重复之前的描述
5. 描述要有技巧：足够让同伴认出你，但不要让卧底猜到具体词语`,
      },
      {
        role: 'user',
        content: `之前的游戏记录:\n${recentMessages}\n\n请用一句话描述你的词语:`,
      },
    ];
  }

  getFallbackDescription(player) {
    const fallbacks = {
      civilian: [
        '这个东西在日常生活中很常见。',
        '大多数人都用过这个。',
        '这是一个比较实用的东西。',
        '它通常和另一个类似的东西一起被提到。',
        '我觉得大部分家庭里都有这个。',
      ],
      undercover: [
        '这个东西大家应该都不陌生。',
        '我觉得这玩意儿挺普遍的。',
        '平时也经常能看到。',
        '它有自己独特的用途。',
        '和同类的东西相比有些不同。',
      ],
      blank: [
        '这东西有点说不上来，但挺普通的。',
        '我觉得大家都应该见过。',
        '嗯，反正就是日常能见到的。',
        '这个嘛，怎么说呢，很常见。',
        '应该大部分人都接触过。',
      ],
    };
    const pool = fallbacks[player.role] || fallbacks.civilian;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ─── Voting ───
  async startVote() {
    const badge = document.getElementById('phase-badge');
    if (badge) badge.textContent = `🗳 投票淘汰`;

    this.addSystemMessage('🗳 投票阶段！请选择你认为是卧底的玩家', 'important');

    const alive = this.alivePlayers;
    const votes = {};
    // Record how many messages exist before voting, so AI prompts won't include any vote info
    const preVoteMessageCount = this.messages.length;

    if (this.userPlayer.alive) {
      const target = await this.waitForUserChoice(
        '选择你认为是卧底的人',
        [
          ...alive.filter(p => !p.isUser).map(p => ({ id: p.id, label: `${p.avatar} ${p.name}` })),
          { id: 'skip', label: '🟡 弃票' },
        ]
      );
      if (target !== 'skip') {
        votes[this.userPlayer.id] = target;
      }
      // Only show a neutral message — no vote target revealed
      this.addSystemMessage(`${this.userPlayer.name} 已投票`);
    }

    for (const player of alive) {
      if (player.isUser) continue;
      await this.sleep(400);
      const vote = await this.getAIVote(player, preVoteMessageCount);
      if (vote !== null) {
        votes[player.id] = vote;
      }
      // Neutral message only
      this.addSystemMessage(`${player.name} 已投票`);
    }

    // Reveal all votes together after everyone has voted
    this.addSystemMessage('📊 所有人已完成投票，结果如下：', 'important');
    for (const player of alive) {
      const targetId = votes[player.id];
      if (targetId !== undefined) {
        this.addSystemMessage(`${player.name} → ${this.players[targetId].name}`);
      } else {
        this.addSystemMessage(`${player.name} 弃票`);
      }
    }

    await this.sleep(500);
    this.resolveVote(votes);
  }

  async getAIVote(player, preVoteMessageCount) {
    try {
      const alive = this.alivePlayers.filter(p => p.id !== player.id);
      const prompt = this.buildVotePrompt(player, alive, preVoteMessageCount);
      const response = await aiService.chat(prompt, { temperature: 0.5, maxTokens: 50 }, player.profileId);

      // Check if AI chose to abstain
      if (response.includes('弃票') || response.includes('skip')) {
        return null;
      }

      for (const target of alive) {
        if (response.includes(target.name)) {
          return target.id;
        }
      }
      return this.getAIFallbackVote(player, alive);
    } catch (err) {
      this.addSystemMessage(`⚠️ ${player.name} 投票API失败: ${err.message}`, 'danger');
      return this.getAIFallbackVote(player, this.alivePlayers.filter(p => p.id !== player.id));
    }
  }

  getAIFallbackVote(player, candidates) {
    if (player.role === 'undercover') {
      const civilians = candidates.filter(c => c.role === 'civilian');
      if (civilians.length > 0) {
        return civilians[Math.floor(Math.random() * civilians.length)].id;
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? null;
  }

  buildVotePrompt(player, candidates, preVoteMessageCount) {
    // Only include messages from before the voting phase to prevent information leakage
    const messagesBeforeVote = this.messages.slice(0, preVoteMessageCount);
    const recentMessages = messagesBeforeVote.slice(-20).map(m => {
      if (m.type === 'system') return `[系统]: ${m.text}`;
      return `[${m.player.name}]: ${m.text}`;
    }).join('\n');

    let roleHint = '';
    if (player.role === 'undercover') {
      roleHint = `你是卧底，你的词是"${player.word}"。平民的词和你的不同但相似。你应该投给你认为和自己描述不同的人（可能是平民），避免投给其他卧底。`;
    } else if (player.role === 'civilian') {
      roleHint = `你是平民，你的词是"${player.word}"。你需要找出谁的描述和大家不太一样，投给你觉得是卧底的人。`;
    } else {
      roleHint = `你是白板，你没有词语。根据其他人的描述来判断谁可能是卧底。`;
    }

    return [
      {
        role: 'system',
        content: `你在玩"谁是卧底"。你的名字是"${player.name}"。
${roleHint}
候选人: ${candidates.map(p => p.name).join(', ')}
你可以选择投票给一个候选人，也可以选择"弃票"。
请只回复你要投票的一个玩家的名字，或者回复"弃票"。`,
      },
      {
        role: 'user',
        content: `游戏记录:\n${recentMessages}\n\n请投票，只回复一个名字或"弃票":`,
      },
    ];
  }

  resolveVote(votes) {
    const tally = {};
    Object.values(votes).forEach(targetId => {
      tally[targetId] = (tally[targetId] || 0) + 1;
    });

    if (Object.keys(tally).length === 0) {
      this.addSystemMessage('本轮没有人被投票淘汰');
      if (this.checkWinCondition()) return;
      setTimeout(() => this.startRound(), 1500);
      return;
    }

    let maxVotes = 0;
    let maxId = null;
    let tie = false;

    for (const [id, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        maxId = parseInt(id);
        tie = false;
      } else if (count === maxVotes) {
        tie = true;
      }
    }

    if (tie) {
      this.addSystemMessage('投票平票，本轮没有人被淘汰');
    } else {
      const eliminated = this.players[maxId];
      eliminated.alive = false;
      const roleLabel = eliminated.role === 'civilian' ? '平民' :
                        eliminated.role === 'undercover' ? '卧底' : '白板';
      this.addSystemMessage(
        `投票结果：${eliminated.name} 被淘汰了！身份是：${roleLabel}`,
        eliminated.role === 'undercover' ? 'success' : 'danger'
      );
      // Word is NOT revealed mid-game to anyone — only shown at game over
    }

    this.updatePlayerList();

    if (this.checkWinCondition()) return;

    setTimeout(() => this.startRound(), 2000);
  }

  // ─── Win Condition ───
  checkWinCondition() {
    const aliveUC = this.aliveUndercovers;
    const aliveAll = this.alivePlayers;

    if (aliveAll.length <= 3 && aliveUC.length > 0) {
      this.endGame('undercover', '卧底获胜！卧底成功存活到最后！');
      return true;
    }

    if (aliveUC.length === 0) {
      this.endGame('civilian', '平民获胜！所有卧底已被淘汰！');
      return true;
    }

    return false;
  }

  endGame(winner, message) {
    this.state = 'gameover';
    this.gameResult = winner;

    this.addSystemMessage(`🎉 游戏结束！${message}`, winner === 'civilian' ? 'success' : 'danger');
    this.addSystemMessage(`平民词语：${this.civilianWord} | 卧底词语：${this.undercoverWord}`, 'important');
    
    this.updatePlayerList();

    const userRole = this.userPlayer.role;
    const userWon = (winner === 'civilian' && userRole !== 'undercover') ||
                    (winner === 'undercover' && userRole === 'undercover');

    const roleLabel = userRole === 'civilian' ? '平民' :
                      userRole === 'undercover' ? '卧底' : '白板';

    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    overlay.id = 'game-over';
    overlay.innerHTML = `
      <div class="game-over-card">
        <div class="game-over-icon">${userWon ? '🎉' : '😢'}</div>
        <h2>${userWon ? '恭喜你赢了！' : '游戏失败'}</h2>
        <p>${message}</p>
        <p style="color:var(--text-muted);font-size:13px;">
          你的身份：${roleLabel} | 你的词语：${this.userPlayer.word}
        </p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:8px;">
          平民词：${this.civilianWord} | 卧底词：${this.undercoverWord}
        </p>
        <div class="game-over-actions" style="margin-top:20px">
          <button class="btn btn-primary" id="btn-play-again">🔄 再来一局</button>
          <button class="btn btn-ghost" id="btn-go-home">🏠 返回大厅</button>
        </div>
      </div>
    `;

    document.getElementById('app').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      overlay.remove();
      this.renderSetup();
    });
    document.getElementById('btn-go-home')?.addEventListener('click', () => {
      overlay.remove();
      this.app.navigate('home');
    });
  }

  // ─── Shared Helpers ───
  addSystemMessage(text, type = '') {
    const msg = { type: 'system', text, subtype: type };
    this.messages.push(msg);
    const container = document.getElementById('game-messages');
    if (container) {
      container.appendChild(this.createMessageElement(msg));
      container.scrollTop = container.scrollHeight;
    }
  }

  /** Render a hint visible only in the UI; NOT added to this.messages so AI cannot read it. */
  addPrivateHint(text) {
    const container = document.getElementById('game-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'msg';
    el.innerHTML = `<div class="msg-system" style="opacity:0.7;font-style:italic;">👁 ${text}</div>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  addPlayerMessage(player, text) {
    const msg = { type: 'player', player, text };
    this.messages.push(msg);
    const container = document.getElementById('game-messages');
    if (container) {
      container.appendChild(this.createMessageElement(msg));
      container.scrollTop = container.scrollHeight;
    }
  }

  createMessageElement(msg) {
    const el = document.createElement('div');
    el.className = 'msg';
    if (msg.type === 'system') {
      el.innerHTML = `<div class="msg-system ${msg.subtype || ''}">${msg.text}</div>`;
    } else {
      const isUser = msg.player.isUser;
      const modelBadge = !isUser && msg.player.modelName
        ? `<span class="msg-model-badge">${msg.player.modelName}</span>`
        : '';
      el.innerHTML = `
        <div class="msg-player ${isUser ? 'is-user' : ''}">
          <div class="msg-avatar">${msg.player.avatar}</div>
          <div class="msg-body">
            <div class="msg-name">${msg.player.name}${isUser ? ' (你)' : ''}${modelBadge}</div>
            <div class="msg-text">${msg.text}</div>
          </div>
        </div>
      `;
    }
    return el;
  }

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
      </div>
    `;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  hideThinking() {
    document.getElementById('thinking-indicator')?.remove();
  }

  waitForUserChoice(title, options) {
    return new Promise(resolve => {
      const area = document.getElementById('action-area');
      if (!area) return;

      area.innerHTML = `
        <div class="action-panel">
          <h4>${title}</h4>
          <div class="action-buttons" id="choice-buttons">
            ${options.map(o => `
              <button class="btn-vote ${o.id === 'skip' ? 'skip' : ''}" data-choice="${o.id}">${o.label}</button>
            `).join('')}
          </div>
        </div>
      `;

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

      const container = document.getElementById('game-messages');
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
