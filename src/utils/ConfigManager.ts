// ============================================================
// ConfigManager.ts — 配置管理器
// 管理游戏配置、难度参数调优、偏好存储
// ============================================================

import { AIDifficulty, type GameSettings } from '../core/StateManager';

export interface DifficultyPreset {
  difficulty: AIDifficulty;
  label: string;
  description: string;
  startingMoney: number;
  aiStartingBonus: number;
  cpiStartValue: number;
  cpiGrowthRate: number;
  stockVolatilityMultiplier: number;
  auctionMinPriceRatio: number;
  jailBailAmount: number;
  rentMultiplier: number;
  loanInterestRate: number;
  bankruptProtection: boolean;
}

export const DIFFICULTY_PRESETS: Record<AIDifficulty, DifficultyPreset> = {
  [AIDifficulty.EASY]: {
    difficulty: AIDifficulty.EASY,
    label: '简单',
    description: '适合新手，AI 偶尔犯错，经济波动小',
    startingMoney: 20000,
    aiStartingBonus: -3000,
    cpiStartValue: 100,
    cpiGrowthRate: 0.3,
    stockVolatilityMultiplier: 0.7,
    auctionMinPriceRatio: 0.3,
    jailBailAmount: 300,
    rentMultiplier: 0.8,
    loanInterestRate: 0.05,
    bankruptProtection: true,
  },
  [AIDifficulty.NORMAL]: {
    difficulty: AIDifficulty.NORMAL,
    label: '普通',
    description: '均衡的经济环境，AI 正常决策',
    startingMoney: 15000,
    aiStartingBonus: 0,
    cpiStartValue: 100,
    cpiGrowthRate: 0.5,
    stockVolatilityMultiplier: 1.0,
    auctionMinPriceRatio: 0.2,
    jailBailAmount: 500,
    rentMultiplier: 1.0,
    loanInterestRate: 0.10,
    bankruptProtection: false,
  },
  [AIDifficulty.HARD]: {
    difficulty: AIDifficulty.HARD,
    label: '困难',
    description: 'AI 侵略性强且精于计算，经济波动大',
    startingMoney: 12000,
    aiStartingBonus: 5000,
    cpiStartValue: 105,
    cpiGrowthRate: 0.8,
    stockVolatilityMultiplier: 1.3,
    auctionMinPriceRatio: 0.15,
    jailBailAmount: 800,
    rentMultiplier: 1.2,
    loanInterestRate: 0.15,
    bankruptProtection: false,
  },
};

export interface GamePresetConfig {
  id: string;
  name: string;
  description: string;
  settings: Partial<GameSettings>;
}

export const GAME_PRESETS: GamePresetConfig[] = [
  {
    id: 'classic',
    name: '经典模式',
    description: '传统大富翁玩法，单层地图，无股票拍卖',
    settings: {
      enableStocks: false,
      enableAuction: false,
      enableCPI: false,
      mapLayers: 1,
      startingMoney: 15000,
    },
  },
  {
    id: 'standard',
    name: '标准模式',
    description: '推荐体验，三层地图 + 股票 + 拍卖',
    settings: {
      enableStocks: true,
      enableAuction: true,
      enableCPI: true,
      mapLayers: 3,
      startingMoney: 15000,
    },
  },
  {
    id: 'tycoon',
    name: '大亨模式',
    description: '高资金起手，经济波动剧烈，适合老玩家',
    settings: {
      enableStocks: true,
      enableAuction: true,
      enableCPI: true,
      mapLayers: 3,
      startingMoney: 30000,
    },
  },
  {
    id: 'quick',
    name: '闪电模式',
    description: '快速对局，单层地图，30 回合封顶',
    settings: {
      enableStocks: false,
      enableAuction: true,
      enableCPI: false,
      mapLayers: 1,
      startingMoney: 10000,
      maxTurns: 30,
    },
  },
  {
    id: 'survival',
    name: '生存模式',
    description: '最低资金起手，AI 极度侵略，活着就是胜利',
    settings: {
      enableStocks: true,
      enableAuction: true,
      enableCPI: true,
      mapLayers: 3,
      startingMoney: 5000,
    },
  },
];

export class ConfigManager {
  private static instance: ConfigManager;

  static get(): ConfigManager {
    if (!ConfigManager.instance) ConfigManager.instance = new ConfigManager();
    return ConfigManager.instance;
  }

  getDifficultyPreset(difficulty: AIDifficulty): DifficultyPreset {
    return DIFFICULTY_PRESETS[difficulty];
  }

  getPresets(): GamePresetConfig[] {
    return GAME_PRESETS;
  }

  getPreset(id: string): GamePresetConfig | undefined {
    return GAME_PRESETS.find(p => p.id === id);
  }

  /** 导出当前配置为 JSON */
  exportConfig(): string {
    return JSON.stringify(DIFFICULTY_PRESETS, null, 2);
  }

  /** 自定义难度配置校验 */
  validateCustomDifficulty(config: Partial<DifficultyPreset>): string[] {
    const errors: string[] = [];

    if (config.startingMoney !== undefined && config.startingMoney < 1000) {
      errors.push('起始资金不能低于 $1000');
    }
    if (config.startingMoney !== undefined && config.startingMoney > 100000) {
      errors.push('起始资金不能超过 $100000');
    }
    if (config.rentMultiplier !== undefined && (config.rentMultiplier < 0.1 || config.rentMultiplier > 5)) {
      errors.push('过路费倍率需在 0.1 — 5 之间');
    }
    if (config.cpiGrowthRate !== undefined && (config.cpiGrowthRate < 0 || config.cpiGrowthRate > 5)) {
      errors.push('CPI 增长率需在 0 — 5 之间');
    }
    if (config.stockVolatilityMultiplier !== undefined && (config.stockVolatilityMultiplier < 0.1 || config.stockVolatilityMultiplier > 10)) {
      errors.push('股票波动倍率需在 0.1 — 10 之间');
    }
    if (config.loanInterestRate !== undefined && (config.loanInterestRate < 0 || config.loanInterestRate > 1)) {
      errors.push('贷款利率需在 0 — 1 之间');
    }
    if (config.auctionMinPriceRatio !== undefined && (config.auctionMinPriceRatio < 0.05 || config.auctionMinPriceRatio > 0.5)) {
      errors.push('拍卖底价比率需在 5% — 50% 之间');
    }

    return errors;
  }
}
