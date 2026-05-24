// ============================================================
// SaveFileHandler.ts — 存档文件处理
// localStorage 读写、导入导出 JSON 文件
// ============================================================

import type { SaveEntry } from '../core/StateManager';
import { state } from '../core/StateManager';

const SAVE_KEY = 'empire-tycoon-saves';
const SETTINGS_KEY = 'empire-tycoon-settings';

export class SaveFileHandler {
  /** 保存到 localStorage */
  static persistSave(entry: SaveEntry): void {
    const saves = SaveFileHandler.loadAllSaves();
    saves.push(entry);
    // 限制存档数量
    if (saves.length > 10) saves.shift();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
    } catch {
      console.warn('localStorage 已满，无法保存');
    }
  }

  /** 读取所有存档 */
  static loadAllSaves(): SaveEntry[] {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** 读取指定存档 */
  static loadSave(index: number): SaveEntry | null {
    const saves = SaveFileHandler.loadAllSaves();
    return saves[index] ?? null;
  }

  /** 删除存档 */
  static deleteSave(index: number): void {
    const saves = SaveFileHandler.loadAllSaves();
    saves.splice(index, 1);
    localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
  }

  /** 导出为 JSON 文件 */
  static exportSave(entry: SaveEntry): void {
    const json = JSON.stringify(entry, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empire-tycoon-save-${entry.timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** 从 JSON 文件导入 */
  static importSave(file: File): Promise<SaveEntry> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as SaveEntry;
          resolve(data);
        } catch {
          reject(new Error('无效的存档文件'));
        }
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  }

  /** 保存设置 */
  static persistSettings(settings: unknown): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
  }

  /** 读取设置 */
  static loadSettings<T>(): T | null {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  }

  /** 清空所有数据 */
  static clearAll(): void {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  }

  /** 获取存储使用量估算 */
  static getStorageUsage(): string {
    let bytes = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        bytes += localStorage[key].length * 2; // UTF-16
      }
    }
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
