import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Sfx } from '../systems/Sfx';
import { Effects } from '../gameplay/Effects';
import { applyHDCamera, HD_SCALE } from '../systems/Resolution';
import {
  showCalendarText,
  showPhotoMemoryText,
  showFlowerpotText,
  showFishBasinText,
  showOtherRoomText,
} from '../ui/RoomInteractionCopy';
import photoFrameUrl from '../../assets/environment/interactive-family-zoo-photo-frame-384x256.png?url';

const ROOM_WIDTH = 960;
const ROOM_HEIGHT = 540;
/** 前景地板面（角色脚底所在线） */
const FLOOR_TOP = 492;

const GOLD = 0xe6cf97;
const PANEL_BG = 0x101b16;

type ObjectKind = 'clock' | 'radio' | 'photo' | 'calendar' | 'pot' | 'fish';

interface RoomObjectDef {
  kind: ObjectKind;
  texture: string;
  x: number;
  y: number;
  scale: number;
  depth: number;
  /** 点击后角色走到的位置 */
  standX: number;
}

const OBJECT_DEFS: RoomObjectDef[] = [
  { kind: 'clock', texture: 'room-clock', x: 340, y: 225, scale: 0.4, depth: 1, standX: 340 },
  { kind: 'radio', texture: 'room-radio', x: 490, y: 335, scale: 0.42, depth: 1, standX: 490 },
  { kind: 'photo', texture: 'room-photo', x: 640, y: 300, scale: 0.4, depth: 1, standX: 640 },
  { kind: 'calendar', texture: 'room-calendar', x: 835, y: 320, scale: 0.38, depth: 1, standX: 835 },
  { kind: 'pot', texture: 'room-pot', x: 215, y: 425, scale: 0.4, depth: 8, standX: 320 },
  { kind: 'fish', texture: 'room-fish', x: 825, y: 480, scale: 0.5, depth: 8, standX: 690 },
];

/** 碎片图标形状（HUD 右上） */
const FRAGMENT_KINDS: Array<'photo' | 'radio' | 'clock'> = ['photo', 'radio', 'clock'];

