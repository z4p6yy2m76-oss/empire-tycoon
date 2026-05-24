// ============================================================
// CardDatabase.ts — 全部卡牌数据定义（50+ 张）
// 每张卡包含条件、效果、稀有度，数据驱动
// ============================================================

import { Card, CardType, CardEffectType, type CardConfig } from '../entities/Card';

export function buildCardDatabase(): Card[] {
  const cards: CardConfig[] = [

    // ==================== 机会卡 (Chance) ====================
    {
      id: 'chance_01', name: '银行分红', type: CardType.CHANCE, rarity: 'common',
      flavor: '银行本季度盈利超预期，向股东派发股息。',
      effects: [{ type: CardEffectType.MONEY_ADD, value: 1500, description: '获得 $1500' }],
    },
    {
      id: 'chance_02', name: '医疗账单', type: CardType.CHANCE, rarity: 'common',
      flavor: '你不小心摔伤，需要支付医疗费用。',
      effects: [{ type: CardEffectType.MONEY_LOSE, value: 500, description: '支付 $500' }],
    },
    {
      id: 'chance_03', name: '向前三步', type: CardType.CHANCE, rarity: 'common',
      flavor: '发现一条捷径！',
      effects: [{ type: CardEffectType.MOVE_FORWARD, value: 3, description: '前进 3 步' }],
    },
    {
      id: 'chance_04', name: '后退两步', type: CardType.CHANCE, rarity: 'common',
      flavor: '走错路了，回头吧。',
      effects: [{ type: CardEffectType.MOVE_BACKWARD, value: 2, description: '后退 2 步' }],
    },
    {
      id: 'chance_05', name: '免费升级', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '政府补贴旧改项目，免费升级一处地产。',
      effects: [{ type: CardEffectType.UPGRADE_FREE, value: 1, description: '免费升级一处地产' }],
    },
    {
      id: 'chance_06', name: '生日红包', type: CardType.CHANCE, rarity: 'common',
      flavor: '今天是你的生日！所有玩家给你红包。',
      effects: [{ type: CardEffectType.MONEY_FROM_ALL, value: 1000, description: '每位对手给你 $250' }],
    },
    {
      id: 'chance_07', name: '慈善捐款', type: CardType.CHANCE, rarity: 'common',
      flavor: '你决定捐款做慈善。',
      effects: [{ type: CardEffectType.MONEY_LOSE, value: 1000, description: '捐款 $1000' }],
    },
    {
      id: 'chance_08', name: '彩票中奖', type: CardType.CHANCE, rarity: 'rare',
      flavor: '你随手买的彩票居然中了！',
      effects: [{ type: CardEffectType.LOTTERY, value: 0.5, description: '50% 概率中 $5000' }],
    },
    {
      id: 'chance_09', name: '继承遗产', type: CardType.CHANCE, rarity: 'rare',
      flavor: '远房亲戚去世，留给你一笔遗产。',
      effects: [{ type: CardEffectType.MONEY_ADD, value: 5000, description: '获得 $5000' }],
    },
    {
      id: 'chance_10', name: '股票暴涨', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '你持有的股票突然暴涨！',
      effects: [{ type: CardEffectType.STOCK_BONUS, value: 2000, description: '股票收益 $2000' }],
    },
    {
      id: 'chance_11', name: '地产税', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '税务局清查地产，每处地产缴税。',
      effects: [{ type: CardEffectType.PROPERTY_TAX, value: 200, description: '每处地产缴 $200', condition: { minProperties: 1 } }],
    },
    {
      id: 'chance_12', name: '银行利息', type: CardType.CHANCE, rarity: 'common',
      flavor: '银行加息，存款收益增加。',
      effects: [{ type: CardEffectType.BANK_INTEREST, value: 0.1, description: '存款利息 10%' }],
    },
    {
      id: 'chance_13', name: '入狱', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '你被举报偷税漏税，立即入狱！',
      effects: [{ type: CardEffectType.GO_TO_JAIL, value: 3, description: '入狱 3 回合' }],
    },
    {
      id: 'chance_14', name: '出狱通行证', type: CardType.CHANCE, rarity: 'rare',
      flavor: '你获得了一张法律援助卡。',
      effects: [{ type: CardEffectType.GET_OUT_OF_JAIL, value: 1, description: '获得出狱卡' }],
    },
    {
      id: 'chance_15', name: '收租日', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '今天统一收租！',
      effects: [{ type: CardEffectType.COLLECT_RENT, value: 200, description: '每处地产收租 $200', condition: { minProperties: 1 } }],
    },
    {
      id: 'chance_16', name: '额外回合', type: CardType.CHANCE, rarity: 'rare',
      flavor: '你获得了额外行动机会。',
      effects: [{ type: CardEffectType.EXTRA_TURN, value: 1, description: '获得额外一个回合' }],
    },
    {
      id: 'chance_17', name: '维修费用', type: CardType.CHANCE, rarity: 'common',
      flavor: '你名下的地产需要维修。',
      effects: [{ type: CardEffectType.PROPERTY_REPAIR, value: 300, description: '每处地产维修 $300', condition: { minProperties: 1 } }],
    },
    {
      id: 'chance_18', name: 'CPI上涨', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '物价指数上升，过路费增加。',
      effects: [{ type: CardEffectType.CPI_CHANGE, value: 5, description: 'CPI +5' }],
    },
    {
      id: 'chance_19', name: '传送地面', type: CardType.CHANCE, rarity: 'rare',
      flavor: '你获得了一次快速传送机会。',
      effects: [{ type: CardEffectType.TELEPORT_LAYER, value: 0, description: '传送到地面层起点' }],
    },
    {
      id: 'chance_20', name: '强制拍卖', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '银行强制拍卖你的一处地产。',
      effects: [{ type: CardEffectType.AUCTION_FORCE, value: 1, description: '随机拍卖一处地产' }],
    },

    // ==================== 命运卡 (Destiny) ====================
    {
      id: 'destiny_01', name: '天降横财', type: CardType.DESTINY, rarity: 'common',
      flavor: '天上掉钱了？！',
      effects: [{ type: CardEffectType.MONEY_ADD, value: 2000, description: '获得 $2000' }],
    },
    {
      id: 'destiny_02', name: '股市崩盘', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '大盘暴跌，所有股票资产缩水。',
      effects: [{ type: CardEffectType.MONEY_LOSE, value: 1500, description: '损失 $1500' }],
    },
    {
      id: 'destiny_03', name: '大风吹', type: CardType.DESTINY, rarity: 'common',
      flavor: '一阵大风吹过，你被吹到了别处。',
      effects: [{ type: CardEffectType.MOVE_FORWARD, value: 5, description: '前进 5 步' }],
    },
    {
      id: 'destiny_04', name: '时光倒流', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '时光机故障，你回到了之前的位置。',
      effects: [{ type: CardEffectType.MOVE_BACKWARD, value: 6, description: '后退 6 步' }],
    },
    {
      id: 'destiny_05', name: '全民派钱', type: CardType.DESTINY, rarity: 'common',
      flavor: '政府发放消费券，你给所有人发红包。',
      effects: [{ type: CardEffectType.MONEY_TO_ALL, value: 1200, description: '向每位对手支付 $300' }],
    },
    {
      id: 'destiny_06', name: '保险赔付', type: CardType.DESTINY, rarity: 'common',
      flavor: '你买的意外险终于用上了。',
      effects: [{ type: CardEffectType.MONEY_ADD, value: 2500, description: '获得 $2500' }],
    },
    {
      id: 'destiny_07', name: '投资失败', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '你投资的项目跑路了。',
      effects: [{ type: CardEffectType.MONEY_LOSE, value: 3000, description: '损失 $3000' }],
    },
    {
      id: 'destiny_08', name: '拆迁补偿', type: CardType.DESTINY, rarity: 'rare',
      flavor: '政府征用你的地产，给予补偿。',
      effects: [{ type: CardEffectType.MONEY_ADD, value: 8000, description: '获得 $8000' }],
    },
    {
      id: 'destiny_09', name: '天灾人祸', type: CardType.DESTINY, rarity: 'rare',
      flavor: '地震！你的地产受损严重。',
      effects: [{ type: CardEffectType.DOWNGRADE_RANDOM, value: 1, description: '随机降级一处地产' }],
    },
    {
      id: 'destiny_10', name: '跳层传送', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '你发现了一个秘密通道。',
      effects: [{ type: CardEffectType.TELEPORT_LAYER, value: 2, description: '传送到天空层' }],
    },
    {
      id: 'destiny_11', name: '入狱！', type: CardType.DESTINY, rarity: 'common',
      flavor: '因果报应，锒铛入狱。',
      effects: [{ type: CardEffectType.GO_TO_JAIL, value: 3, description: '入狱 3 回合' }],
    },
    {
      id: 'destiny_12', name: '特赦令', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '总统签署特赦令。',
      effects: [{ type: CardEffectType.GET_OUT_OF_JAIL, value: 1, description: '获得出狱卡' }],
    },
    {
      id: 'destiny_13', name: '跳棋', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '你和对手交换了位置。',
      effects: [{ type: CardEffectType.EXCHANGE_POSITION, value: 1, description: '与随机对手交换位置' }],
    },
    {
      id: 'destiny_14', name: '税务稽查', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '税务局的稽查来了。',
      effects: [{ type: CardEffectType.PROPERTY_TAX, value: 300, description: '每处地产缴税 $300', condition: { minProperties: 1 } }],
    },
    {
      id: 'destiny_15', name: '全民分红', type: CardType.DESTINY, rarity: 'rare',
      flavor: '央行大放水，所有玩家获得分红。',
      effects: [{ type: CardEffectType.DIVIDEND, value: 1000, description: '所有玩家获得 $1000' }],
    },
    {
      id: 'destiny_16', name: '偷窃', type: CardType.DESTINY, rarity: 'rare',
      flavor: '你趁人不注意，拿走了一块地产。',
      effects: [{ type: CardEffectType.STEAL_PROPERTY, value: 1, description: '从对手偷取一处地产' }],
    },
    {
      id: 'destiny_17', name: '高速公路', type: CardType.DESTINY, rarity: 'common',
      flavor: '你找到了快车道。',
      effects: [{ type: CardEffectType.MOVE_FORWARD, value: 8, description: '前进 8 步' }],
    },
    {
      id: 'destiny_18', name: '贷款到期', type: CardType.DESTINY, rarity: 'common',
      flavor: '银行催你还贷款。',
      effects: [{ type: CardEffectType.MONEY_LOSE, value: 2000, description: '偿还 $2000' }],
    },
    {
      id: 'destiny_19', name: '跳过回合', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '你太累了，需要休息一回合。',
      effects: [{ type: CardEffectType.SKIP_TURN, value: 1, description: '跳过下个回合' }],
    },
    {
      id: 'destiny_20', name: '财神眷顾', type: CardType.DESTINY, rarity: 'legendary',
      flavor: '财神爷显灵了！',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 10000, description: '获得 $10000' },
        { type: CardEffectType.GET_OUT_OF_JAIL, value: 1, description: '获得出狱卡' },
      ],
    },

    // ==================== 特殊卡 (Special) ====================
    {
      id: 'special_01', name: '地产大亨', type: CardType.SPECIAL, rarity: 'legendary',
      flavor: '你获得了地产大亨的青睐。',
      effects: [
        { type: CardEffectType.UPGRADE_FREE, value: 2, description: '免费升级两处地产' },
        { type: CardEffectType.COLLECT_RENT, value: 500, description: '每处地产收租 $500' },
      ],
    },
    {
      id: 'special_02', name: '经济危机', type: CardType.SPECIAL, rarity: 'legendary',
      flavor: '全球经济危机来袭！',
      effects: [
        { type: CardEffectType.CPI_CHANGE, value: 10, description: 'CPI +10' },
        { type: CardEffectType.MONEY_LOSE, value: 3000, description: '损失 $3000' },
      ],
    },
    {
      id: 'special_03', name: '幸运星', type: CardType.SPECIAL, rarity: 'rare',
      flavor: '你今天运气爆棚！',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 3000, description: '获得 $3000' },
        { type: CardEffectType.EXTRA_TURN, value: 1, description: '获得额外回合' },
      ],
    },
    {
      id: 'special_04', name: '时空裂缝', type: CardType.SPECIAL, rarity: 'rare',
      flavor: '一道时空裂缝把你吸了进去。',
      effects: [
        { type: CardEffectType.TELEPORT, value: 0, description: '传送到起点' },
        { type: CardEffectType.MONEY_ADD, value: 2000, description: '获得工资 $2000' },
      ],
    },
    {
      id: 'special_05', name: '强盗抢劫', type: CardType.SPECIAL, rarity: 'rare',
      flavor: '一伙强盗洗劫了银行。',
      effects: [
        { type: CardEffectType.MONEY_LOSE, value: 5000, description: '损失 $5000' },
        { type: CardEffectType.GET_OUT_OF_JAIL, value: 1, description: '但你获得了一张出狱卡' },
      ],
    },

    // ==================== 扩展机会卡 ====================
    {
      id: 'chance_21', name: '意外遗产', type: CardType.CHANCE, rarity: 'rare',
      flavor: '你在整理旧文件时发现一笔被遗忘的家族信托基金。',
      effects: [{ type: CardEffectType.MONEY_ADD, value: 7000, description: '获得 $7000' }],
    },
    {
      id: 'chance_22', name: '网络攻击', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '黑客入侵了你的银行账户。',
      effects: [{ type: CardEffectType.MONEY_LOSE, value: 2000, description: '被盗 $2000' }],
    },
    {
      id: 'chance_23', name: '创业成功', type: CardType.CHANCE, rarity: 'rare',
      flavor: '你投资的一家初创公司成功上市了！',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 5000, description: '获得 $5000' },
        { type: CardEffectType.STOCK_BONUS, value: 2000, description: '额外股票收益 $2000' },
      ],
    },
    {
      id: 'chance_24', name: '法律诉讼', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '你卷入了一场法律诉讼。',
      effects: [
        { type: CardEffectType.MONEY_LOSE, value: 3000, description: '诉讼费 $3000' },
        { type: CardEffectType.GET_OUT_OF_JAIL, value: 1, description: '但学到了法律知识' },
      ],
    },
    {
      id: 'chance_25', name: '市场调研', type: CardType.CHANCE, rarity: 'common',
      flavor: '你获得了一份详细的市场调研报告。',
      effects: [{ type: CardEffectType.COLLECT_RENT, value: 300, description: '过路费收入 +300 每处' }],
    },
    {
      id: 'chance_26', name: '能源危机', type: CardType.CHANCE, rarity: 'rare',
      flavor: '能源价格暴涨，你的地产维护成本上升。',
      effects: [
        { type: CardEffectType.PROPERTY_REPAIR, value: 400, description: '每处地产维修 $400' },
        { type: CardEffectType.CPI_CHANGE, value: 3, description: 'CPI +3' },
      ],
    },
    {
      id: 'chance_27', name: '城市规划', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '市政府重新规划了你的地产所在区域。',
      effects: [
        { type: CardEffectType.UPGRADE_FREE, value: 1, description: '免费升级一次' },
        { type: CardEffectType.MONEY_ADD, value: 1500, description: '政府补偿 $1500' },
      ],
    },
    {
      id: 'chance_28', name: '金融危机', type: CardType.CHANCE, rarity: 'legendary',
      flavor: '全球金融危机！所有资产价格暴跌。',
      effects: [
        { type: CardEffectType.MONEY_LOSE, value: 8000, description: '损失 $8000' },
        { type: CardEffectType.CPI_CHANGE, value: -10, description: 'CPI -10' },
        { type: CardEffectType.DOWNGRADE_RANDOM, value: 1, description: '一处地产降级' },
      ],
    },
    {
      id: 'chance_29', name: '科研突破', type: CardType.CHANCE, rarity: 'legendary',
      flavor: '你投资的实验室取得了重大突破！',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 12000, description: '获得 $12000' },
        { type: CardEffectType.EXTRA_TURN, value: 1, description: '额外回合' },
        { type: CardEffectType.UPGRADE_FREE, value: 2, description: '免费升级两处' },
      ],
    },
    {
      id: 'chance_30', name: '人才引进', type: CardType.CHANCE, rarity: 'uncommon',
      flavor: '你雇佣了一位顶尖的资产管理专家。',
      effects: [
        { type: CardEffectType.BANK_INTEREST, value: 0.2, description: '银行利息 +20%' },
        { type: CardEffectType.MONEY_ADD, value: 2000, description: '初始收益 $2000' },
      ],
    },

    // ==================== 扩展命运卡 ====================
    {
      id: 'destiny_21', name: '自然灾害', type: CardType.DESTINY, rarity: 'rare',
      flavor: '一场大地震摧毁了多处建筑。',
      effects: [
        { type: CardEffectType.MONEY_LOSE, value: 4000, description: '损失 $4000' },
        { type: CardEffectType.DOWNGRADE_RANDOM, value: 2, description: '两处地产降级' },
      ],
    },
    {
      id: 'destiny_22', name: '发现金矿', type: CardType.DESTINY, rarity: 'legendary',
      flavor: '在你的地产下发现了金矿脉！',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 15000, description: '获得 $15000' },
        { type: CardEffectType.UPGRADE_FREE, value: 3, description: '免费升级三处' },
        { type: CardEffectType.COLLECT_RENT, value: 1000, description: '过路费 +1000' },
      ],
    },
    {
      id: 'destiny_23', name: '贸易协定', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '你促成了一项重要的国际贸易协定。',
      effects: [
        { type: CardEffectType.MONEY_FROM_ALL, value: 2000, description: '向对手收取 $500 每人' },
        { type: CardEffectType.CPI_CHANGE, value: -2, description: 'CPI -2 (经济稳定)' },
      ],
    },
    {
      id: 'destiny_24', name: '声誉扫地', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '你的商业丑闻上了头条。',
      effects: [
        { type: CardEffectType.MONEY_LOSE, value: 3000, description: '公关危机损失 $3000' },
        { type: CardEffectType.SKIP_TURN, value: 1, description: '跳过下回合' },
      ],
    },
    {
      id: 'destiny_25', name: '奇遇传送', type: CardType.DESTINY, rarity: 'rare',
      flavor: '你发现了一个神秘的传送门。',
      effects: [
        { type: CardEffectType.TELEPORT_LAYER, value: 2, description: '传送到天空层' },
        { type: CardEffectType.MONEY_ADD, value: 3000, description: '发现宝藏 $3000' },
      ],
    },
    {
      id: 'destiny_26', name: '税收豁免', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '政府因你的慈善贡献给予税收豁免。',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 4000, description: '退税 $4000' },
        { type: CardEffectType.BANK_INTEREST, value: 0.15, description: '利息收入 15%' },
      ],
    },
    {
      id: 'destiny_27', name: '商业间谍', type: CardType.DESTINY, rarity: 'rare',
      flavor: '你雇佣的商业间谍取得了对手的商业机密。',
      effects: [
        { type: CardEffectType.STEAL_PROPERTY, value: 1, description: '偷取一处地产' },
        { type: CardEffectType.STOCK_BONUS, value: 3000, description: '股票内幕交易 $3000' },
      ],
    },
    {
      id: 'destiny_28', name: '资本寒冬', type: CardType.DESTINY, rarity: 'rare',
      flavor: '风险投资大规模撤离，市场恐慌。',
      effects: [
        { type: CardEffectType.MONEY_LOSE, value: 6000, description: '投资亏损 $6000' },
        { type: CardEffectType.CPI_CHANGE, value: -5, description: 'CPI -5' },
        { type: CardEffectType.AUCTION_FORCE, value: 1, description: '强制拍卖一处地产' },
      ],
    },
    {
      id: 'destiny_29', name: '政策红利', type: CardType.DESTINY, rarity: 'uncommon',
      flavor: '央行降息降准，释放流动性。',
      effects: [
        { type: CardEffectType.BANK_INTEREST, value: 0.25, description: '存款利息 25%' },
        { type: CardEffectType.DIVIDEND, value: 2000, description: '全民分红 $2000' },
      ],
    },
    {
      id: 'destiny_30', name: '跨界并购', type: CardType.DESTINY, rarity: 'legendary',
      flavor: '你成功完成了一笔史诗级的跨界并购。',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 20000, description: '获得 $20000' },
        { type: CardEffectType.UPGRADE_FREE, value: 5, description: '免费升级五处' },
        { type: CardEffectType.EXTRA_TURN, value: 2, description: '额外两回合' },
      ],
    },

    // ==================== 扩展特殊卡 ====================
    {
      id: 'special_06', name: '时间停止', type: CardType.SPECIAL, rarity: 'legendary',
      flavor: '时间仿佛停止了，你可以重新规划一切。',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 5000, description: '获得 $5000' },
        { type: CardEffectType.EXTRA_TURN, value: 2, description: '额外两回合' },
        { type: CardEffectType.TELEPORT, value: 0, description: '回到起点' },
        { type: CardEffectType.GET_OUT_OF_JAIL, value: 1, description: '出狱卡' },
      ],
    },
    {
      id: 'special_07', name: '复仇时刻', type: CardType.SPECIAL, rarity: 'rare',
      flavor: '蓄力已久的商业反击开始！',
      effects: [
        { type: CardEffectType.STEAL_PROPERTY, value: 1, description: '偷取地产' },
        { type: CardEffectType.MONEY_FROM_ALL, value: 4000, description: '向每人收 $1000' },
        { type: CardEffectType.AUCTION_FORCE, value: 1, description: '强制拍卖对手一处地产' },
      ],
    },
    {
      id: 'special_08', name: '经济重启', type: CardType.SPECIAL, rarity: 'legendary',
      flavor: '央行实施量化宽松，经济全面重启。',
      effects: [
        { type: CardEffectType.CPI_CHANGE, value: -20, description: 'CPI 重置 -20' },
        { type: CardEffectType.DIVIDEND, value: 5000, description: '全民 $5000' },
        { type: CardEffectType.BANK_INTEREST, value: 0.3, description: '利息 30%' },
        { type: CardEffectType.COLLECT_RENT, value: 1000, description: '过路费大幅提高' },
      ],
    },
    {
      id: 'special_09', name: '维度跳跃', type: CardType.SPECIAL, rarity: 'rare',
      flavor: '你突破了维度的限制。',
      effects: [
        { type: CardEffectType.TELEPORT_LAYER, value: 1, description: '传送到地下层' },
        { type: CardEffectType.EXCHANGE_POSITION, value: 1, description: '交换位置' },
        { type: CardEffectType.MONEY_ADD, value: 3000, description: '维度奖励 $3000' },
      ],
    },
    {
      id: 'special_10', name: '天命所归', type: CardType.SPECIAL, rarity: 'legendary',
      flavor: '命运的齿轮开始转动，你是被选中的那个。',
      effects: [
        { type: CardEffectType.MONEY_ADD, value: 25000, description: '获得 $25000' },
        { type: CardEffectType.UPGRADE_FREE, value: 10, description: '免费升级十处' },
        { type: CardEffectType.GET_OUT_OF_JAIL, value: 3, description: '三张出狱卡' },
        { type: CardEffectType.EXTRA_TURN, value: 3, description: '额外三回合' },
        { type: CardEffectType.COLLECT_RENT, value: 5000, description: '过路费暴涨' },
      ],
    },
  ];

  return cards.map(c => new Card(c));
}

// ---- 机会卡 / 命运卡 分离 ----
export function getChanceCards(cards: Card[]): Card[] {
  return cards.filter(c => c.type === CardType.CHANCE);
}

export function getDestinyCards(cards: Card[]): Card[] {
  return cards.filter(c => c.type === CardType.DESTINY);
}

export function getCardsByRarity(cards: Card[], rarity: string): Card[] {
  return cards.filter(c => c.rarity === rarity);
}
