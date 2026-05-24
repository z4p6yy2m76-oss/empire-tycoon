// ============================================================
// GameTutorial.ts — 新手引导系统
// 分步教程、操作提示、规则说明
// ============================================================

export enum TutorialStep {
  WELCOME = 'WELCOME',
  DICE_ROLL = 'DICE_ROLL',
  MOVEMENT = 'MOVEMENT',
  BUY_PROPERTY = 'BUY_PROPERTY',
  RENT_COLLECTION = 'RENT_COLLECTION',
  UPGRADE = 'UPGRADE',
  JAIL = 'JAIL',
  CARDS = 'CARDS',
  STOCK_MARKET = 'STOCK_MARKET',
  AUCTION = 'AUCTION',
  LAYERS = 'LAYERS',
  ECONOMY = 'ECONOMY',
  BANKRUPTCY = 'BANKRUPTCY',
  COMPLETE = 'COMPLETE',
}

export interface TutorialPage {
  step: TutorialStep;
  title: string;
  description: string;
  tips: string[];
  highlightSelector?: string;
  requiresAction: boolean;
  actionLabel?: string;
}

export class GameTutorial {
  private currentStep: TutorialStep = TutorialStep.WELCOME;
  private completed: boolean = false;
  private enabled: boolean = true;
  private stepHistory: TutorialStep[] = [];

  private pages: Map<TutorialStep, TutorialPage> = new Map();

  constructor() {
    this.initPages();
  }

  private initPages(): void {
    this.pages.set(TutorialStep.WELCOME, {
      step: TutorialStep.WELCOME,
      title: '欢迎来到 Empire Tycoon!',
      description: '这是帝国大亨——一款融合了经典大富翁玩法与现代经济系统的策略棋盘游戏。你将在三层地图上买卖地产、投资股票、参与拍卖，目标是成为最富有的玩家！',
      tips: [
        '游戏支持 AI 单机、热座多人、在线联机三种模式',
        '每位玩家起始资金 $15,000',
        '按 R 键快速掷骰子',
      ],
      requiresAction: true,
      actionLabel: '开始教程',
    });

    this.pages.set(TutorialStep.DICE_ROLL, {
      step: TutorialStep.DICE_ROLL,
      title: '掷骰子与移动',
      description: '点击屏幕或按 R 键掷两个骰子。骰子点数之和决定你前进的步数。如果掷出对子（两个骰子相同），可以再掷一次！连续三次对子则直接入狱。',
      tips: [
        '骰子点数 1-6 × 2',
        '对子可获得额外回合',
        '注意前方格子，规划移动路线',
      ],
      requiresAction: true,
      actionLabel: '我明白了',
    });

    this.pages.set(TutorialStep.BUY_PROPERTY, {
      step: TutorialStep.BUY_PROPERTY,
      title: '购买地产',
      description: '当你停在无主地产格时，可以选择购买。地产可以升级（最多 3 级），升级后过路费显著增加。同色组的地产全部拥有即为"垄断"，过路费翻倍！',
      tips: [
        '购买后记得关注现金流',
        '同色组垄断收益最高',
        '可以抵押地产换取现金（赎回需 110%）',
      ],
      requiresAction: true,
      actionLabel: '下一步',
    });

    this.pages.set(TutorialStep.RENT_COLLECTION, {
      step: TutorialStep.RENT_COLLECTION,
      title: '收取过路费',
      description: '当对手踩中你的地产时，必须支付过路费给你。过路费金额 = 基础租金 × CPI倍率 × Buff修正。升级地产可以大幅提升过路费收入。',
      tips: [
        'CPI 高时过路费也高',
        '破产的玩家不需要支付过路费',
        '抵押中的地产不收过路费',
      ],
      requiresAction: true,
      actionLabel: '了解了',
    });

    this.pages.set(TutorialStep.UPGRADE, {
      step: TutorialStep.UPGRADE,
      title: '地产升级',
      description: '拥有地产后可以花费资金升级（Lv1→Lv2→Lv3）。每级升价递增，但租金回报也大幅提升。升级前请确保有足够现金流应对可能的过路费支出。',
      tips: [
        '升级优先度：垄断色组 > 高流量区域 > 高基础价地产',
        '升级后可以出售（6折回收）',
        'AI 对手也会升级地产',
      ],
      requiresAction: true,
      actionLabel: '继续',
    });

    this.pages.set(TutorialStep.JAIL, {
      step: TutorialStep.JAIL,
      title: '监狱机制',
      description: '以下情况会入狱：(1)踩中监狱格 (2)抽到入狱卡 (3)连续三次对子。在监狱中可以通过掷出对子、支付保释金或使用出狱卡离开。',
      tips: [
        '保释金 $500',
        '最多被关押 3 回合自动释放',
        '出狱卡可以保留到关键时刻使用',
      ],
      requiresAction: true,
      actionLabel: '明白',
    });

    this.pages.set(TutorialStep.CARDS, {
      step: TutorialStep.CARDS,
      title: '卡牌系统',
      description: '机会卡和命运卡是游戏的重要变数。共有 50+ 种卡牌，效果包括：金钱增减、强制移动、入狱/出狱、地产税、股票红利、强制拍卖等。',
      tips: [
        '机会卡多为正面效果',
        '命运卡有好有坏',
        '稀有卡效果更强大',
      ],
      requiresAction: true,
      actionLabel: '继续',
    });

    this.pages.set(TutorialStep.STOCK_MARKET, {
      step: TutorialStep.STOCK_MARKET,
      title: '股票交易',
      description: '在股票交易所格可以进行股票买卖。支持做多（低买高卖）和做空（高卖低买）。股票价格受随机游走和均值回归影响，波动率因股票而异。',
      tips: [
        '做空需要 50% 保证金',
        '价格历史可在面板查看',
        '分散投资降低风险',
        'AI 也会根据性格参与股票交易',
      ],
      requiresAction: true,
      actionLabel: '了解',
    });

    this.pages.set(TutorialStep.AUCTION, {
      step: TutorialStep.AUCTION,
      title: '荷兰式拍卖',
      description: '当玩家拒绝购买踩中的地产时触发拍卖。采用荷兰式拍卖：价格从 150% 逐渐下降，第一个出价者获得地产。最低不会低于 20% 原始价格。',
      tips: [
        '出价太早多花钱，太晚可能被抢',
        'AI 会根据性格和资金决策',
        '流拍的地产保持无主状态',
      ],
      requiresAction: true,
      actionLabel: '继续',
    });

    this.pages.set(TutorialStep.LAYERS, {
      step: TutorialStep.LAYERS,
      title: '三层地图',
      description: '游戏地图分为三层：地面层（帝都金融街）、地下层（地下商业王国）、天空层（云端未来城）。通过地铁站和机场可以在层间跳转。',
      tips: [
        '地铁站：指定层间跳转',
        '机场：随机跳转',
        '每层的物价和地产不同',
      ],
      requiresAction: true,
      actionLabel: '了解',
    });

    this.pages.set(TutorialStep.ECONOMY, {
      step: TutorialStep.ECONOMY,
      title: '动态经济系统',
      description: 'CPI（消费者物价指数）根据所有玩家的总资产自动调整。CPI 上升时过路费增加但利息也涨。经济会经历繁荣和衰退周期，影响所有价格。',
      tips: [
        '繁荣期：CPI 涨得快，过路费高',
        '衰退期：利率低，投资成本低',
        '关注经济周期调整策略',
      ],
      requiresAction: true,
      actionLabel: '继续',
    });

    this.pages.set(TutorialStep.BANKRUPTCY, {
      step: TutorialStep.BANKRUPTCY,
      title: '破产机制',
      description: '当你无法支付债务时，系统自动出售地产和股票变现。如果变卖所有资产后仍无法还清债务，则宣告破产退出游戏。最后存活的玩家获胜！',
      tips: [
        '保持 2000-5000 现金储备',
        '必要时提前出售资产',
        '银行存款在破产时也会被取出',
      ],
      requiresAction: true,
      actionLabel: '开始游戏!',
    });
  }

