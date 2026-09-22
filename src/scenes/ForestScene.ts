import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { Effects } from '../gameplay/Effects';
import { Sfx } from '../systems/Sfx';
import { Vine } from '../gameplay/Vine';
import { Flower } from '../gameplay/Flower';
import { RespawnPoint } from '../gameplay/RespawnPoint';

const WORLD_WIDTH = 2880;
const WORLD_HEIGHT = 640;
const GROUND_TOP = 560;
/** 掉出地图判定线（世界下界之外） */
const KILL_Y = 800;
/** 弹跳花的弹起速度 */
const FLOWER_BOUNCE = -1000;

const GOLD = 0xe6cf97;

export default class ForestScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private sfx!: Sfx;
  private vines: Vine[] = [];
  private flowers: Flower[] = [];
  private respawnPoints: RespawnPoint[] = [];
  private currentRespawn!: RespawnPoint;
  private lastFlower: Flower | null = null;

  private medicineVisual!: Phaser.GameObjects.Container;
  private medicineZone!: Phaser.GameObjects.Zone;
  private keyVisual!: Phaser.GameObjects.Container;
  private keyZone!: Phaser.GameObjects.Zone;
  private doorVisual!: Phaser.GameObjects.Container;
  private doorZone!: Phaser.GameObjects.Zone;
  private doorGlow!: Phaser.GameObjects.Ellipse;
  private hintText!: Phaser.GameObjects.Text;
  private hudKey!: Phaser.GameObjects.Container;
  private hudHerb!: Phaser.GameObjects.Container;

  private hasKey = false;
  private hasMedicine = false;
  private doorEntered = false;
  private restarting = false;
  private hintOverrideUntil = 0;

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

  preload(): void {
    const base = 'assets/character/';
    this.load.spritesheet('char-yuyu-idle', `${base}char-yuyu-idle-right-96x112-4f.png`, {
      frameWidth: 96,
      frameHeight: 112,
    });
    this.load.spritesheet('char-yuyu-run', `${base}char-yuyu-run-right-96x112-8f.png`, {
      frameWidth: 96,
      frameHeight: 112,
    });
    this.load.spritesheet('char-yuyu-jump', `${base}char-yuyu-jump-right-96x112-4f.png`, {
      frameWidth: 96,
      frameHeight: 112,
    });
    this.load.spritesheet('char-yuyu-fall', `${base}char-yuyu-fall-right-96x112-4f.png`, {
      frameWidth: 96,
      frameHeight: 112,
    });
    this.load.image('env-forest-bg', 'assets/environment/env-forest-no-slope-1920x1080.jpg');
  }

  create(): void {
    // 场景实例在重玩时会被复用，属性初始化器不会重新执行：
    // 所有玩法状态必须在这里重置（AGENTS.md 第 5 节），否则重玩卡死
    this.hasKey = false;
    this.hasMedicine = false;
    this.doorEntered = false;
    this.restarting = false;
    this.hintOverrideUntil = 0;
    this.lastFlower = null;
    this.vines = [];
    this.flowers = [];
    this.respawnPoints = [];

    this.cameras.main.setBackgroundColor('#17382b');
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT, true, true, false, false);

    // 背景由远及近：天空渐变 → 吉卜力森林背景（B 素材）→ 飘雾 → 远山两层 → 灌木 → 树
    this.buildSky();
    this.buildArtBackdrop();
    this.buildMist();
    this.buildBackground();
    this.buildBushes();
    this.buildTrees();
    this.buildVineBranch();
    this.buildTerrain();
    this.buildPlayer();
    this.buildFlowers();
    this.buildVines();
    this.buildRespawnPoints();
    this.buildItems();
    this.buildDoor();
    this.setupCamera();
    this.buildHud();
    this.buildItemHud();
    this.buildVignette();
    Effects.fireflies(this, WORLD_WIDTH, 16);

    this.cameras.main.fadeIn(250, 23, 56, 43);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__forestScene = this;
    }
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
    this.updateFlowerContact();
    this.updateVineGrabCheck();
    this.updateRespawns();
    this.updateHintZone();
    this.updateCameraLookahead(delta);
    this.checkFall();
  }

  /** 天空渐变：上亮下暗，压住画面底色 */
  private buildSky(): void {
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
    sky.fillGradientStyle(0x24503c, 0x24503c, 0x17382b, 0x17382b, 1);
    sky.fillRect(0, 0, 960, 540);
    sky.fillStyle(0x2d5a44, 0.3);
    sky.fillRect(0, 0, 960, 80);
  }

  /** B 的森林背景图作远景层：慢视差，垫在飘雾/远山之后（1920×1080 按 0.8 缩放） */
  private buildArtBackdrop(): void {
    this.add
      .image(-60, -170, 'env-forest-bg')
      .setOrigin(0, 0)
      .setScale(0.8)
      .setScrollFactor(0.22)
      .setDepth(-9);
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
    const spots = [420, 740, 2440, 2760];
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

  /** 藤蔓谷上方的横枝（纯视觉，藤蔓锚点挂在其上） */
  private buildVineBranch(): void {
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(16, 0x2a3b30, 1);
    g.beginPath();
    g.moveTo(820, 168);
    g.lineTo(980, 136);
    g.lineTo(1140, 118);
    g.lineTo(1300, 128);
    g.lineTo(1430, 158);
    g.strokePath();
    g.fillStyle(0x336049, 1);
    for (const x of [900, 1050, 1220, 1360]) {
      g.fillEllipse(x, 132, 90, 34);
    }
  }

  /**
   * 新动线：平地起手 → 两级平台 → 藤蔓谷（死亡区）→ 落脚台 →
   * 大花三朵（第三朵弹跳）→ 高台（药 + 钥匙）→ 落地到门。
   */
  private buildTerrain(): void {
    this.terrain = new Terrain(this);
    this.terrain.addPlatform({ x: 0, y: GROUND_TOP, width: 820, height: 80 });
    this.terrain.addPlatform({ x: 580, y: 480, width: 100, height: 24, kind: 'float' });
    this.terrain.addPlatform({ x: 750, y: 440, width: 110, height: 24, kind: 'float' });
    // 藤蔓谷 x 860–1400 之间为空（掉落死亡）
    this.terrain.addPlatform({ x: 1400, y: 470, width: 180, height: 24, kind: 'float' });
    this.terrain.addPlatform({ x: 1580, y: GROUND_TOP, width: 720, height: 80 });
    this.terrain.addPlatform({ x: 2100, y: 220, width: 230, height: 26, kind: 'float' });
    this.terrain.addPlatform({ x: 2300, y: GROUND_TOP, width: 580, height: 80 });
  }

  private buildFlowers(): void {
    this.flowers = [
      new Flower(this, 1680, GROUND_TOP, 500),
      new Flower(this, 1860, GROUND_TOP, 470),
      new Flower(this, 2040, GROUND_TOP, 500, true),
    ];
    this.physics.add.collider(
      this.player.view,
      this.flowers.map((f) => f.body),
    );
  }

  private buildPlayer(): void {
    this.sfx = new Sfx(this);
    this.player = new Player(this, { x: 120, y: 500, sfx: this.sfx });
    this.physics.add.collider(this.player.view, this.terrain.solids);
  }

  private buildVines(): void {
    this.vines = [
      new Vine(this, 980, 140, { length: 190 }),
      new Vine(this, 1200, 135, { length: 200 }),
    ];
  }

  private buildRespawnPoints(): void {
    const start = new RespawnPoint(this, 120, GROUND_TOP);
    start.activateNow(this);
    this.respawnPoints = [
      start,
      new RespawnPoint(this, 1490, 470), // 藤蔓谷对岸落脚台
    ];
    this.currentRespawn = start;
  }

  private buildItems(): void {
    // 药（叙事收集品，高台左侧）
    this.medicineVisual = this.add.container(2170, 185).setDepth(6);
    const herbGlow = this.add.ellipse(0, 0, 54, 54, GOLD, 0.16);
    const bottle = this.add
      .rectangle(0, 0, 16, 22, 0xf2efe4)
      .setStrokeStyle(2, 0x8a6d3b, 0.9);
    const liquid = this.add.rectangle(0, 4, 10, 12, GOLD);
    const neck = this.add.rectangle(0, -14, 6, 6, 0x8a6d3b);
    this.medicineVisual.add([herbGlow, bottle, liquid, neck]);
    this.tweens.add({
      targets: this.medicineVisual,
      y: 175,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.medicineZone = this.add.zone(2170, 185, 56, 64);
    this.physics.add.existing(this.medicineZone, true);
    this.physics.add.overlap(this.player.view, this.medicineZone, () => this.collectMedicine());

    // 钥匙（高台右侧）
    const keyX = 2290;
    const keyY = 185;
    this.keyVisual = this.add.container(keyX, keyY).setDepth(6);
    const glow = this.add.ellipse(0, 0, 64, 64, GOLD, 0.18);
    const keyGraphic = this.add.graphics();
    keyGraphic.lineStyle(4, GOLD, 1);
    keyGraphic.strokeCircle(0, -8, 7);
    keyGraphic.fillStyle(GOLD, 1);
    keyGraphic.fillRect(-2, -2, 4, 16);
    keyGraphic.fillRect(2, 8, 6, 4);
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
      y: keyY - 10,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.keyZone = this.add.zone(keyX, keyY, 64, 72);
    this.physics.add.existing(this.keyZone, true);
    this.physics.add.overlap(this.player.view, this.keyZone, () => this.collectKey());
  }

  private buildDoor(): void {
    this.doorVisual = this.add.container(2620, GROUND_TOP).setDepth(6).setVisible(false);
    this.doorGlow = this.add.ellipse(0, -58, 96, 136, GOLD, 0.12);
    const frame = this.add
      .rectangle(0, 0, 76, 116, 0x8a6d3b)
      .setOrigin(0.5, 1)
      .setStrokeStyle(3, 0x11251d, 0.8);
    const inner = this.add.rectangle(0, -6, 62, 104, 0x1c2f26).setOrigin(0.5, 1);
    this.doorVisual.add([this.doorGlow, frame, inner]);

    this.doorZone = this.add.zone(2620, GROUND_TOP - 60, 96, 120);
    this.physics.add.existing(this.doorZone, true);
    this.physics.add.overlap(this.player.view, this.doorZone, () => this.enterDoor());
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.startFollow(this.player.view, true, 0.12, 0.12);
    cam.setDeadzone(140, 90);
    // 上浮偏移：角色偏画面下方，多看上方地形
    cam.setFollowOffset(0, -24);
  }

  /** 镜头朝向前瞻：往面朝方向多看约 46px，平缓过渡 */
  private updateCameraLookahead(delta: number): void {
    const cam = this.cameras.main;
    const targetX = -this.player.facing * 46;
    cam.followOffset.x += (targetX - cam.followOffset.x) * Math.min(1, delta * 0.004);
  }

  private buildHud(): void {
    this.hintText = this.add
      .text(16, 14, '', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#d3ddd5',
        backgroundColor: 'rgba(0, 0, 0, 0.33)',
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** 右上角已获得物品图标（钥匙 / 药） */
  private buildItemHud(): void {
    this.hudHerb = this.add.container(904, 28).setScrollFactor(0).setDepth(100).setVisible(false);
    this.hudHerb.add([
      this.add.rectangle(0, 0, 10, 16, 0xf2efe4).setStrokeStyle(1.5, 0x8a6d3b, 0.9),
      this.add.rectangle(0, 3, 6, 8, GOLD),
      this.add.rectangle(0, -10, 5, 5, 0x8a6d3b),
    ]);

    this.hudKey = this.add.container(932, 28).setScrollFactor(0).setDepth(100).setVisible(false);
    const keyIcon = this.add.graphics();
    keyIcon.lineStyle(3, GOLD, 1);
    keyIcon.strokeCircle(-3, -4, 4);
    keyIcon.fillStyle(GOLD, 1);
    keyIcon.fillRect(-1, -1, 2, 9);
    keyIcon.fillRect(1, 4, 4, 2);
    this.hudKey.add([keyIcon]);
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
    this.hintText.setText(message).setColor('#e6cf97');
    this.hintOverrideUntil = this.time.now + 2600;
    this.time.delayedCall(2600, () => this.hintText.setColor('#d3ddd5'));
  }

  /** 按所在区域更新操作提示 */
  private updateHintZone(): void {
    if (this.time.now < this.hintOverrideUntil) {
      return;
    }
    const x = this.player.view.x;
    let message: string;
    if (this.hasKey) {
      message = '钥匙到手！跳下高台，去土地上找门';
    } else if (x < 860) {
      message = 'A/D 或 ←/→ 移动 · 空格跳跃（空中可再跳一次）';
    } else if (x < 1500) {
      message = '跳向藤蔓抓住 · A/D 摆荡 · W/S 爬 · 空格松手甩出';
    } else {
      message = '踩着大花前进 · 第三朵会把你弹得很高';
    }
    if (message !== this.hintText.text) {
      this.hintText.setText(message);
    }
  }

  /** 花面接触：只在刚落上那一拍触发压扁/弹跳 */
  private updateFlowerContact(): void {
    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    const feetY = this.player.view.y + 28;
    const onFlower = body.touching.down
      ? this.flowers.find(
          (f) => Math.abs(this.player.view.x - f.x) < 58 && Math.abs(feetY - f.top) < 16,
        ) ?? null
      : null;

    if (onFlower && onFlower !== this.lastFlower) {
      onFlower.squash(this);
      if (onFlower.bouncy) {
        body.setVelocityY(FLOWER_BOUNCE);
        this.sfx.bounce();
        Effects.dust(this, onFlower.x, onFlower.top, 8, 30);
      } else {
        Effects.dust(this, onFlower.x, onFlower.top, 4, 18);
      }
    }
    this.lastFlower = onFlower;
  }

  /** 空中靠近藤蔓握点自动抓住 */
  private updateVineGrabCheck(): void {
    if (this.player.attached) {
      return;
    }
    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    if (!body.enable || body.onFloor() || body.velocity.y <= -60) {
      return;
    }
    for (const vine of this.vines) {
      const distance = Phaser.Math.Distance.Between(
        this.player.view.x,
        this.player.view.y - 20,
        vine.handX,
        vine.handY,
      );
      if (vine.available && distance < 52) {
        this.player.attachVine(vine);
        break;
      }
    }
  }

  private updateRespawns(): void {
    for (const point of this.respawnPoints) {
      if (point.tryActivate(this, this.player.view.x, this.player.view.y)) {
        this.currentRespawn = point;
        this.sfx.checkpoint();
        this.showHint('重生点已点亮');
      }
    }
  }

  /** 掉出地图：回到已激活的重生点，钥匙等进度保留 */
  private checkFall(): void {
    if (this.restarting || this.player.view.y <= KILL_Y) {
      return;
    }
    this.restarting = true;
    this.sfx.fall();
    this.cameras.main.fade(280, 10, 20, 15);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const spawn = this.currentRespawn;
      this.player.teleportTo(spawn.x, spawn.y);
      this.cameras.main.centerOn(spawn.x, spawn.y - 60);
      this.cameras.main.fadeIn(280, 23, 56, 43);
      this.restarting = false;
    });
  }

  private collectMedicine(): void {
    if (this.hasMedicine) {
      return;
    }
    this.hasMedicine = true;
    this.sfx.collect();
    Effects.sparkBurst(this, this.medicineVisual.x, this.medicineVisual.y, 10);
    this.tweens.killTweensOf(this.medicineVisual);
    this.medicineVisual.destroy();
    this.medicineZone.destroy();
    this.revealHudIcon(this.hudHerb);
    this.showHint('拿到了药');
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
    this.revealHudIcon(this.hudKey);
    this.showHint('拿到了钥匙，下方出现了门');

    this.doorVisual.setVisible(true).setAlpha(0).setScale(0.6, 0.8);
    this.sfx.door();
    Effects.ring(this, 2620, GROUND_TOP - 58);
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

  private revealHudIcon(icon: Phaser.GameObjects.Container): void {
    icon.setVisible(true).setScale(0.1);
    this.tweens.add({
      targets: icon,
      scale: { from: 0.1, to: 1.2 },
      duration: 220,
      yoyo: true,
      hold: 60,
      ease: 'Quad.easeOut',
      onComplete: () => icon.setScale(1),
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
