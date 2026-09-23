import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { Effects } from '../gameplay/Effects';
import { Sfx } from '../systems/Sfx';
import { applyHDCamera, HD_SCALE } from '../systems/Resolution';
import { Vine } from '../gameplay/Vine';
import { Flower } from '../gameplay/Flower';

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
  private forestMusic?: Phaser.Sound.BaseSound;
  private forestMusicUnlock?: () => void;

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
    this.hasMedicine = false;
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

    // 背景由远及近：天空渐变 → 吉卜力森林背景（B 素材，铺满）→ 树
    this.buildSky();
    this.buildArtBackdrop();
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
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
    sky.fillGradientStyle(0x24503c, 0x24503c, 0x17382b, 0x17382b, 1);
    sky.fillRect(0, 0, 960, 540);
    sky.fillStyle(0x2d5a44, 0.3);
    sky.fillRect(0, 0, 960, 80);
  }

  /**
   * B 的森林背景图作远景主层：静止铺满视口。相机 zoom 2 下 scrollFactor 0 的层
   * 按"世界尺寸 1:1 投到渲染缓冲"（实测），故 scale 1 → 1920×1080 源像素 1:1 原生清晰。
   * （原雾/灌木视差层与 zoom 组合会错位，已移除；深度感由背景图与树/萤火虫承担。）
   */
  private buildArtBackdrop(): void {
    this.add
      .image(0, 0, 'env-forest-bg')
      .setOrigin(0, 0)
      .setScale(1.02)
      .setScrollFactor(0)
      .setDepth(-9);
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

  /** 藤蔓谷上方的横枝（纯视觉，贴近背景笔触、低对比；藤蔓锚点挂在其上） */
  private buildVineBranch(): void {
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
    this.player = new Player(this, { x: 120, y: 500, sfx: this.sfx });
    this.physics.add.collider(this.player.view, this.terrain.solids);
  }

  private buildVines(): void {
    this.vines = [
      new Vine(this, 980, 140, { length: 190 }),
      new Vine(this, 1200, 135, { length: 200 }),
    ];
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

  /** 镜头朝向前瞻：往面朝方向多看，平缓过渡；接近藤蔓谷时加大以提前暴露握点与对岸 */
  private updateCameraLookahead(delta: number): void {
    const cam = this.cameras.main;
    const nearPit = this.player.view.x > 640 && this.player.view.x < 1560;
    const reach = nearPit ? 92 : 46;
    const targetX = -this.player.facing * reach;
    cam.followOffset.x += (targetX - cam.followOffset.x) * Math.min(1, delta * 0.004);
  }

  /** HUD 层：scrollFactor 0 + 按 HD_SCALE 放大，抵消相机 zoom 对 HUD 造成的缩小 */
  private hudLayer!: Phaser.GameObjects.Container;

  private buildHud(): void {
    this.hudLayer = this.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(HD_SCALE);
    this.hintText = this.add.text(16, 14, '', {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      color: '#d3ddd5',
      backgroundColor: 'rgba(0, 0, 0, 0.33)',
      padding: { x: 10, y: 6 },
    });
    this.hudLayer.add(this.hintText);
  }

  /** 右上角已获得物品图标（钥匙 / 药） */
  private buildItemHud(): void {
    this.hudHerb = this.add.container(904, 28).setVisible(false);
    this.hudHerb.add([
      this.add.rectangle(0, 0, 10, 16, 0xf2efe4).setStrokeStyle(1.5, 0x8a6d3b, 0.9),
      this.add.rectangle(0, 3, 6, 8, GOLD),
      this.add.rectangle(0, -10, 5, 5, 0x8a6d3b),
    ]);

    this.hudKey = this.add.container(932, 28).setVisible(false);
    const keyIcon = this.add.graphics();
    keyIcon.lineStyle(3, GOLD, 1);
    keyIcon.strokeCircle(-3, -4, 4);
    keyIcon.fillStyle(GOLD, 1);
    keyIcon.fillRect(-1, -1, 2, 9);
    keyIcon.fillRect(1, 4, 4, 2);
    this.hudKey.add([keyIcon]);
    this.hudLayer.add([this.hudHerb, this.hudKey]);
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
