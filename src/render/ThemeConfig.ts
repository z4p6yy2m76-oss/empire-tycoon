// ============================================================
// ThemeConfig.ts — 主题/皮肤配置
// 支持多种视觉主题切换
// ============================================================

export interface ColorPalette {
  bg: string;
  panel: string;
  text: string;
  accent: string;
  primary: string;
  danger: string;
  success: string;
  warning: string;
  muted: string;
  gold: string;
}

export interface Theme {
  name: string;
  id: string;
  colors: ColorPalette;
  fontFamily: string;
  borderRadius: number;
  animationSpeed: number;
}

export const THEMES: Record<string, Theme> = {
  dark: {
    name: '暗夜之城',
    id: 'dark',
    colors: {
      bg: '#1a1a2e',
      panel: '#16213e',
      text: '#ECF0F1',
      accent: '#2E75B6',
      primary: '#3498DB',
      danger: '#E74C3C',
      success: '#2ECC71',
      warning: '#F39C12',
      muted: '#7F8C8D',
      gold: '#FFD700',
    },
    fontFamily: '"Microsoft YaHei", sans-serif',
    borderRadius: 6,
    animationSpeed: 1,
  },

  light: {
    name: '极简白',
    id: 'light',
    colors: {
      bg: '#F5F6FA',
      panel: '#FFFFFF',
      text: '#2C3E50',
      accent: '#3498DB',
      primary: '#2980B9',
      danger: '#C0392B',
      success: '#27AE60',
      warning: '#E67E22',
      muted: '#BDC3C7',
      gold: '#F1C40F',
    },
    fontFamily: '"Microsoft YaHei", sans-serif',
    borderRadius: 8,
    animationSpeed: 1.2,
  },

  retro: {
    name: '复古像素',
    id: 'retro',
    colors: {
      bg: '#2B2B2B',
      panel: '#1A1A1A',
      text: '#00FF00',
      accent: '#FF6B6B',
      primary: '#4ECDC4',
      danger: '#FF0000',
      success: '#00FF00',
      warning: '#FFFF00',
      muted: '#888888',
      gold: '#FFD700',
    },
    fontFamily: '"Courier New", monospace',
    borderRadius: 0,
    animationSpeed: 0.5,
  },

  cyberpunk: {
    name: '赛博朋克',
    id: 'cyberpunk',
    colors: {
      bg: '#0D0221',
      panel: '#150535',
      text: '#FF2A6D',
      accent: '#05D9E8',
      primary: '#D1F7FF',
      danger: '#FF2A6D',
      success: '#05D9E8',
      warning: '#FFB800',
      muted: '#261458',
      gold: '#FFB800',
    },
    fontFamily: '"Microsoft YaHei", sans-serif',
    borderRadius: 2,
    animationSpeed: 1.5,
  },

  nature: {
    name: '自然绿意',
    id: 'nature',
    colors: {
      bg: '#1B3A2D',
      panel: '#254B39',
      text: '#E8F5E9',
      accent: '#4CAF50',
      primary: '#66BB6A',
      danger: '#EF5350',
      success: '#81C784',
      warning: '#FFA726',
      muted: '#6D8B74',
      gold: '#FFCA28',
    },
    fontFamily: '"Microsoft YaHei", sans-serif',
    borderRadius: 10,
    animationSpeed: 0.9,
  },
};

export class ThemeManager {
  private currentTheme: Theme = THEMES.dark;
  private themeChangeCallbacks: Array<(theme: Theme) => void> = [];

  getTheme(): Theme { return this.currentTheme; }

  setTheme(themeId: string): boolean {
    const theme = THEMES[themeId];
    if (!theme) return false;
    this.currentTheme = theme;
    this.themeChangeCallbacks.forEach(cb => cb(theme));
    this.persistTheme(themeId);
    return true;
  }

  getAvailableThemes(): Theme[] {
    return Object.values(THEMES);
  }

  onThemeChange(callback: (theme: Theme) => void): () => void {
    this.themeChangeCallbacks.push(callback);
    return () => {
      this.themeChangeCallbacks = this.themeChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  private persistTheme(themeId: string): void {
    try {
      localStorage.setItem('empire-tycoon-theme', themeId);
    } catch { /* ignore */ }
  }

  loadPersistedTheme(): boolean {
    try {
      const saved = localStorage.getItem('empire-tycoon-theme');
      if (saved && THEMES[saved]) {
        this.setTheme(saved);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  /** 随机主题 */
  randomTheme(): Theme {
    const themes = Object.values(THEMES);
    const idx = Math.floor(Math.random() * themes.length);
    this.currentTheme = themes[idx];
    return this.currentTheme;
  }
}

export const themeManager = new ThemeManager();
