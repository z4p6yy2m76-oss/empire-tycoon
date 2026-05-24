// ============================================================
// AIPersonalities.ts — AI 性格参数表
// 定义不同 AI 性格的 Utility AI 权重配置
// ============================================================

import { AIDifficulty } from '../core/StateManager';

// ---- Utility AI 考量因素名称 ----
export enum ConsiderationType {
  CASH_RATIO = 'CASH_RATIO',               // 现金比率
  PROPERTY_COUNT = 'PROPERTY_COUNT',       // 地产数量
  OPPONENT_THREAT = 'OPPONENT_THREAT',     // 对手威胁度
  POSITION_RISK = 'POSITION_RISK',         // 位置风险
  CPI_TREND = 'CPI_TREND',                 // CPI 趋势
  RENT_PRESSURE = 'RENT_PRESSURE',         // 过路费压力
  UPGRADE_ROI = 'UPGRADE_ROI',            // 升级收益比
  STOCK_PROFIT = 'STOCK_PROFIT',          // 股票盈亏
  BANKRUPTCY_DISTANCE = 'BANKRUPTCY_DISTANCE', // 破产距离
  MONOPOLY_POTENTIAL = 'MONOPOLY_POTENTIAL',   // 垄断潜力
  JAIL_AVOIDANCE = 'JAIL_AVOIDANCE',      // 躲避监狱
  CARD_VALUE = 'CARD_VALUE',               // 卡牌价值
}

// ---- Utility AI 行为名称 ----
export enum ActionType {
  BUY_PROPERTY = 'BUY_PROPERTY',
  UPGRADE_PROPERTY = 'UPGRADE_PROPERTY',
  SELL_PROPERTY = 'SELL_PROPERTY',
  AUCTION_BID = 'AUCTION_BID',
  AUCTION_PASS = 'AUCTION_PASS',
  STOCK_BUY = 'STOCK_BUY',
  STOCK_SELL = 'STOCK_SELL',
  STOCK_SHORT = 'STOCK_SHORT',
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  REPAY_LOAN = 'REPAY_LOAN',
  USE_CARD = 'USE_CARD',
  PAY_BAIL = 'PAY_BAIL',
  STAY_IN_JAIL = 'STAY_IN_JAIL',
  LAYER_SWITCH = 'LAYER_SWITCH',
  SKIP = 'SKIP',
}

// ---- 性格类型 ----
export type PersonalityType = 'conservative' | 'aggressive' | 'random' | 'balanced' | 'gambler' | 'landlord';

// ---- 每个考量的权重表（不同性格）----
export interface ConsiderationWeights {
  [key: string]: number;
}

export interface PersonalityConfig {
  type: PersonalityType;
  name: string;
  description: string;
  considerationWeights: ConsiderationWeights;
  actionBias: Partial<Record<ActionType, number>>;
  randomness: number;        // 0-1, 额外随机性
  riskTolerance: number;     // 0-1, 风险承受力
  negotiationFactor: number; // 0-1, 谈判意愿
}

