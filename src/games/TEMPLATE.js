/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  🎮 AI Game Center — 新游戏开发模板                           ║
 * ║                                                              ║
 * ║  复制这个文件，重命名为你的游戏名字，然后按注释提示填写。         ║
 * ║  完成后在 src/main.js 中加一行 import 即可！                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 添加新游戏只需要 2 步：
 *   1. 复制本文件到 src/games/你的游戏名.js，实现游戏逻辑
 *   2. 在 src/main.js 中添加: import './games/你的游戏名.js';
 *
 * 就这样！不需要修改 app.js 或其他任何文件。
 *
 * ─── BaseGame 提供的方法 ───
 *
 * 🔧 Setup 阶段:
 *   this.initDefaultProfiles(aiCount)           — 初始化 AI 默认模型
 *   this.renderAISlots(count, profiles)          — 渲染 AI 模型选择器 HTML
 *   this.bindProfileSelectors(count)             — 绑定模型选择器事件
 *
 * 🎮 游戏 UI:
 *   this.renderGameLayout({ title, emoji, phaseLabel, phaseClass })
 *                                                — 渲染标准游戏界面 (header + 玩家列表 + 消息区)
 *   this.updatePlayerList()                      — 刷新玩家列表面板
 *   this.setPhaseIndicator(label, className)     — 更新阶段标签
 *   this.setRoundInfo(text)                      — 更新轮次信息
 *
 * 💬 消息系统:
 *   this.addSystemMessage(text, type?)           — 系统消息 (AI 可见)
 *   this.addPrivateMessage(text, type?)           — 私密消息 (仅 UI 显示，AI 不可见)
 *   this.addPlayerMessage(player, text)           — 玩家发言
 *
 * 🤖 AI 调用:
 *   this.callAI(player, messages, opts?)          — 带 loading 动画和错误处理的 AI 调用
 *   this.showThinking(player)                     — 手动显示思考动画
 *   this.hideThinking()                           — 手动隐藏思考动画
 *
 * 👤 用户交互:
 *   this.waitForUserChoice(title, options)         — 等待用户点击按钮选择
 *   this.waitForUserInput(placeholder?)            — 等待用户输入文本
 *
 * 🏁 游戏结束:
 *   this.showGameOver({ icon, title, message, subtitle?, extra? })
 *
 * 🛠 工具:
 *   this.sleep(ms)                                — 延迟
 */

import { aiService } from '../ai-service.js';
import { registerGame } from '../game-registry.js';
import { BaseGame, AVATARS, AI_NAMES } from './base-game.js';

// ─── Step 1: 定义你的游戏类 ───

class MyNewGame extends BaseGame {
  constructor(container, app) {
    super(container, app);
    
    // 初始化游戏状态
    this.userName = '';
    this.playerCount = 6;
    this.roundCount = 0;
    
    // 显示设置页面
    this.renderSetup();
  }

