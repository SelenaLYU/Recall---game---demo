import Phaser from 'phaser';

export interface VineSwingInput {
  /** -1..1，摆荡发力方向 */
  dirX: number;
  /** -1..1，攀爬方向（上/下） */
  climb: number;
}

/**
 * 藤蔓：单摆物理的摆荡绳（参考《双人成行》绳子桥段、《阿凡达》藤蔓意象）。
 * 抓住后 A/D 摆荡蓄力、W/S 上下爬，松手时按当前摆速切向甩出。
 * 画面为程序化占位（茎+叶片），B 的素材到货后 redraw 换纹理即可，物理不动。
 */
export class Vine {
  readonly anchorX: number;
  readonly anchorY: number;

  /** 当前摆角（0 = 垂直向下，正值为向右） */
  angle = 0;
  /** 角速度 rad/s */
  angVel = 0;
  /** 当前握点绳长 */
  length: number;

  private readonly minLength: number;
  private readonly maxLength: number;
  private readonly visual: Phaser.GameObjects.Graphics;
  /** 茉莉藤蔓贴图身体（跟随摆角旋转、绳长缩放；无贴图时退回线条绘制） */
  private readonly bodyImage: Phaser.GameObjects.Image | null;
  /** 握点的发光五彩茉莉花枝（B 新素材）：花心对齐握点，随绳摆动 */
  private readonly handFlower: Phaser.GameObjects.Image | null;
  /** 花枝贴图里花心的位置（256×256 源，花头中心实测 ≈(128,88)） */
  private static readonly FLOWER_ORIGIN = { x: 0.5, y: 88 / 256 };
  /** 握点预告光环（玩家接近时亮起，标记可抓范围） */
  private readonly handGlow: Phaser.GameObjects.Ellipse;
  private near = false;
  private cooldownUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    anchorX: number,
    anchorY: number,
    options?: { length?: number; minLength?: number; maxLength?: number },
  ) {
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.length = options?.length ?? 190;
    this.minLength = options?.minLength ?? Math.max(110, this.length - 60);
    this.maxLength = options?.maxLength ?? this.length + 30;
    this.visual = scene.add.graphics().setDepth(3);
    this.bodyImage = scene.textures.exists('env-jasmine-vine')
      ? scene.add.image(anchorX, anchorY, 'env-jasmine-vine').setOrigin(0.5, 0).setDepth(2)
      : null;
    // 握点花：B 的发光五彩茉莉花枝，替换原程序花瓣环（2026-09-24 按需求更换）
    this.handFlower = scene.textures.exists('env-glowing-sprig')
      ? scene.add
          .image(anchorX, anchorY + this.length, 'env-glowing-sprig')
          .setOrigin(
            Vine.FLOWER_ORIGIN.x,
            Vine.FLOWER_ORIGIN.y,
          )
          .setScale(0.62)
          .setDepth(3)
      : null;
    this.handGlow = scene.add
      .ellipse(0, 0, 36, 36, 0xf6e7b8, 0.24)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(3)
      .setVisible(false);
    this.redraw();
  }

  get handX(): number {
    return this.anchorX + Math.sin(this.angle) * this.length;
  }

  get handY(): number {
    return this.anchorY + Math.cos(this.angle) * this.length;
  }

  get available(): boolean {
    return this.scene.time.now >= this.cooldownUntil;
  }

  /** 玩家接近：握点光环亮起并轻摆预告（未抓住时由场景每帧调用 idleUpdate） */
  setNear(near: boolean): void {
    if (this.near === near) {
      return;
    }
    this.near = near;
    this.handGlow.setVisible(near);
  }

  /** 未抓住时的待机：向竖直方向弹性回落；玩家接近时叠加轻微摆动预告 */
  idleUpdate(deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.angVel += -this.angle * 2.2 * dt;
    if (this.near) {
      this.angVel += Math.sin(this.scene.time.now * 0.004) * 0.4 * dt;
    }
    this.angVel *= 0.96;
    this.angle = Phaser.Math.Clamp(this.angle + this.angVel * dt, -0.5, 0.5);
    this.redraw();
  }

  /** 抓住瞬间带入水平动量；摆幅太小则给保底起摆，保证马上能用 */
  grab(carryVelocityX: number): void {
    const dir = carryVelocityX >= 0 ? 1 : -1;
    this.angle = 0.18 * dir;
    this.angVel = (carryVelocityX / this.length) * 0.65;
    if (Math.abs(this.angVel) < 0.9) {
      this.angVel = 0.9 * dir;
    }
  }

  /** 松手后短暂不可重抓，防止瞬间吸回去 */
  startCooldown(ms = 450): void {
    this.cooldownUntil = this.scene.time.now + ms;
  }

  update(deltaMs: number, input: VineSwingInput): void {
    const dt = Math.min(deltaMs, 50) / 1000;

    // 单摆：切向重力 + 玩家发力（靠近最低点发力最有效，像真实荡秋千）
    const gravity = -(1400 / this.length) * Math.sin(this.angle);
    const pump = input.dirX * 3.6 * Math.max(Math.cos(this.angle), 0.12);
    this.angVel += (gravity + pump) * dt;
    this.angVel *= 0.996;
    this.angVel = Phaser.Math.Clamp(this.angVel, -3.2, 3.2);

    this.angle += this.angVel * dt;
    if (Math.abs(this.angle) > 1.15) {
      this.angle = Phaser.Math.Clamp(this.angle, -1.15, 1.15);
      this.angVel *= -0.25;
    }

    // 上下爬改变绳长（越短摆得越快）
    this.length = Phaser.Math.Clamp(
      this.length + input.climb * 110 * dt,
      this.minLength,
      this.maxLength,
    );

    this.redraw();
  }

  /** 松手时的甩出速度：切向速度 + 向上助力 */
  releaseVelocity(): { vx: number; vy: number } {
    const tangential = this.angVel * this.length;
    return {
      vx: Math.cos(this.angle) * tangential * 1.25,
      vy: -Math.sin(this.angle) * tangential * 1.25 - 260,
    };
  }

  private redraw(): void {
    const g = this.visual;
    g.clear();
    const handX = this.handX;
    const handY = this.handY;
    this.handGlow.setPosition(handX, handY);

    if (this.bodyImage) {
      // 贴图身体：顶端挂在锚点，随摆角旋转、按绳长缩放
      this.bodyImage.setRotation(-this.angle);
      this.bodyImage.setDisplaySize(this.length * 0.26, this.length);
    } else {
      // 主茎：带一点弧度（三段折线近似）
      g.lineStyle(6, 0x3f6b4f, 1);
      const midX = (this.anchorX + handX) / 2 - Math.sin(this.angle) * 8;
      const midY = (this.anchorY + handY) / 2;
      g.beginPath();
      g.moveTo(this.anchorX, this.anchorY);
      g.lineTo(midX, midY);
      g.lineTo(handX, handY);
      g.strokePath();
      g.fillStyle(0x4a7a5c, 1);
      for (const t of [0.3, 0.5, 0.7, 0.88]) {
        const lx = Phaser.Math.Linear(this.anchorX, handX, t) + (t > 0.5 ? -6 : 6);
        const ly = Phaser.Math.Linear(this.anchorY, handY, t);
        g.fillEllipse(lx, ly, 14, 7);
      }
    }

    // 末端握点：发光五彩茉莉花枝（花心=握点，随绳摆动）；程序花瓣环已退役。
    // 花心对齐约定与 Player.GRAB_FLOWER 的"帧内花心钉握点"共用同一握点坐标
    if (this.handFlower) {
      this.handFlower.setPosition(handX, handY).setRotation(-this.angle);
    } else {
      // 无贴图回退：花瓣环 + 亮花心 + 描边圈，明确"这里能抓"
      g.fillStyle(0xe9f5e4, 1);
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 + 0.4;
        g.fillEllipse(handX + Math.cos(a) * 8, handY + Math.sin(a) * 8, 10, 10);
      }
      g.lineStyle(2, 0x8a6d3b, 0.95);
      g.strokeCircle(handX, handY, 12);
      g.fillStyle(0xf6e7b8, 1);
      g.fillCircle(handX, handY, 5);
    }
  }
}