export default class RoomScene extends Phaser.Scene {
  private player!: Player;
  private sfx!: Sfx;
  private hintText!: Phaser.GameObjects.Text;
  private hudLayer!: Phaser.GameObjects.Container;
  private fragmentIcons = new Map<string, Phaser.GameObjects.Container>();
  private fragments = new Set<string>();
  private memoryOrb: Phaser.GameObjects.Container | null = null;
  private orbTouched = false;
  /** 有面板（拼图/收音机/时钟/文字）打开时锁定其它交互 */
  private interacting = false;
  private panel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({
      key: 'room',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 1400 }, debug: false },
      },
    });
  }

  preload(): void {
    const images: Array<[string, string]> = [
      ['room-bg', 'assets/environment/env-memory-room-empty-1920x1080.png'],
      ['room-clock', 'assets/environment/interactive-pendulum-wall-clock-256x512.png'],
      ['room-radio', 'assets/environment/interactive-vintage-radio-384x256.png'],
      ['room-calendar', 'assets/environment/interactive-calendar-2008-lichun-256x384.png'],
      ['room-pot', 'assets/environment/interactive-potted-jasmine-384x512.png'],
      ['room-fish', 'assets/environment/interactive-stone-fish-basin-768x384.png'],
      ['room-photo', 'assets/environment/interactive-family-zoo-photo-frame-384x256.png'],
    ];
    for (const [key, url] of images) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    }
    if (!this.textures.exists('char-yuyu-idle')) {
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
    }
  }

  create(): void {
    // 场景复用：状态全部重置（AGENTS.md 第 5 节）
    this.fragments.clear();
    this.fragmentIcons.clear();
    this.memoryOrb = null;
    this.orbTouched = false;
    this.interacting = false;
    this.panel?.destroy();
    this.panel = null;

    applyHDCamera(this);
    this.physics.world.setBounds(0, 0, ROOM_WIDTH, ROOM_HEIGHT, true, true, false, false);

    // 空房间背景铺满（1920×1080 源 0.5 缩放，高清缓冲下 1:1 源像素）
    this.add.image(0, 0, 'room-bg').setOrigin(0, 0).setScale(0.5).setDepth(0);

    // 地板碰撞体（隐藏，画面由背景承担）
    const floor = this.add.rectangle(480, FLOOR_TOP + 24, ROOM_WIDTH, 48, 0xffffff, 0).setVisible(false);
    this.physics.add.existing(floor, true);

    this.sfx = new Sfx(this);
    this.player = new Player(this, { x: 90, y: FLOOR_TOP - 30, speed: 200, sfx: this.sfx });
    this.physics.add.collider(this.player.view, floor);

    this.buildObjects();
    this.buildHud();

    this.cameras.main.fadeIn(250, 20, 18, 26);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__roomScene = this;
    }
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
    this.checkMemoryOrbTouch();
  }

  /** 六个可点击物件：悬停提示 + 点击自动走近后交互 */
  private buildObjects(): void {
    for (const def of OBJECT_DEFS) {
      const img = this.add
        .image(def.x, def.y, def.texture)
        .setScale(def.scale)
        .setDepth(def.depth);
      img.setInteractive({ useHandCursor: true });
      img.on('pointerover', () => {
        if (!this.interacting) {
          img.setScale(def.scale * 1.05);
        }
      });
      img.on('pointerout', () => img.setScale(def.scale));
      img.on('pointerdown', () => this.onObjectClicked(def));
    }
  }

  private onObjectClicked(def: RoomObjectDef): void {
    if (this.interacting || this.orbTouched) {
      return;
    }
    const near = Math.abs(this.player.view.x - def.standX) < 130;
    if (near) {
      this.openObject(def.kind);
    } else {
      this.player.cancelAutoWalk();
      this.player.autoWalkTo(def.standX, () => this.openObject(def.kind));
    }
  }

  private openObject(kind: ObjectKind): void {
    switch (kind) {
      case 'calendar':
        this.openDomPanel(() => showCalendarText(this));
        break;
      case 'pot':
        this.openDomPanel(() => showFlowerpotText(this));
        break;
      case 'fish':
        this.playFishSwim();
        this.openDomPanel(() => showFishBasinText(this));
        break;
      case 'photo':
        if (this.fragments.has('photo')) {
          this.openDomPanel(() => showPhotoMemoryText(this, photoFrameUrl));
        } else {
          this.openPuzzle();
        }
        break;
      case 'radio':
        if (this.fragments.has('radio')) {
          this.openDomPanel(() =>
            showOtherRoomText(this, {
              title: '外公的收音机',
              entries: [{ text: '“鱼鱼，要健健康康地长大哦。”' }],
            }),
          );
        } else {
          this.openRadio();
        }
        break;
      case 'clock':
        if (this.fragments.has('clock')) {
          this.openDomPanel(() =>
            showOtherRoomText(this, {
              title: '老挂钟',
              entries: [{ text: '指针停在 4:15——接她放学的时间。' }],
            }),
          );
        } else {
          this.openClock();
        }
        break;
    }
  }

  /** DOM 文字面板（D 的组件）：打开时冻结角色，面板关闭（场景 resume）后解锁 */
  private openDomPanel(open: () => { close: () => void }): void {
    this.interacting = true;
    this.player.cancelAutoWalk();
    this.player.freeze();
    open();
    this.events.once(Phaser.Scenes.Events.RESUME, () => {
      this.interacting = false;
      this.player.unfreeze();
    });
  }

  /** 鱼缸反馈：几尾小鱼游过一次 */
  private playFishSwim(): void {
    for (let i = 0; i < 3; i++) {
      const fish = this.add
        .ellipse(900 + i * 30, 462 + (i % 2) * 14, 16, 7, 0xd8e8d0, 0.85)
        .setDepth(9);
      this.tweens.add({
        targets: fish,
        x: 720 - i * 20,
        duration: 1600 + i * 300,
        delay: i * 160,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => fish.destroy(),
      });
    }
  }

  // ---------- 照片 4×4 滑块拼图 ----------

  private openPuzzle(): void {
    this.interacting = true;
    this.player.freeze();
    const layer = this.add.container(0, 0).setDepth(200);
    this.panel = layer;

    const dim = this.add.rectangle(480, 270, ROOM_WIDTH, ROOM_HEIGHT, 0x060e0a, 0.78).setInteractive();
    layer.add(dim);
    layer.add(this.panelTitle(480, 66, '把照片拼回原样'));
    this.addCloseButton(layer, 916, 40);

    const srcW = 96;
    const srcH = 64;
    const cellW = 144;
    const cellH = 96;
    const boardX = 480 - (cellW * 4) / 2;
    const boardY = 96;

    // cells[pos] = 该格子的图块编号（15 = 空格）；从完成态做随机空移保证可解
    const cells = Array.from({ length: 16 }, (_, i) => i);
    let blank = 15;
    for (let i = 0; i < 260; i++) {
      const options = this.adjacentPositions(blank);
      const pick = options[Math.floor(Math.random() * options.length)];
      cells[blank] = cells[pick];
      cells[pick] = 15;
      blank = pick;
    }
    if (cells.every((t, i) => t === i)) {
      // 极小概率打乱回原状：再移一步
      const options = this.adjacentPositions(blank);
      const pick = options[0];
      cells[blank] = cells[pick];
      cells[pick] = 15;
    }

    const tileImages = new Map<number, Phaser.GameObjects.Image>();
    const posOf = (index: number) => ({ c: index % 4, r: Math.floor(index / 4) });
    const gridXY = (index: number) => {
      const { c, r } = posOf(index);
      return { x: boardX + c * cellW + cellW / 2, y: boardY + r * cellH + cellH / 2 };
    };

    for (let pos = 0; pos < 16; pos++) {
      const tile = cells[pos];
      if (tile === 15) {
        continue;
      }
      const { c, r } = posOf(tile);
      const img = this.add
        .image(0, 0, 'room-photo')
        .setCrop(c * srcW, r * srcH, srcW, srcH)
        .setScale(1.5)
        .setInteractive({ useHandCursor: true });
      const { x, y } = gridXY(pos);
      img.setPosition(x, y);
      layer.add(img);
      tileImages.set(tile, img);
      img.on('pointerdown', () => {
        const at = cells.indexOf(tile);
        if (this.adjacentPositions(blank).includes(at)) {
          cells[blank] = tile;
          cells[at] = 15;
          blank = at;
          const target = gridXY(blank);
          this.tweens.add({
            targets: img,
            x: target.x,
            y: target.y,
            duration: 110,
            ease: 'Quad.easeOut',
          });
          this.sfx.step();
          if (cells.every((t, i) => t === i)) {
            this.time.delayedCall(160, () => this.onPuzzleSolved(layer));
          }
        }
      });
    }
  }

  private onPuzzleSolved(layer: Phaser.GameObjects.Container): void {
    this.closePanel();
    this.cameras.main.flash(140, 230, 207, 151);
    this.gainFragment('photo');
    this.openDomPanel(() => showPhotoMemoryText(this, photoFrameUrl));
  }

  private adjacentPositions(pos: number): number[] {
    const { c, r } = { c: pos % 4, r: Math.floor(pos / 4) };
    const list: number[] = [];
    if (c > 0) list.push(pos - 1);
    if (c < 3) list.push(pos + 1);
    if (r > 0) list.push(pos - 4);
    if (r < 3) list.push(pos + 4);
    return list;
  }

  // ---------- 收音机调频 ----------

  private openRadio(): void {
    this.interacting = true;
    this.player.freeze();
    this.pauseRoomBgm(true);

    const layer = this.add.container(0, 0).setDepth(200);
    this.panel = layer;
    const dim = this.add.rectangle(480, 270, ROOM_WIDTH, ROOM_HEIGHT, 0x060e0a, 0.78).setInteractive();
    layer.add(dim);
    layer.add(this.panelTitle(480, 80, '旋转旋钮，调一个频道'));
    this.addCloseButton(layer, 916, 40);

    const radioImg = this.add.image(480, 250, 'room-radio').setScale(1.1);
    layer.add(radioImg);
    const channelText = this.add
      .text(480, 360, '咔。', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#f4f9f2',
      })
      .setOrigin(0.5);
    layer.add(channelText);
    const knob = this.add
      .circle(480, 425, 34, 0x8a6d3b, 1)
      .setStrokeStyle(3, GOLD, 1)
      .setInteractive({ useHandCursor: true });
    const knobText = this.add
      .text(480, 425, '旋钮', { fontFamily: 'sans-serif', fontSize: '14px', color: '#101b16' })
      .setOrigin(0.5);
    layer.add([knob, knobText]);

    let channel = 0;
    knob.on('pointerdown', () => {
      channel = (channel % 4) + 1;
      this.tweens.add({ targets: knob, angle: knob.angle + 90, duration: 160 });
      switch (channel) {
        case 1:
          this.sfx.radioStatic();
          channelText.setText('……沙沙的杂音。');
          break;
        case 2:
          this.sfx.radioWind();
          channelText.setText('……呼呼的风声。');
          break;
        case 3:
          this.sfx.radioLullaby();
          channelText.setText('……一段哼唱的童谣。');
          break;
        case 4:
          this.sfx.radioVoice();
          channelText.setText('“鱼鱼，要健健康康地长大哦。”');
          this.time.delayedCall(900, () => {
            this.closePanel();
            this.gainFragment('radio');
          });
          break;
      }
    });
  }

  // ---------- 挂钟调时 ----------

  private openClock(): void {
    this.interacting = true;
    this.player.freeze();
    const layer = this.add.container(0, 0).setDepth(200);
    this.panel = layer;
    const dim = this.add.rectangle(480, 270, ROOM_WIDTH, ROOM_HEIGHT, 0x060e0a, 0.78).setInteractive();
    layer.add(dim);
    layer.add(this.panelTitle(480, 62, '把指针调到接她放学的时间'));
    this.addCloseButton(layer, 916, 40);

    let hour = 12;
    let minute = 0;
    const face = this.add.graphics();
    const cx = 480;
    const cy = 260;
    const redraw = () => {
      face.clear();
      face.fillStyle(0xf0e8d4, 1);
      face.fillCircle(cx, cy, 110);
      face.lineStyle(4, 0x2b2b2b, 1);
      face.strokeCircle(cx, cy, 110);
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        face.fillStyle(0x2b2b2b, 1);
        face.fillCircle(cx + Math.sin(a) * 96, cy - Math.cos(a) * 96, i % 3 === 0 ? 5 : 3);
      }
      const hourAngle = (Math.PI * 2 * (hour % 12)) / 12 + (Math.PI * 2 * minute) / 720;
      const minuteAngle = (Math.PI * 2 * minute) / 60;
      face.lineStyle(7, 0x2b2b2b, 1);
      face.lineBetween(cx, cy, cx + Math.sin(hourAngle) * 55, cy - Math.cos(hourAngle) * 55);
      face.lineStyle(4, 0x8a6d3b, 1);
      face.lineBetween(cx, cy, cx + Math.sin(minuteAngle) * 88, cy - Math.cos(minuteAngle) * 88);
      face.fillStyle(0x2b2b2b, 1);
      face.fillCircle(cx, cy, 6);
    };
    redraw();
    layer.add(face);

    const label = this.add
      .text(480, 402, '12:00', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#ffe9a8',
        backgroundColor: 'rgba(6, 14, 10, 0.62)',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5);
    layer.add(label);
    const sync = () => {
      label.setText(`${hour}:${minute.toString().padStart(2, '0')}`);
      redraw();
    };

    const mkBtn = (x: number, y: number, text: string, onClick: () => void) => {
      const btn = this.add
        .text(x, y, text, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#101b16',
          backgroundColor: '#cbb98a',
          padding: { x: 14, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', onClick);
      layer.add(btn);
    };
    mkBtn(360, 452, '时 −', () => {
      hour = hour === 1 ? 12 : hour - 1;
      sync();
    });
    mkBtn(440, 452, '时 +', () => {
      hour = hour === 12 ? 1 : hour + 1;
      sync();
    });
    mkBtn(520, 452, '分 +15', () => {
      minute = (minute + 15) % 60;
      sync();
    });
    mkBtn(600, 452, '分 −15', () => {
      minute = (minute + 45) % 60;
      sync();
    });
    mkBtn(700, 452, '确认', () => {
      if (hour === 4 && minute === 15) {
        this.closePanel();
        this.cameras.main.flash(140, 230, 207, 151);
        this.gainFragment('clock');
      } else {
        this.tweens.add({ targets: face, x: face.x + 8, duration: 50, yoyo: true, repeat: 3 });
        this.showHint('指针似乎不对……日历里也许有线索');
      }
    });
  }

  // ---------- 碎片 / 记忆球 / 结尾 ----------

  private gainFragment(kind: 'photo' | 'radio' | 'clock'): void {
    if (this.fragments.has(kind)) {
      return;
    }
    this.fragments.add(kind);
    this.sfx.collect();
    const icon = this.fragmentIcons.get(kind);
    if (icon) {
      icon.setVisible(true).setScale(0.1);
      this.tweens.add({
        targets: icon,
        scale: { from: 0.1, to: 1.25 },
        duration: 220,
        yoyo: true,
        hold: 60,
        onComplete: () => icon.setScale(1),
      });
    }
    if (this.fragments.size >= 3) {
      this.spawnMemoryOrb();
    } else {
      this.showHint(`记忆碎片 ${this.fragments.size}/3`);
    }
  }

  private spawnMemoryOrb(): void {
    this.memoryOrb = this.add.container(480, 240).setDepth(6);
    const glow = this.add.ellipse(0, 0, 110, 110, GOLD, 0.2);
    const core = this.add.circle(0, 0, 26, GOLD).setStrokeStyle(3, 0xf6e7b8, 0.9);
    this.memoryOrb.add([glow, core]);
    this.tweens.add({
      targets: this.memoryOrb,
      y: 226,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.12, to: 0.32 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    Effects.ring(this, 480, 240);
    this.sfx.door();
    this.showHint('三块碎片融成了记忆球——走过去触碰它');
  }

  private checkMemoryOrbTouch(): void {
    if (!this.memoryOrb || this.orbTouched || this.interacting) {
      return;
    }
    if (
      Math.abs(this.player.view.x - 480) < 52 &&
      Math.abs(this.player.view.y - 240) < 130
    ) {
      this.orbTouched = true;
      this.player.freeze();
      this.sfx.enter();
      this.tweens.add({
        targets: this.memoryOrb,
        scale: 2.2,
        alpha: 0,
        duration: 520,
        ease: 'Quad.easeOut',
      });
      this.cameras.main.fade(520, 23, 45, 35);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ending'));
    }
  }

  // ---------- HUD / 面板公共件 ----------

  private buildHud(): void {
    this.hudLayer = this.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(HD_SCALE);
    this.hintText = this.add.text(16, 14, 'A/D 走动 · 点击房间里的物件', {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      color: '#f4f9f2',
      backgroundColor: 'rgba(6, 14, 10, 0.62)',
      padding: { x: 10, y: 6 },
    });
    this.hudLayer.add(this.hintText);

    FRAGMENT_KINDS.forEach((kind, i) => {
      const icon = this.add.container(838 + i * 44, 28).setVisible(false);
      if (kind === 'photo') {
        icon.add(this.add.rectangle(0, 0, 18, 14, GOLD).setStrokeStyle(2, 0x8a6d3b, 0.9));
      } else if (kind === 'radio') {
        icon.add(this.add.circle(0, 0, 9, GOLD).setStrokeStyle(2, 0x8a6d3b, 0.9));
      } else {
        icon.add(
          this.add.polygon(0, 0, [
            { x: 0, y: -10 },
            { x: 9, y: 0 },
            { x: 0, y: 10 },
            { x: -9, y: 0 },
          ], GOLD).setStrokeStyle(2, 0x8a6d3b, 0.9),
        );
      }
      this.fragmentIcons.set(kind, icon);
      this.hudLayer.add(icon);
    });
  }

  private showHint(message: string): void {
    this.hintText.setText(message).setColor('#ffe9a8');
    this.time.delayedCall(2600, () => {
      this.hintText.setText('A/D 走动 · 点击房间里的物件').setColor('#f4f9f2');
    });
  }

  private panelTitle(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5);
  }

  private addCloseButton(layer: Phaser.GameObjects.Container, x: number, y: number): void {
    const btn = this.add
      .text(x, y, '× 关闭', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#f4f9f2',
        backgroundColor: 'rgba(6, 14, 10, 0.62)',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.closePanel());
    layer.add(btn);
  }

  private closePanel(): void {
    this.panel?.destroy();
    this.panel = null;
    this.interacting = false;
    this.player.unfreeze();
    this.pauseRoomBgm(false);
  }

  /** 收音机播放期间暂停房间 BGM（menu-room-bgm 由 main.ts 在 CREATE 时播放） */
  private pauseRoomBgm(pause: boolean): void {
    const manager = this.sound as unknown as {
      sounds?: Array<Phaser.Sound.WebAudioSound>;
    };
    const music = manager.sounds?.find((s) => s.key === 'music-menu-room');
    if (!music) {
      return;
    }
    if (pause && music.isPlaying) {
      music.pause();
    } else if (!pause && music.isPaused) {
      music.resume();
    }
  }
}
