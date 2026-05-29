// ============================================================
// Effects.ts — 粒子特效系统
// 金钱飞入、升级闪光、骰子动画等
// ============================================================

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
  gravity: number;
  text?: string;
}

export class Effects {
  particles: Particle[] = [];
  private animationCallbacks: Array<() => boolean> = [];

  update(dt: number): void {
    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.rotation += p.rotationSpeed * dt;
      p.alpha = p.life / p.maxLife;
      p.size *= 0.995;
    }

    // 更新动画回调
    this.animationCallbacks = this.animationCallbacks.filter(cb => cb());
  }

  render(ctx: CanvasRenderingContext2D, camera: { x: number; y: number; scale: number }): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x * camera.scale + camera.x, p.y * camera.scale + camera.y);
      ctx.scale(camera.scale, camera.scale);
      ctx.rotate(p.rotation);

      if (p.text) {
        ctx.font = `${p.size}px "Microsoft YaHei"`;
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /** 金钱飞入特效 */
  moneyFly(x: number, y: number, amount: number, color: string = '#FFD700'): void {
    const sign = amount >= 0 ? '+' : '';
    const text = `${sign}$${Math.abs(amount)}`;
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 120,
        vy: -Math.random() * 200 - 50,
        life: 1.2,
        maxLife: 1.2,
        size: Math.random() * 8 + 14,
        color: amount >= 0 ? '#2ECC71' : '#E74C3C',
        alpha: 1,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 3,
        gravity: 150,
        text,
      });
    }
  }

  /** 骰子滚动 */
  diceBounce(x: number, y: number, value: number): void {
    this.particles.push({
      x, y,
      vx: 0, vy: -80,
      life: 0.8, maxLife: 0.8,
      size: 28,
      color: '#FFFFFF',
      alpha: 1,
      rotation: 0,
      rotationSpeed: 5,
      gravity: 200,
      text: `${value}`,
    });
  }

  /** 升级闪光 */
  upgradeSparkle(x: number, y: number): void {
    for (let i = 0; i < 15; i++) {
      const angle = (Math.PI * 2 * i) / 15;
      const speed = 100 + Math.random() * 150;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: 3 + Math.random() * 5,
        color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'][Math.floor(Math.random() * 4)],
        alpha: 1,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 10,
        gravity: 0,
      });
    }
  }

  /** 破产爆炸（大型特效） */
  bankruptcyExplosion(x: number, y: number): void {
    // 红色大爆炸
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 500;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random() * 2,
        maxLife: 2.5,
        size: 3 + Math.random() * 12,
        color: ['#E74C3C', '#C0392B', '#FF6B6B', '#FF0000', '#FFD700'][Math.floor(Math.random() * 5)],
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
        gravity: 80,
      });
    }
    // 金色碎片
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 300,
        vy: -200 - Math.random() * 400,
        life: 1.5 + Math.random(),
        maxLife: 2.5,
        size: 4 + Math.random() * 6,
        color: '#FFD700',
        alpha: 1,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 5,
        gravity: 200,
      });
    }
  }

  /** 建造动画 */
  buildAnimation(x: number, y: number): void {
    // 锤子敲击
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 60,
        vy: Math.sin(angle) * 60 - 30,
        life: 0.5, maxLife: 0.5,
        size: 4 + Math.random() * 4,
        color: '#F39C12',
        alpha: 1,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 12,
        gravity: 40,
      });
    }
    // 🏗️
    this.particles.push({
      x, y,
      vx: 0, vy: -60,
      life: 1.2, maxLife: 1.2,
      size: 24,
      color: '#FFD700',
      alpha: 1,
      rotation: 0,
      rotationSpeed: 0,
      gravity: 0,
      text: '🔨',
    });
  }

  /** 层切换传送特效 */
  teleportSwirl(x: number, y: number): void {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 20 + Math.random() * 40;
      this.particles.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        vx: -Math.cos(angle) * 100,
        vy: -Math.sin(angle) * 100,
        life: 0.8 + Math.random() * 0.5,
        maxLife: 1.3,
        size: 2 + Math.random() * 6,
        color: '#87CEEB',
        alpha: 1,
        rotation: angle,
        rotationSpeed: 4,
        gravity: 0,
      });
    }
  }

  /** 文本漂浮 */
  floatingText(x: number, y: number, text: string, color: string = '#FFFFFF'): void {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 30,
      vy: -100,
      life: 2,
      maxLife: 2,
      size: 18,
      color,
      alpha: 1,
      rotation: 0,
      rotationSpeed: 0,
      gravity: 0,
      text,
    });
  }

  clear(): void {
    this.particles = [];
    this.animationCallbacks = [];
  }

  /** 骰子旋转动画 */
  diceRollAnimation(x: number, y: number, duration: number = 0.6): void {
    const callback = (): boolean => {
      duration -= 0.016;
      if (duration <= 0) return false;
      // Random face during roll
      const face = Math.floor(Math.random() * 6) + 1;
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 40,
        vy: -40 - Math.random() * 40,
        life: 0.3, maxLife: 0.3,
        size: 16 + Math.random() * 8,
        color: '#FFFFFF',
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 12,
        gravity: 100,
        text: `${face}`,
      });
      return true;
    };
    this.animationCallbacks.push(callback);
  }

  /** 股票涨跌动效 */
  stockFlash(x: number, y: number, isUp: boolean): void {
    const color = isUp ? '#2ECC71' : '#E74C3C';
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 100,
        y: y + (Math.random() - 0.5) * 60,
        vx: 0,
        vy: isUp ? -60 : 60,
        life: 1.0, maxLife: 1.0,
        size: 3 + Math.random() * 6,
        color,
        alpha: 1,
        rotation: 0,
        rotationSpeed: 0,
        gravity: 0,
        text: isUp ? '▲' : '▼',
      });
    }
  }

  /** 拍卖落槌特效 */
  auctionHammer(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 80,
        vy: Math.sin(angle) * 80,
        life: 0.6, maxLife: 0.6,
        size: 4 + Math.random() * 4,
        color: '#F39C12',
        alpha: 1,
        rotation: angle,
        rotationSpeed: 6,
        gravity: 0,
      });
    }
  }

  /** 关卡切换过渡 */
  layerTransitionFlash(_layerName: string): void {
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: Math.random() * 1400,
        y: Math.random() * 900,
        vx: 0, vy: -100 - Math.random() * 200,
        life: 0.5 + Math.random() * 1,
        maxLife: 1.5,
        size: 2 + Math.random() * 4,
        color: ['#87CEEB', '#AED6F1', '#FFFFFF'][Math.floor(Math.random() * 3)],
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 4,
        gravity: 50,
      });
    }
  }

  /** 卡牌翻转 */
  cardFlip(x: number, y: number, cardName: string): void {
    this.particles.push({
      x, y,
      vx: 0, vy: -120,
      life: 1.5, maxLife: 1.5,
      size: 22,
      color: '#FFD700',
      alpha: 1,
      rotation: 0,
      rotationSpeed: 0,
      gravity: 0,
      text: cardName,
    });

    // 闪边
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 50,
        vy: Math.sin(angle) * 50,
        life: 0.4, maxLife: 0.4,
        size: 2 + Math.random() * 3,
        color: '#FFFFFF',
        alpha: 1,
        rotation: 0,
        rotationSpeed: 0,
        gravity: 0,
      });
    }
  }
}
