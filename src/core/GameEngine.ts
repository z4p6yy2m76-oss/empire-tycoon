// ============================================================
// GameEngine.ts — 游戏主循环
// 控制帧率、驱动 update/render 循环、管理游戏状态机
// ============================================================

import { GamePhase, state } from './StateManager';
import { bus } from './EventBus';

export enum EngineState {
  INIT,
  RUNNING,
  PAUSED,
  STOPPED,
}

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private lastTime: number = 0;
  private deltaTime: number = 0;
  private accumulator: number = 0;
  private readonly fixedDt: number = 1000 / 60; // 60 FPS 固定步长
  private engineState: EngineState = EngineState.INIT;

  // 子系统回调
  private updateFn: ((dt: number) => void) | null = null;
  private renderFn: ((ctx: CanvasRenderingContext2D, dt: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get Canvas 2D context');
    this.ctx = ctx;
    this.resize(canvas);
  }

  resize(canvas?: HTMLCanvasElement): void {
    const c = canvas ?? this.ctx.canvas;
    const w = Math.min(window.innerWidth, 1400);
    const h = Math.min(window.innerHeight, 900);
    c.width = w;
    c.height = h;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
  }

  setUpdate(fn: (dt: number) => void): void { this.updateFn = fn; }
  setRender(fn: (ctx: CanvasRenderingContext2D, dt: number) => void): void { this.renderFn = fn; }

  start(): void {
    if (this.engineState === EngineState.RUNNING) return;
    this.engineState = EngineState.RUNNING;
    this.lastTime = performance.now();
    this.accumulator = 0;
    state.phase = GamePhase.MENU;
    bus.emit('game.init', undefined);
    requestAnimationFrame((t) => this.loop(t));
  }

  pause(): void {
    if (this.engineState !== EngineState.RUNNING) return;
    this.engineState = EngineState.PAUSED;
    state.phase = GamePhase.MENU;
    bus.emit('game.pause', undefined);
  }

  resume(): void {
    if (this.engineState !== EngineState.PAUSED) return;
    this.engineState = EngineState.RUNNING;
    this.lastTime = performance.now();
    this.accumulator = 0;
    bus.emit('game.resume', undefined);
    requestAnimationFrame((t) => this.loop(t));
  }

  stop(): void {
    this.engineState = EngineState.STOPPED;
  }

  get isRunning(): boolean { return this.engineState === EngineState.RUNNING; }
  get isPaused(): boolean { return this.engineState === EngineState.PAUSED; }

  private loop = (timestamp: number): void => {
    if (this.engineState !== EngineState.RUNNING) return;

    this.deltaTime = Math.min(timestamp - this.lastTime, 100); // 防止长帧卡死
    this.lastTime = timestamp;
    this.accumulator += this.deltaTime;

    // 固定步长更新
    while (this.accumulator >= this.fixedDt) {
      this.updateFn?.(this.fixedDt / 1000);
      this.accumulator -= this.fixedDt;
    }

    // 渲染
    this.renderFn?.(this.ctx, this.deltaTime / 1000);

    requestAnimationFrame((t) => this.loop(t));
  };
}