  // ─── 设置页面 (必须实现) ───
  renderSetup() {
    const profiles = aiService.profiles;
    const aiCount = this.playerCount - 1;
    this.initDefaultProfiles(aiCount);

    this.container.innerHTML = `
      <div class="game-header">
        <div class="game-header-left">
          <button class="btn-back" id="btn-back">←</button>
          <div class="game-title-area">
            <h2>🎲 我的新游戏</h2>
            <span>设置你的游戏参数</span>
          </div>
        </div>
      </div>
      <div class="game-setup">
        <h3>🎮 游戏设置</h3>
        
        <!-- 玩家名字 -->
        <div class="setup-section">
          <div class="setup-section-title">玩家信息</div>
          <div class="form-group">
            <label class="form-label">你的名字</label>
            <input type="text" class="form-input" id="input-player-name" 
              placeholder="输入你的游戏名字" value="${this.userName || ''}" maxlength="8" />
          </div>
        </div>
        
        <!-- TODO: 添加游戏特有的设置项 -->
        
        <!-- AI 模型分配 (使用 BaseGame 提供的方法) -->
        <div class="setup-section">
          <div class="setup-section-title">🤖 AI 玩家模型分配</div>
          <p class="form-hint" style="margin-bottom:12px;">为每个 AI 玩家分配不同的大模型</p>
          <div class="ai-player-list" id="ai-player-list">
            ${this.renderAISlots(aiCount, profiles)}
          </div>
          ${profiles.length === 0 ? '<p class="form-hint" style="margin-top:8px;color:var(--accent-orange);">⚠️ 请先在右上角「模型配置」中添加模型</p>' : ''}
        </div>
        
        <button class="btn btn-primary btn-block" id="btn-start-game" style="margin-top:8px">🎲 开始游戏</button>
      </div>
    `;

    // 绑定事件
    document.getElementById('btn-back')?.addEventListener('click', () => this.app.navigate('home'));
    this.bindProfileSelectors(aiCount);
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      const name = document.getElementById('input-player-name').value.trim();
      if (!name) { this.app.showToast('请输入你的名字', 'error'); return; }
      if (!aiService.profiles.length) { this.app.showToast('请先添加 AI 模型', 'error'); return; }
      this.userName = name;
      this.startGame();
    });
  }

  // ─── 玩家列表渲染 (必须实现) ───
  renderPlayerList() {
    return this.players.map(p => `
      <div class="player-item ${p.alive ? '' : 'eliminated'} ${p.isUser ? 'is-user' : ''}">
        <div class="player-avatar">${p.avatar}</div>
        <span class="player-name">${p.name}${p.isUser ? ' (你)' : ''}</span>
        ${!p.isUser && p.modelName ? `<span class="player-model-tag">${p.modelName}</span>` : ''}
        ${!p.alive ? '<span style="font-size:11px;color:var(--accent-red)">💀</span>' : ''}
      </div>
    `).join('');
  }

  // ─── 游戏逻辑 (你的核心代码！) ───
  startGame() {
    this.state = 'playing';
    this.messages = [];
    this.roundCount = 0;

    // TODO: 初始化玩家 (this.players)
    // TODO: 分配角色
    // TODO: 渲染游戏界面

    // 示例：渲染标准游戏界面
    this.renderGameLayout({
      title: '我的新游戏',
      emoji: '🎲',
      phaseLabel: '🎮 游戏中',
      phaseClass: 'day',
    });

    this.addSystemMessage('游戏开始！');

    // TODO: 启动游戏循环
  }

  // ─── AI 调用示例 ───
  async askAI(player, question) {
    // 方式1：使用 callAI（带自动 loading 和错误处理）
    const messages = [
      { role: 'system', content: `你是${player.name}，正在玩一个游戏。` },
      { role: 'user', content: question },
    ];
    const response = await this.callAI(player, messages, {
      temperature: 0.8,
      maxTokens: 200,
      silent: false,  // true = 不显示思考动画
    });
    return response; // 成功返回字符串，失败返回 null
  }

  // ─── 用户交互示例 ───
  async exampleInteraction() {
    // 等待用户选择
    const choice = await this.waitForUserChoice('请选择一个选项', [
      { id: 'option1', label: '🅰️ 选项一' },
      { id: 'option2', label: '🅱️ 选项二' },
      { id: 'skip', label: '🟡 跳过' },
    ]);
    console.log('用户选择了:', choice);

    // 等待用户输入文本
    const text = await this.waitForUserInput('请输入你的想法...');
    console.log('用户输入了:', text);
  }

  // ─── 游戏结束示例 ───
  endGame(winner) {
    this.addSystemMessage('🎉 游戏结束！', 'important');
    this.updatePlayerList();

    this.showGameOver({
      icon: '🎉',
      title: '游戏结束',
      message: `${winner} 获胜！`,
      subtitle: '感谢参与',
    });
  }
}

// ─── Step 2: 注册游戏 ───
// 取消下面的注释，填写你的游戏信息

/*
registerGame({
  id: 'my-game',              // 唯一 ID，用于 URL 和 CSS class
  name: '我的新游戏',           // 显示名称
  icon: '🎲',                  // 首页卡片和导航栏的图标
  tag: '策略推理',              // 分类标签
  description: '这是一个很好玩的游戏...', // 首页卡片描述
  playerRange: '4-8 人',       // 支持人数
  duration: '15-30 分钟',      // 预计时长
  features: '🧠 策略思考',      // 特色标签
  GameClass: MyNewGame,        // 你的游戏类
});
*/

// ─── Step 3: 在 src/main.js 中添加一行 import ───
// import './games/你的游戏名.js';
