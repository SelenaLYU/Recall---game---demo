import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { Effects } from '../gameplay/Effects';
import { Sfx } from '../systems/Sfx';

const WORLD_WIDTH = 2560;
const WORLD_HEIGHT = 640;
const GROUND_TOP = 560;
/** 掉出地图判定线（世界下界之外） */
const KILL_Y = 820;

const GOLD = 0xe6cf97;

export default class ForestScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private sfx!: Sfx;
  private keyVisual!: Phaser.GameObjects.Container;
  private keyZone!: Phaser.GameObjects.Zone;
  private doorVisual!: Phaser.GameObjects.Container;
  private doorZone!: Phaser.GameObjects.Zone;
  private doorGlow!: Phaser.GameObjects.Ellipse;
  private hintText!: Phaser.GameObjects.Text;

  private hasKey = false;
  private doorEntered = false;
  private restarting = false;

  constructor() {
    // 场景级物理配置：main.ts 不需要全局 physics（AGENTS.md 第 5 节）
    const enableDebug =
      import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug');
    super({
      key: 'forest',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 1400 }, debug: enableDebug },
      },
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#17382b');
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT, true, true, false, false);

    // 背景由远及近：天空渐变 → 飘雾 → 远山两层 → 灌木 → 树
    this.buildSky();
    this.buildMist();
    this.buildBackground();
    this.buildBushes();
    this.buildTrees();
    this.buildTerrain();
    this.buildPlayer();
    this.buildKey();
    this.buildDoor();
    this.setupCamera();
    this.buildHud();
    this.buildVignette();
    Effects.fireflies(this, WORLD_WIDTH, 16);

    this.cameras.main.fadeIn(250, 23, 56, 43);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__forestScene = this;
    }
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);

    if (this.restarting) {
      return;
    }
    if (this.player.view.y > KILL_Y) {
      this.restarting = true;
      this.sfx.fall();
      this.cameras.main.fade(250, 10, 20, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
    }
  }

  /** 天空渐变：上亮下暗，压住画面底色 */
  private buildSky(): void {
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
    sky.fillGradientStyle(0x24503c, 0x24503c, 0x17382b, 0x17382b, 1);
    sky.fillRect(0, 0, 960, 540);
    sky.fillStyle(0x2d5a44, 0.3);
    sky.fillRect(0, 0, 960, 80);
  }

  /** 近天飘雾，极慢横向漂移 */
  private buildMist(): void {
    for (let i = 0; i < 3; i++) {
      const mist = this.add
        .ellipse(220 + i * 340, 180 + i * 62, 260 + i * 70, 34 + i * 8, 0xbfd8c6, 0.06)
        .setScrollFactor(0.06 + i * 0.03)
        .setDepth(-9);
      this.tweens.add({
        targets: mist,
        x: mist.x + 90,
        duration: 9000 + i * 3500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** 远山两层，慢速视差 */
  private buildBackground(): void {
    this.buildHillLayer(0.15, 0x1d4433, 400, 220, 0, -8);
    this.buildHillLayer(0.35, 0x244f3b, 470, 180, 70, -7);
  }

  private buildHillLayer(
    scrollFactor: number,
    color: number,
    baseY: number,
    amplitude: number,
    shift: number,
    depth: number,
  ): void {
    const width = 960 + (WORLD_WIDTH - 960) * scrollFactor + 240;
    const g = this.add.graphics().setScrollFactor(scrollFactor).setDepth(depth);
    g.fillStyle(color, 1);
    for (let x = -120; x < width + 120; x += 210) {
      const w = 320 + ((x + shift) % 90);
      const h = amplitude + ((x + shift) % 60);
      g.fillEllipse(x, baseY, w, h);
    }
    g.fillRect(0, baseY, width, WORLD_HEIGHT + 200 - baseY);
  }

  /** 灌木层：比远山更近，贴着地平线 */
  private buildBushes(): void {
    const factor = 0.6;
    const width = 960 + (WORLD_WIDTH - 960) * factor + 200;
    const g = this.add.graphics().setScrollFactor(factor).setDepth(-5);
    g.fillStyle(0x1f4032, 1);
    for (let x = -60; x < width; x += 92) {
      const r = 26 + ((x * 7) % 22);
      g.fillEllipse(x, 562, r * 2, r);
    }
  }

  /** 世界层装饰树（无碰撞，位于角色身后） */
  private buildTrees(): void {
    const g = this.add.graphics().setDepth(-4);
    const spots = [820, 1010, 1305, 2090, 2260, 2490];
    spots.forEach((x, i) => {
      const scale = 0.85 + ((i * 37) % 40) / 100;
      const trunkHeight = 56 * scale;
      const trunkWidth = 10 * scale;
      g.fillStyle(0x2a3b30, 1);
      g.fillRect(x - trunkWidth / 2, GROUND_TOP - trunkHeight, trunkWidth, trunkHeight);
      g.fillStyle(0x336049, 1);
      g.fillCircle(x, GROUND_TOP - trunkHeight - 12 * scale, 27 * scale);
      g.fillStyle(0x3b6d52, 1);
      g.fillCircle(x - 15 * scale, GROUND_TOP - trunkHeight + 2 * scale, 18 * scale);
      g.fillCircle(x + 16 * scale, GROUND_TOP - trunkHeight, 19 * scale);
    });
  }

  private buildTerrain(): void {
    this.terrain = new Terrain(this);
    // 出生高地 → 斜坡下行 → 主地面
    this.terrain.addPlatform({ x: 0, y: 180, width: 320, height: 460 });
    this.terrain.addSlope({ x: 320, y: 180, width: 440, drop: 380 });
    this.terrain.addPlatform({ x: 760, y: GROUND_TOP, width: 400, height: 80 });
    // 坑（掉落重来）与右侧上跳路线
    this.terrain.addPlatform({ x: 1250, y: GROUND_TOP, width: 150, height: 80 });
    this.terrain.addPlatform({ x: 1460, y: 460, width: 140, height: 24, kind: 'float' });
    this.terrain.addPlatform({ x: 1650, y: 370, width: 120, height: 24, kind: 'float' });
    this.terrain.addPlatform({ x: 1830, y: 280, width: 120, height: 24, kind: 'float' });
    // 钥匙平台右侧的落点地面，门在这里
    this.terrain.addPlatform({ x: 2010, y: GROUND_TOP, width: 550, height: 80 });
  }

  private buildPlayer(): void {
    this.sfx = new Sfx(this);
    this.player = new Player(this, { x: 140, y: 130, sfx: this.sfx });
    this.physics.add.collider(this.player.view, this.terrain.solids);
  }

  private buildKey(): void {
    const x = 1890;
    const y = 228;
    this.keyVisual = this.add.container(x, y).setDepth(6);
    const glow = this.add.ellipse(0, 0, 64, 64, GOLD, 0.18);
    const keyGraphic = this.add.graphics();
    keyGraphic.lineStyle(4, GOLD, 1);
    keyGraphic.strokeCircle(0, -8, 7);
    keyGraphic.fillStyle(GOLD, 1);
    keyGraphic.fillRect(-2, -2, 4, 16);
    keyGraphic.fillRect(2, 8, 6, 4);
    // 环绕光点，缓慢公转
    const orbit = this.add.container(0, 0);
    orbit.add([
      this.add.circle(18, 0, 2.5, 0xf6e7b8, 0.9),
      this.add.circle(-18, 0, 2, 0xf6e7b8, 0.7),
    ]);
    this.keyVisual.add([glow, keyGraphic, orbit]);
    this.tweens.add({
      targets: orbit,
      angle: 360,
      duration: 2600,
      repeat: -1,
    });
    this.tweens.add({
      targets: this.keyVisual,
      y: y - 10,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.keyZone = this.add.zone(x, y, 64, 72);
    this.physics.add.existing(this.keyZone, true);
    this.physics.add.overlap(this.player.view, this.keyZone, () => this.collectKey());
  }

  private buildDoor(): void {
    this.doorVisual = this.add.container(2380, GROUND_TOP).setDepth(6).setVisible(false);
    this.doorGlow = this.add.ellipse(0, -58, 96, 136, GOLD, 0.12);
    const frame = this.add
      .rectangle(0, 0, 76, 116, 0x8a6d3b)
      .setOrigin(0.5, 1)
      .setStrokeStyle(3, 0x11251d, 0.8);
    const inner = this.add.rectangle(0, -6, 62, 104, 0x1c2f26).setOrigin(0.5, 1);
    this.doorVisual.add([this.doorGlow, frame, inner]);

    this.doorZone = this.add.zone(2380, GROUND_TOP - 60, 96, 120);
    this.physics.add.existing(this.doorZone, true);
    this.physics.add.overlap(this.player.view, this.doorZone, () => this.enterDoor());
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.startFollow(this.player.view, true, 0.12, 0.12);
    cam.setDeadzone(140, 90);
  }

  private buildHud(): void {
    this.hintText = this.add
      .text(16, 14, 'A/D 或 ←/→ 移动 · 空格跳跃', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#d3ddd5',
        backgroundColor: 'rgba(0, 0, 0, 0.33)',
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** 四周轻暗角，收敛视觉焦点 */
  private buildVignette(): void {
    if (!this.textures.exists('vignette')) {
      const texture = this.textures.createCanvas('vignette', 960, 540);
      const ctx = texture?.getContext();
      if (texture && ctx) {
        const gradient = ctx.createRadialGradient(480, 270, 210, 480, 270, 560);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 960, 540);
        texture.refresh();
      }
    }
    this.add.image(480, 270, 'vignette').setScrollFactor(0).setDepth(90);
  }

  private showHint(message: string): void {
    const original = 'A/D 或 ←/→ 移动 · 空格跳跃';
    this.hintText.setText(message).setColor('#e6cf97');
    this.time.delayedCall(2600, () => {
      this.hintText.setText(original).setColor('#d3ddd5');
    });
  }

  private collectKey(): void {
    if (this.hasKey) {
      return;
    }
    this.hasKey = true;
    this.sfx.key();
    Effects.sparkBurst(this, this.keyVisual.x, this.keyVisual.y, 12);
    this.tweens.killTweensOf(this.keyVisual);
    this.keyVisual.destroy();
    this.keyZone.destroy();

    this.cameras.main.flash(120, 230, 207, 151);
    this.showHint('拿到了钥匙，前方出现了门');

    this.doorVisual.setVisible(true).setAlpha(0).setScale(0.6, 0.8);
    this.sfx.door();
    Effects.ring(this, 2380, GROUND_TOP - 58);
    this.tweens.add({
      targets: this.doorVisual,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 600,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.doorGlow,
          alpha: { from: 0.08, to: 0.2 },
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  private enterDoor(): void {
    if (!this.hasKey || this.doorEntered || !this.doorVisual.visible) {
      return;
    }
    this.doorEntered = true;
    this.sfx.enter();
    this.player.freeze();
    this.tweens.killTweensOf(this.doorGlow);
    this.cameras.main.fade(400, 23, 45, 35);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('room'));
  }
}
