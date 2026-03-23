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
import { registerGame } from '../game-registry.js';
import { BaseGame, AVATARS, AI_NAMES } from './base-game.js';

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

export class UndercoverGame extends BaseGame {
  constructor(container, app) {
    super(container, app);
    this.roundCount = 0;
    this.civilianWord = '';
    this.undercoverWord = '';
    this.userName = '';
    this.playerCount = 6;
    this.undercoverCount = 1;
    this.hasBlank = false;
    this.isProcessing = false;
    this.renderSetup();
  }

  // ─── Setup ───
  renderSetup() {
    const profiles = aiService.profiles;
    const aiCount = this.playerCount - 1;
    this.initDefaultProfiles(aiCount);

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
            ${this.renderAISlots(aiCount, profiles)}
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
      this.initDefaultProfiles(newAiCount);
      document.getElementById('ai-player-list').innerHTML =
        this.renderAISlots(newAiCount, aiService.profiles);
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
    this.renderGameLayout({
      title: '谁是卧底',
      emoji: '🕵️',
      phaseLabel: '🗣 描述阶段',
      phaseClass: 'day',
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
    this.setPhaseIndicator(`🗣 第${this.roundCount}轮描述`);
    this.setRoundInfo(`第 ${this.roundCount} 轮`);

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
    const text = await this.waitForUserInput('描述你的词语（不要直接说出来）...');
    if (this._d()) return;
    this.userPlayer.descriptions.push(text);
    this.addPlayerMessage(this.userPlayer, text);
    return text;
  }

  async aiDescribe(player) {
    const prompt = this.buildDescribePrompt(player);
    const response = await this.callAI(player, prompt, { temperature: 0.9, maxTokens: 100 });
    if (this._d()) return;

    if (response) {
      player.descriptions.push(response);
      this.addPlayerMessage(player, response);
    } else {
      const desc = this.getFallbackDescription(player);
      player.descriptions.push(desc);
      this.addPlayerMessage(player, desc);
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
    this.setPhaseIndicator('🗳 投票淘汰');

    this.addSystemMessage('🗳 投票阶段！请选择你认为是卧底的玩家', 'important');

    const alive = this.alivePlayers;
    const votes = {};
    const preVoteMessageCount = this.messages.length;

    if (this.userPlayer.alive) {
      const target = await this.waitForUserChoice(
        '选择你认为是卧底的人',
        [
          ...alive.filter(p => !p.isUser).map(p => ({ id: p.id, label: `${p.avatar} ${p.name}` })),
          { id: 'skip', label: '🟡 弃票' },
        ]
      );
      if (this._d()) return;
      if (target !== 'skip') {
        votes[this.userPlayer.id] = target;
      }
      this.addSystemMessage(`${this.userPlayer.name} 已投票`);
    }

    for (const player of alive) {
      if (player.isUser) continue;
      await this.sleep(400);
      if (this._d()) return;
      const vote = await this.getAIVote(player, preVoteMessageCount);
      if (this._d()) return;
      if (vote !== null) {
        votes[player.id] = vote;
      }
      this.addSystemMessage(`${player.name} 已投票`);
    }

    // Reveal all votes together
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
      if (this._d()) return null;

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
      this._setTimeout(() => this.startRound(), 1500);
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
    }

    this.updatePlayerList();

    if (this.checkWinCondition()) return;

    this._setTimeout(() => this.startRound(), 2000);
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
    this.gameResult = winner;

    this.addSystemMessage(`🎉 游戏结束！${message}`, winner === 'civilian' ? 'success' : 'danger');
    this.addSystemMessage(`平民词语：${this.civilianWord} | 卧底词语：${this.undercoverWord}`, 'important');

    const userRole = this.userPlayer.role;
    const userWon = (winner === 'civilian' && userRole !== 'undercover') ||
                    (winner === 'undercover' && userRole === 'undercover');

    const roleLabel = userRole === 'civilian' ? '平民' :
                      userRole === 'undercover' ? '卧底' : '白板';

    this.showGameOver({
      icon: userWon ? '🎉' : '😢',
      title: userWon ? '恭喜你赢了！' : '游戏失败',
      message,
      subtitle: `你的身份：${roleLabel} | 你的词语：${this.userPlayer.word}`,
      extra: `平民词：${this.civilianWord} | 卧底词：${this.undercoverWord}`,
    });
  }
}

// ─── Register this game ───
registerGame({
  id: 'undercover',
  name: '谁是卧底',
  icon: '🕵️',
  tag: '词语推理',
  description: '每个玩家拿到一个词语，大多数人拿到相同的词，卧底拿到相似但不同的词。通过描述词语来找出谁是卧底！',
  playerRange: '5-8 人',
  duration: '10-20 分钟',
  features: '🗣 词语描述',
  GameClass: UndercoverGame,
});