  getCurrentPage(): TutorialPage | undefined {
    return this.pages.get(this.currentStep);
  }

  advance(): TutorialStep | null {
    this.stepHistory.push(this.currentStep);
    const steps = Object.values(TutorialStep);
    const idx = steps.indexOf(this.currentStep);
    if (idx < steps.length - 1) {
      this.currentStep = steps[idx + 1];
      return this.currentStep;
    }
    this.completed = true;
    return null;
  }

  goBack(): TutorialStep | null {
    if (this.stepHistory.length === 0) return null;
    this.currentStep = this.stepHistory.pop()!;
    return this.currentStep;
  }

  skip(): void {
    this.completed = true;
    this.currentStep = TutorialStep.COMPLETE;
  }

  isCompleted(): boolean { return this.completed; }
  isEnabled(): boolean { return this.enabled; }
  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  reset(): void {
    this.currentStep = TutorialStep.WELCOME;
    this.completed = false;
    this.stepHistory = [];
  }

  /** 获取特定主题的快速提示 */
  static getQuickTip(topic: string): string {
    const tips: Record<string, string> = {
      'buy': '购买地产是建立资产的基础，优先买低价但流量高的区域',
      'sell': '出售地产按6折回收，非紧急情况不推荐',
      'upgrade': '升级优先垄断色组，收益翻倍',
      'stock': '股票做多低买高卖，做空高卖低买',
      'auction': '荷兰式拍卖从高价开始，耐心等待低价再出手',
      'jail': '入狱后可以掷骰出狱（对子）、缴费或使用出狱卡',
      'cpi': 'CPI影响所有价格，繁荣期小心高过路费',
      'bankrupt': '保持充足现金储备，避免意外支出导致破产',
    };
    return tips[topic] ?? '查看教程了解详情';
  }

  /** 生成规则书 HTML */
  static generateRuleBook(): string {
    return `
      <h1>Empire Tycoon 规则书</h1>
      <h2>基本规则</h2>
      <p>2-4名玩家轮流掷骰移动，购买地产收取过路费，最后存活者获胜。</p>
      <h2>经济系统</h2>
      <p>CPI指数根据总资产自动调整，利率联动。经济分为繁荣/正常/衰退周期。</p>
      <h2>股票交易</h2>
      <p>8只股票，支持做多和做空。价格随机游走+均值回归。</p>
      <h2>拍卖</h2>
      <p>荷兰式拍卖，从高价逐渐下降。适合捡漏。</p>
      <h2>卡牌</h2>
      <p>50+种机会/命运卡，数据驱动效果。</p>
    `;
  }
}
