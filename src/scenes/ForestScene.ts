import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { Effects } from '../gameplay/Effects';
import { Sfx } from '../systems/Sfx';
import { applyHDCamera, bufferScaleOf, screenRefScaleOf } from '../systems/Resolution';
import { showForestLoadingUI } from '../ui/ForestLoadingUI';
import { Vine } from '../gameplay/Vine';
import { Flower } from '../gameplay/Flower';

const WORLD_WIDTH = 2880;
const WORLD_HEIGHT = 640;
const GROUND_TOP = 560;
/** 开场出生高台的顶面（花坡起点） */
const PLATEAU_TOP = 386;
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
  private lastFlower: Flower | null = null;

  private keyVisual!: Phaser.GameObjects.Container;
  private keyZone!: Phaser.GameObjects.Zone;
  private doorVisual!: Phaser.GameObjects.Container;
  private doorZone!: Phaser.GameObjects.Zone;
  private doorGlow!: Phaser.GameObjects.Ellipse;
  private hintText!: Phaser.GameObjects.Text;
  private hudKey!: Phaser.GameObjects.Container;
  private forestMusic?: Phaser.Sound.BaseSound;
  private forestMusicUnlock?: () => void;

  private hasKey = false;
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
    showForestLoadingUI(this);

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
    this.load.image('env-forest-bg', 'assets/environment/森林花海_原场景清晰化_无坡_1920x1080_v2.png');
    // 茉莉花森林套装（B 交付）
    this.load.image('env-jasmine-ground', 'assets/environment/env-jasmine-ground-platform-1640x220.png');
    this.load.image('env-jasmine-platform', 'assets/environment/env-jasmine-platform-512x144.png');
    this.load.image('env-jasmine-vine', 'assets/environment/env-jasmine-vine-128x512.png');
    this.load.image('env-jasmine-branch', 'assets/environment/env-jasmine-support-branch-1280x384.png');
    this.load.image('env-jasmine-door', 'assets/environment/env-manchurian-jasmine-door-256x384.png');
    this.load.image('item-golden-key', 'assets/environment/item-golden-jasmine-key-192x256.png');
    this.load.image('env-giant-jasmine-plant', 'assets/environment/env-giant-jasmine-plant-256x384.png');
    this.load.image('env-tree-watercolor', 'assets/environment/env-tree-watercolor-256x320.png');
    this.load.image('env-flower-slope', 'assets/environment/env-flower-slope-transparent-1920x1080.png');
    this.load.audio('sfx-footstep', 'assets/audio/sfx-footstep.m4a');
    this.load.audio('sfx-jump', 'assets/audio/sfx-jump.wav');
    this.load.audio('forest-bgm', 'assets/audio/forest-bgm.mp3');
  }

  /** 森林专属配乐：首次用户操作后解锁，离开森林时停止并清理。 */
  private startForestMusic(): void {
    this.stopForestMusic();
    this.forestMusic = this.sound.add('forest-bgm', { loop: true, volume: 0.35 });

    const start = () => {
      if (this.forestMusic && !this.forestMusic.isPlaying) {
        this.forestMusic.play();
      }
    };
    this.forestMusicUnlock = start;

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, start);
    } else {
      start();
    }
  }

  private stopForestMusic(): void {
    if (this.forestMusicUnlock) {
      this.sound.off(Phaser.Sound.Events.UNLOCKED, this.forestMusicUnlock);
      this.forestMusicUnlock = undefined;
    }
    if (this.forestMusic) {
      this.forestMusic.stop();
      this.forestMusic.destroy();
      this.forestMusic = undefined;
    }
  }

  create(): void {
    // 场景实例在重玩时会被复用，属性初始化器不会重新执行：
    // 所有玩法状态必须在这里重置（AGENTS.md 第 5 节），否则重玩卡死
    this.hasKey = false;
    this.doorEntered = false;
    this.restarting = false;
    this.hintOverrideUntil = 0;
    this.lastFlower = null;
    this.vines = [];
    this.flowers = [];

    this.startForestMusic();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.stopForestMusic, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.stopForestMusic, this);

    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#17382b');
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT, true, true, false, false);

    // 背景由远及近：天空渐变 → 吉卜力森林背景（B 素材，铺满）→ 深度雾 → 树
    this.buildSky();
    this.buildArtBackdrop();
    this.buildDepthFog();
    this.buildTrees();
    this.buildVineBranch();
    this.buildTerrain();
    this.buildPlayer();
    this.buildFlowers();
    this.buildVines();
    this.buildItems();
    this.buildDoor();
    this.setupCamera();
    this.buildHud();
    this.buildItemHud();
    this.buildVignette();
    this.registerScreenLayerSync();
    Effects.fireflies(this, WORLD_WIDTH, 16);

    this.cameras.main.fadeIn(250, 23, 56, 43);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__forestScene = this;
    }
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
    this.updateFlowerContact();
    this.updateVineAffordance(delta);
    this.updateVineGrabCheck();
    this.updateHintZone();
    this.updateCameraLookahead(delta);
    this.checkFall();
  }

  /** 天空渐变：上亮下暗，压住画面底色 */
  private buildSky(): void {
    this.sfSky = this.add.graphics().setScrollFactor(0).setDepth(-10);
    this.sfSky.fillGradientStyle(0x24503c, 0x24503c, 0x17382b, 0x17382b, 1);
    this.sfSky.fillRect(0, 0, 960, 540);
    this.sfSky.fillStyle(0x2d5a44, 0.3);
    this.sfSky.fillRect(0, 0, 960, 80);
  }

  /**
   * B 的森林背景图作远景主层：静止铺满视口。相机 zoom 2 下 scrollFactor 0 的层
   * 按"世界尺寸 1:1 投到渲染缓冲"（实测），故 scale 1 → 1920×1080 源像素 1:1 原生清晰。
   * （原雾/灌木视差层与 zoom 组合会错位，已移除；深度感由背景图与树/萤火虫承担。）
   */
  private buildArtBackdrop(): void {
    this.sfBackdrop = this.add
      .image(0, 0, 'env-forest-bg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-9)
      // 轻微降饱和压亮度，让花海退到“远景”，前景路线/角色成为主次（配合深度雾）
      .setTint(0xb9c6bc);
    this.sfBackdrop.setScale(1.02 * screenRefScaleOf(this));
  }

  /** 世界层装饰树（无碰撞，位于角色身后） */
  /** 世界层装饰树：B 的水彩树贴图（无碰撞，角色身后；无贴图时退回程序绘制） */
  private buildTrees(): void {
    if (this.textures.exists('env-tree-watercolor')) {
      const spots = [420, 740, 2440, 2760];
      spots.forEach((x, i) => {
        const scale = 0.5 + ((i * 37) % 20) / 100;
        this.add
          .image(x, GROUND_TOP + 8, 'env-tree-watercolor')
          .setOrigin(0.5, 1)
          .setScale(scale)
          .setDepth(-4)
          // 压暗降透明：树属于背景层，亮度和存在感不得与角色争（此前接近角色导致"贴图感"）
          .setTint(0xaebab0)
          .setAlpha(0.86);
      });
      return;
    }
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

  /**
   * 全屏轻暗角：按高清相机实际视口绘制（1920×1080，scrollFactor 0 层 1:1 投影），
   * 收敛视觉焦点。透明中心不遮画面，边缘最深处 alpha 0.26。
   */
  private buildVignette(): void {
    if (!this.textures.exists('screen-vignette')) {
      const texture = this.textures.createCanvas('screen-vignette', 1920, 1080);
      const ctx = texture?.getContext();
      if (texture && ctx) {
        const gradient = ctx.createRadialGradient(960, 540, 620, 960, 540, 1160);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1920, 1080);
        texture.refresh();
      }
    }
    this.sfVignette = this.add
      .image(960, 540, 'screen-vignette')
      .setScrollFactor(0)
      .setDepth(95)
      .setScale(screenRefScaleOf(this));
  }

  /**
   * 全屏 sf0 层随渲染缓冲重缩放：sf0 层世界单位 = 缓冲像素（zoom 不作用于它们），
   * 缓冲随窗口变化（main.ts syncRenderBuffer）时这些层必须跟着缩放，
   * 否则只盖住一角或溢出。场景关闭时解绑，防重玩叠加。
   */
  private registerScreenLayerSync(): void {
    const sync = () => {
      const zoom = bufferScaleOf(this);
      const ref = screenRefScaleOf(this);
      this.sfSky.setScale(zoom); // 内容 960×540 → 铺满缓冲
      this.sfFog.setScale(zoom); // 内容 960×540
      this.sfBackdrop.setScale(1.02 * ref); // 内容 1920×1080
      this.sfVignette.setScale(ref); // 内容 1920×1080
      this.hudLayer.setScale(zoom); // HUD 按 960 逻辑排布
    };
    sync();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.syncLayersHandler);
    this.syncLayersHandler = sync;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.syncLayersHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.syncLayersHandler) {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.syncLayersHandler);
      }
      this.syncLayersHandler = undefined;
    });
  }

  /**
   * 深度雾：把背景花海下半部压暗成远景，解决"背景像可行走地面"的混淆。
   * 关键：scrollFactor 0 的层世界单位 1:1 投进渲染缓冲（zoom 不作用于它），
   * 雾画布 960×540，必须 setScale(缓冲倍率) 铺满全屏，否则只盖住一角。
   */
  private buildDepthFog(): void {
    if (!this.textures.exists('depth-fog')) {
      const texture = this.textures.createCanvas('depth-fog', 960, 540);
      const ctx = texture?.getContext();
      if (texture && ctx) {
        const gradient = ctx.createLinearGradient(0, 200, 0, 540);
        gradient.addColorStop(0, 'rgba(10, 26, 19, 0)');
        gradient.addColorStop(0.5, 'rgba(10, 26, 19, 0.45)');
        gradient.addColorStop(1, 'rgba(10, 26, 19, 0.82)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 960, 540);
        texture.refresh();
      }
    }
    this.sfFog = this.add
      .image(480, 270, 'depth-fog')
      .setScrollFactor(0)
      .setDepth(-8)
      .setScale(bufferScaleOf(this));
  }

  /** 藤蔓谷上方的横枝：B 的茉莉花枝贴图（锚点挂在其上；无贴图时退回程序绘制） */
  private buildVineBranch(): void {
    if (this.textures.exists('env-jasmine-branch')) {
      this.add.image(790, 14, 'env-jasmine-branch').setOrigin(0, 0).setScale(0.52).setDepth(0);
      return;
    }
    const g = this.add.graphics().setDepth(0).setAlpha(0.9);
    g.lineStyle(10, 0x305040, 1);
    g.beginPath();
    g.moveTo(820, 168);
    g.lineTo(980, 136);
    g.lineTo(1140, 118);
    g.lineTo(1300, 128);
    g.lineTo(1430, 158);
    g.strokePath();
    g.fillStyle(0x2f5a44, 0.95);
    for (const x of [900, 1050, 1220, 1360]) {
      g.fillEllipse(x, 132, 90, 30);
    }
  }

  /**
   * 新动线：平地起手 → 两级平台 → 藤蔓谷（死亡区）→ 落脚台 →
   * 大花三朵（第三朵弹跳）→ 高台（药 + 钥匙）→ 落地到门。
   */
  private buildTerrain(): void {
    this.terrain = new Terrain(this);
    this.terrain.addPlatform({ x: 0, y: GROUND_TOP, width: 820, height: 80 });
    // 开场花坡：出生高台（顶 386）→ 沿花坡素材崖沿曲线下行到主地面。
    // 台阶按素材实测崖沿采样（每段 ≤13px），视觉用崖沿贴图而非直线草带
    const RIDGE: Array<[number, number]> = [
      [0, 323], [50, 334], [100, 336], [150, 341], [200, 342], [250, 357], [300, 363],
      [350, 363], [400, 380], [450, 397], [500, 413], [550, 430], [600, 455], [650, 486],
      [700, 515], [750, 544], [800, 573], [850, 598], [900, 616], [950, 641], [1000, 660],
      [1050, 687], [1100, 705], [1150, 719], [1200, 736], [1250, 737], [1300, 745],
      [1350, 750], [1400, 759],
    ];
    const SLOPE_X0 = 150;
    const SLOPE_SCALE = 0.4;
    const RIDGE_Y0 = 323;
    this.terrain.addPlatform({ x: 0, y: PLATEAU_TOP, width: SLOPE_X0, height: GROUND_TOP - PLATEAU_TOP + 80 });
    this.terrain.addStepSlope(
      RIDGE.map(([sx, sy]) => ({
        x: SLOPE_X0 + sx * SLOPE_SCALE,
        top: PLATEAU_TOP + (sy - RIDGE_Y0) * SLOPE_SCALE,
      })),
      GROUND_TOP + 80,
    );
    if (this.textures.exists('env-flower-slope')) {
      this.add
        .image(SLOPE_X0, PLATEAU_TOP - RIDGE_Y0 * SLOPE_SCALE, 'env-flower-slope')
        .setOrigin(0, 0)
        .setScale(SLOPE_SCALE)
        .setDepth(0);
    }
    this.terrain.addPlatform({ x: 580, y: 480, width: 100, height: 24, kind: 'float' });
    this.terrain.addPlatform({ x: 750, y: 440, width: 110, height: 24, kind: 'float' });
    // 第一根藤蔓下的练习落脚台：抓取失误不致死，可跳回左侧重试
    this.terrain.addPlatform({ x: 905, y: 505, width: 100, height: 20, kind: 'float' });
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
    this.player = new Player(this, { x: 75, y: PLATEAU_TOP - 30, sfx: this.sfx });
    this.physics.add.collider(this.player.view, this.terrain.solids);
  }

  private buildVines(): void {
    this.vines = [
      new Vine(this, 980, 140, { length: 190 }),
      new Vine(this, 1200, 135, { length: 200 }),
    ];
  }

  private buildItems(): void {
    // 钥匙（高台右侧）：放大一档、缓慢摇曳，像挂在风里的信物
    const keyX = 2290;
    const keyY = 185;
    this.keyVisual = this.add.container(keyX, keyY).setDepth(6);
    const glow = this.add.ellipse(0, 0, 78, 78, GOLD, 0.2);
    const keyDisplay: Phaser.GameObjects.GameObject = this.textures.exists('item-golden-key')
      ? this.add.image(0, 0, 'item-golden-key').setScale(0.36)
      : (() => {
          const keyGraphic = this.add.graphics();
          keyGraphic.lineStyle(4, GOLD, 1);
          keyGraphic.strokeCircle(0, -8, 7);
          keyGraphic.fillStyle(GOLD, 1);
          keyGraphic.fillRect(-2, -2, 4, 16);
          keyGraphic.fillRect(2, 8, 6, 4);
          return keyGraphic;
        })();
    const orbit = this.add.container(0, 0);
    orbit.add([
      this.add.circle(18, 0, 2.5, 0xf6e7b8, 0.9),
      this.add.circle(-18, 0, 2, 0xf6e7b8, 0.7),
    ]);
    this.keyVisual.add([glow, keyDisplay, orbit]);
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
    this.tweens.add({
      targets: this.keyVisual,
      angle: { from: -7, to: 7 },
      duration: 1700,
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
    const doorPanel: Phaser.GameObjects.GameObject = this.textures.exists('env-jasmine-door')
      ? this.add.image(0, 4, 'env-jasmine-door').setOrigin(0.5, 1).setScale(0.32)
      : this.add
          .rectangle(0, 0, 76, 116, 0x8a6d3b)
          .setOrigin(0.5, 1)
          .setStrokeStyle(3, 0x11251d, 0.8);
    const inner = this.textures.exists('env-jasmine-door')
      ? null
      : this.add.rectangle(0, -6, 62, 104, 0x1c2f26).setOrigin(0.5, 1);
    this.doorVisual.add(
      inner ? [this.doorGlow, doorPanel, inner] : [this.doorGlow, doorPanel],
    );

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

  /** 镜头朝向前瞻：往面朝方向多看，平缓过渡；接近藤蔓谷时加大以提前暴露握点与对岸 */
  private updateCameraLookahead(delta: number): void {
    const cam = this.cameras.main;
    const nearPit = this.player.view.x > 640 && this.player.view.x < 1560;
    const reach = nearPit ? 92 : 46;
    const targetX = -this.player.facing * reach;
    cam.followOffset.x += (targetX - cam.followOffset.x) * Math.min(1, delta * 0.004);
  }

  /** HUD 层：scrollFactor 0 + 按缓冲倍率放大，抵消相机 zoom 对 HUD 造成的缩小 */
  private hudLayer!: Phaser.GameObjects.Container;
  /** 全屏 sf0 层（天空/背景/雾/暗角）：渲染缓冲随窗口变化时统一重缩放 */
  private sfSky!: Phaser.GameObjects.Graphics;
  private sfBackdrop!: Phaser.GameObjects.Image;
  private sfFog!: Phaser.GameObjects.Image;
  private sfVignette!: Phaser.GameObjects.Image;
  private syncLayersHandler?: () => void;

  private buildHud(): void {
    this.hudLayer = this.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(bufferScaleOf(this));
    this.hintText = this.add.text(16, 14, '', {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      color: '#f4f9f2',
      // 深色底牌保证任何背景上可读；按键统一「」键帽写法
      backgroundColor: 'rgba(9, 20, 15, 0.8)',
      padding: { x: 10, y: 6 },
    });
    this.hudLayer.add(this.hintText);
  }

  /** 右上角已获得物品图标（钥匙） */
  private buildItemHud(): void {
    this.hudKey = this.add.container(920, 28).setVisible(false);
    const keyIcon = this.add.graphics();
    keyIcon.lineStyle(3, GOLD, 1);
    keyIcon.strokeCircle(-3, -4, 4);
    keyIcon.fillStyle(GOLD, 1);
    keyIcon.fillRect(-1, -1, 2, 9);
    keyIcon.fillRect(1, 4, 4, 2);
    this.hudKey.add([keyIcon]);
    this.hudLayer.add(this.hudKey);
  }

  private showHint(message: string): void {
    this.hintText.setText(message).setColor('#ffe9a8').setAlpha(1);
    this.hintOverrideUntil = this.time.now + 2600;
    this.time.delayedCall(2600, () => {
      this.hintText.setColor('#f4f9f2');
      this.hideHintSoon();
    });
  }

  /** 提示短暂停留后淡出，避免长文字一直盖住画面 */
  private hideHintSoon(delayMs = 1400): void {
    this.time.delayedCall(delayMs, () => {
      if (this.time.now >= this.hintOverrideUntil) {
        this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
      }
    });
  }

  /** 按所在区域更新操作提示（短句）：只在进入新区域时出现，随后自动隐藏 */
  private updateHintZone(): void {
    if (this.time.now < this.hintOverrideUntil) {
      return;
    }
    const x = this.player.view.x;
    let message: string;
    if (this.hasKey) {
      message = '跳下高台 · 找花门离开';
    } else if (x < 860) {
      message = '「A / D」移动　「空格」跳（空中可再跳）';
    } else if (x < 1500) {
      message = '抓住花环　「A / D」摆荡　「空格」甩出';
    } else {
      message = '踩大花前进 · 第三朵会高弹';
    }
    if (message !== this.hintText.text) {
      this.hintText.setText(message).setColor('#f4f9f2');
      this.tweens.killTweensOf(this.hintText);
      this.hintText.setAlpha(1);
      this.hideHintSoon(4000);
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
        // 关键瞬间光：弹起时一圈淡粉光环（有来源的动态光，见 AGENTS.md 光影约定）
        Effects.ring(this, onFlower.x, onFlower.top, 0xf3c2d8);
      }
      // 白色尘土已按要求移除（静态花无反应，弹跳花只留光环）
    }
    this.lastFlower = onFlower;
  }

  /** 未抓住的藤蔓：接近预告（亮起+轻摆）与待机回落 */
  private updateVineAffordance(delta: number): void {
    for (const vine of this.vines) {
      if (this.player.attached === vine) {
        vine.setNear(false);
        continue;
      }
      vine.idleUpdate(delta);
      const distance = Phaser.Math.Distance.Between(
        this.player.view.x,
        this.player.view.y - 20,
        vine.handX,
        vine.handY,
      );
      vine.setNear(distance < 140);
    }
  }

  /** 空中靠近藤蔓握点自动抓住：上升近距离也可抓（40px），下落范围稍宽（52px） */
  private updateVineGrabCheck(): void {
    if (this.player.attached) {
      return;
    }
    const body = this.player.view.body as Phaser.Physics.Arcade.Body;
    if (!body.enable || body.onFloor()) {
      return;
    }
    const range = body.velocity.y < 0 ? 40 : 52;
    for (const vine of this.vines) {
      const distance = Phaser.Math.Distance.Between(
        this.player.view.x,
        this.player.view.y - 20,
        vine.handX,
        vine.handY,
      );
      if (vine.available && distance < range) {
        this.player.attachVine(vine);
        break;
      }
    }
  }

  /** 掉出地图：整关完全重置（2026-09-22 决定，钥匙/药/门等全部回到初始） */
  private checkFall(): void {
    if (this.restarting || this.player.view.y <= KILL_Y) {
      return;
    }
    this.restarting = true;
    this.sfx.fall();
    this.cameras.main.fade(280, 10, 20, 15);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
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

    // 门出现：从地里“长”出来——下移 16px 起步、Back 回弹归位，基座扬尘 + 光环
    this.doorVisual.setVisible(true).setAlpha(0).setScale(0.6, 0.8).setY(GROUND_TOP + 16);
    this.sfx.door();
    Effects.ring(this, 2620, GROUND_TOP - 58);
    Effects.dust(this, 2620, GROUND_TOP - 6, 10, 26);
    this.tweens.add({
      targets: this.doorVisual,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: GROUND_TOP,
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