// ---- 预定义性格配置 ----
export const PERSONALITY_CONFIGS: Record<PersonalityType, PersonalityConfig> = {
  conservative: {
    type: 'conservative',
    name: '保守型',
    description: '优先现金持有，厌恶风险，喜欢存款',
    considerationWeights: {
      CASH_RATIO: 1.2,
      PROPERTY_COUNT: 0.4,
      OPPONENT_THREAT: 0.5,
      POSITION_RISK: 1.0,
      CPI_TREND: 0.6,
      RENT_PRESSURE: 0.8,
      UPGRADE_ROI: 0.3,
      STOCK_PROFIT: 0.1,
      BANKRUPTCY_DISTANCE: 1.2,
      MONOPOLY_POTENTIAL: 0.3,
      JAIL_AVOIDANCE: 1.0,
      CARD_VALUE: 0.5,
    },
    actionBias: {
      BUY_PROPERTY: -0.2,
      DEPOSIT: 0.8,
      STOCK_BUY: -0.5,
      AUCTION_BID: -0.3,
      UPGRADE_PROPERTY: -0.2,
    },
    randomness: 0.1,
    riskTolerance: 0.2,
    negotiationFactor: 0.3,
  },

  aggressive: {
    type: 'aggressive',
    name: '激进型',
    description: '追求资产扩张，敢于冒险，热衷拍卖竞价',
    considerationWeights: {
      CASH_RATIO: 0.3,
      PROPERTY_COUNT: 1.0,
      OPPONENT_THREAT: 1.2,
      POSITION_RISK: 0.4,
      CPI_TREND: 0.5,
      RENT_PRESSURE: 0.3,
      UPGRADE_ROI: 0.9,
      STOCK_PROFIT: 0.8,
      BANKRUPTCY_DISTANCE: 0.3,
      MONOPOLY_POTENTIAL: 1.2,
      JAIL_AVOIDANCE: 0.5,
      CARD_VALUE: 0.6,
    },
    actionBias: {
      BUY_PROPERTY: 0.5,
      UPGRADE_PROPERTY: 0.4,
      AUCTION_BID: 0.6,
      STOCK_BUY: 0.3,
      STOCK_SHORT: 0.2,
      DEPOSIT: -0.5,
    },
    randomness: 0.15,
    riskTolerance: 0.8,
    negotiationFactor: 0.5,
  },

  random: {
    type: 'random',
    name: '随机型',
    description: '行为不可预测，经常做出出乎意料的决定',
    considerationWeights: {
      CASH_RATIO: 0.5,
      PROPERTY_COUNT: 0.5,
      OPPONENT_THREAT: 0.5,
      POSITION_RISK: 0.5,
      CPI_TREND: 0.5,
      RENT_PRESSURE: 0.5,
      UPGRADE_ROI: 0.5,
      STOCK_PROFIT: 0.5,
      BANKRUPTCY_DISTANCE: 0.5,
      MONOPOLY_POTENTIAL: 0.5,
      JAIL_AVOIDANCE: 0.5,
      CARD_VALUE: 0.5,
    },
    actionBias: {},
    randomness: 0.4,
    riskTolerance: 0.5,
    negotiationFactor: 0.5,
  },

  balanced: {
    type: 'balanced',
    name: '均衡型',
    description: '在风险与收益之间保持平衡，综合考量各种因素',
    considerationWeights: {
      CASH_RATIO: 0.7,
      PROPERTY_COUNT: 0.7,
      OPPONENT_THREAT: 0.7,
      POSITION_RISK: 0.7,
      CPI_TREND: 0.7,
      RENT_PRESSURE: 0.7,
      UPGRADE_ROI: 0.7,
      STOCK_PROFIT: 0.5,
      BANKRUPTCY_DISTANCE: 0.7,
      MONOPOLY_POTENTIAL: 0.7,
      JAIL_AVOIDANCE: 0.7,
      CARD_VALUE: 0.7,
    },
    actionBias: {},
    randomness: 0.1,
    riskTolerance: 0.5,
    negotiationFactor: 0.5,
  },

  gambler: {
    type: 'gambler',
    name: '赌徒型',
    description: '极度热衷高风险高回报，频繁出入赌场和股市',
    considerationWeights: {
      CASH_RATIO: 0.2,
      PROPERTY_COUNT: 0.4,
      OPPONENT_THREAT: 0.6,
      POSITION_RISK: 0.3,
      CPI_TREND: 0.2,
      RENT_PRESSURE: 0.2,
      UPGRADE_ROI: 0.6,
      STOCK_PROFIT: 1.5,
      BANKRUPTCY_DISTANCE: 0.1,
      MONOPOLY_POTENTIAL: 0.4,
      JAIL_AVOIDANCE: 0.3,
      CARD_VALUE: 0.8,
    },
    actionBias: {
      STOCK_BUY: 0.8,
      STOCK_SHORT: 0.6,
      AUCTION_BID: 0.4,
      DEPOSIT: -1.0,
      BUY_PROPERTY: 0.1,
    },
    randomness: 0.25,
    riskTolerance: 0.95,
    negotiationFactor: 0.4,
  },

  landlord: {
    type: 'landlord',
    name: '地主型',
    description: '专注地产投资，追求垄断，不喜欢金融产品',
    considerationWeights: {
      CASH_RATIO: 0.5,
      PROPERTY_COUNT: 1.2,
      OPPONENT_THREAT: 0.8,
      POSITION_RISK: 0.6,
      CPI_TREND: 0.8,
      RENT_PRESSURE: 0.6,
      UPGRADE_ROI: 1.2,
      STOCK_PROFIT: 0.0,
      BANKRUPTCY_DISTANCE: 0.5,
      MONOPOLY_POTENTIAL: 1.5,
      JAIL_AVOIDANCE: 0.6,
      CARD_VALUE: 0.4,
    },
    actionBias: {
      BUY_PROPERTY: 0.8,
      UPGRADE_PROPERTY: 0.7,
      STOCK_BUY: -1.0,
      STOCK_SHORT: -1.0,
      AUCTION_BID: 0.5,
    },
    randomness: 0.05,
    riskTolerance: 0.6,
    negotiationFactor: 0.3,
  },
};

// ---- 难度对 AI 的调整 ----
export interface DifficultyModifier {
  weightMultiplier: number;
  randomChance: number;     // 随机动作概率
  lookaheadSteps: number;   // 前瞻步数
  negotiationBoost: number; // 谈判优势
  startingCashBonus: number;// 起始资金加成
}

export const DIFFICULTY_MODIFIERS: Record<AIDifficulty, DifficultyModifier> = {
  [AIDifficulty.EASY]: {
    weightMultiplier: 0.7,
    randomChance: 0.20,
    lookaheadSteps: 0,
    negotiationBoost: 0,
    startingCashBonus: -2000,
  },
  [AIDifficulty.NORMAL]: {
    weightMultiplier: 1.0,
    randomChance: 0.0,
    lookaheadSteps: 1,
    negotiationBoost: 0,
    startingCashBonus: 0,
  },
  [AIDifficulty.HARD]: {
    weightMultiplier: 1.2,
    randomChance: 0.0,
    lookaheadSteps: 3,
    negotiationBoost: 0.1,
    startingCashBonus: 3000,
  },
};

// ---- 工具：获取最终权重 ----
export function getEffectiveWeight(
  personality: PersonalityConfig,
  consideration: ConsiderationType,
  difficulty: AIDifficulty,
): number {
  const base = personality.considerationWeights[consideration] ?? 0.5;
  const modifier = DIFFICULTY_MODIFIERS[difficulty];
  return base * modifier.weightMultiplier;
}
