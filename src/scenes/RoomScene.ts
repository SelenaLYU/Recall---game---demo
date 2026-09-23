import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';
import { Effects } from '../gameplay/Effects';
import { applyHDCamera, bufferScaleOf } from '../systems/Resolution';
import { showClockPuzzleUI } from '../ui/ClockPuzzleUI';
import { createFragmentHud, type FragmentHudHandle } from '../ui/FragmentHud';
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

const GOLD = 0xe6cf97;
/** 物件整体微降的暖色调：向水彩背景的环境色靠拢，削弱“另一张贴图层”的感觉 */
const OBJECT_TINT = 0xf2ecdf;

type ObjectKind = 'clock' | 'radio' | 'photo' | 'calendar' | 'pot' | 'fish';

interface RoomObjectDef {
  kind: ObjectKind;
  texture: string;
  /** center=按可见中心挂墙；bottom=按可见底部贴桌面/地面 */
  anchor: 'center' | 'bottom';
  /** 锚点世界坐标（center：可见中心；bottom：可见底部接地点） */
  x: number;
  y: number;
  /** 期望可见高/宽（px，按美术交互预览图 1:2 换算） */
  targetH?: number;
  targetW?: number;
  depth: number;
  /** 地面接触阴影（仅落地的大件；桌面小件靠背景自带的家具明暗） */
  shadow?: boolean;
}

/** 摆位换算自 assets/environment/env-memory-room-interactive-preview-1920x1080.png（坐标 ÷2）：
 * 挂钟挂后墙书架右侧，收音机在中央方桌桌心，相框在右侧柜面左端，日历立在右前方案几，
 * 花盆/石槽分别落在左右前景花丛里（接地）。 */
const OBJECT_DEFS: RoomObjectDef[] = [
  { kind: 'clock', texture: 'room-clock', anchor: 'center', x: 505, y: 234, targetH: 96, depth: 1 },
  { kind: 'radio', texture: 'room-radio', anchor: 'bottom', x: 505, y: 359, targetH: 40, depth: 1 },
  { kind: 'photo', texture: 'room-photo', anchor: 'bottom', x: 644, y: 302, targetH: 30, depth: 1 },
  { kind: 'calendar', texture: 'room-calendar', anchor: 'bottom', x: 838, y: 340, targetH: 56, depth: 1 },
  { kind: 'pot', texture: 'room-pot', anchor: 'bottom', x: 215, y: 500, targetH: 215, depth: 8, shadow: true },
  { kind: 'fish', texture: 'room-fish', anchor: 'bottom', x: 774, y: 527, targetW: 205, depth: 8, shadow: true },
];

interface VisibleBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
}

const BBOX_CACHE = new Map<string, VisibleBox>();

/** 纹理不透明像素包围盒：摆件按“可见像素”贴家具，自动吃掉美术 PNG 的透明留白 */
function visibleBounds(scene: Phaser.Scene, key: string): VisibleBox {
  const cached = BBOX_CACHE.get(key);
  if (cached) return cached;
  const source = scene.textures.get(key).getSourceImage() as
    CanvasImageSource & { width: number; height: number };
  const w = source.width;
  const h = source.height;
  const box: VisibleBox = { left: 0, top: 0, right: w - 1, bottom: h - 1, w, h };
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    let left = w;
    let right = -1;
    let top = h;
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 24) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right >= left) {
      box.left = left;
      box.top = top;
      box.right = right;
      box.bottom = bottom;
    }
  }
  BBOX_CACHE.set(key, box);
  return box;
}

export default class RoomScene extends Phaser.Scene {
  private sfx!: Sfx;
  private hintText!: Phaser.GameObjects.Text;
  private hudLayer!: Phaser.GameObjects.Container;
  private fragmentHud?: FragmentHudHandle;
  private fragments = new Set<string>();
  private memoryOrb: Phaser.GameObjects.Container | null = null;
  private orbTouched = false;
  /** 有面板（拼图/收音机/时钟/文字）打开时锁定其它交互 */
  private interacting = false;
  private panel: Phaser.GameObjects.Container | null = null;
  private hintTimer?: Phaser.Time.TimerEvent;
  private hintFade?: Phaser.Tweens.Tween;
  /** 拼图已解开（锁输入，播完成效果） */
  private puzzleSolved = false;
  /** 石槽水面中心（playFishSwim 用） */
  private basinWater: { x: number; y: number } | null = null;
  /** hudLayer 随渲染缓冲重缩放的处理器（场景关闭时解绑） */
  private hudSyncHandler?: () => void;
  /** 记忆球/收音机打开时的动态灯（场景 shutdown 会清空 LightsManager，重启重建） */
  private orbLight?: Phaser.GameObjects.Light;
  private radioLight?: Phaser.GameObjects.Light;

  constructor() {
    super('room');
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
  }

  create(): void {
    // 场景复用：状态全部重置（AGENTS.md 第 5 节）；shutdown 会清空 LightsManager，灯光在下面重建
    this.fragments.clear();
    this.fragmentHud?.destroy();
    this.fragmentHud = undefined;
    this.memoryOrb = null;
    this.orbTouched = false;
    this.interacting = false;
    this.panel?.destroy();
    this.panel = null;
    this.hintTimer?.remove();
    this.hintFade?.remove();
    this.hintTimer = undefined;
    this.hintFade = undefined;
    this.basinWater = null;
    this.orbLight = undefined;
    this.radioLight = undefined;
    this.puzzleSolved = false;

    applyHDCamera(this);

    // 光影（依据 3.90 源码 LightPipeline/Light-frag，相机 zoom 感知、无法线图也能漫反射）：
    // 只有背景走 Light2D 管线，环境光压一档，再用“有来源”的灯把重点区域点亮；
    // 物件不切管线保持清晰。WebGL 专属：Canvas 回退时背景按原图渲染、只是无光效，不会黑图。
    this.lights.enable().setAmbientColor(0xd8d0c0);
    this.add
      .image(0, 0, 'room-bg')
      .setOrigin(0, 0)
      .setScale(0.5)
      .setDepth(0)
      .setPipeline('Light2D');
    this.lights.addLight(150, 250, 330, 0xbcd4de, 0.35); // 左侧窗外的冷天光
    this.lights.addLight(505, 320, 300, 0xffe0b0, 0.5); // 方桌上方的暖主光
    this.lights.addLight(780, 320, 260, 0xffd9a8, 0.28); // 右侧柜面的暖补光

    this.buildWindowDust();

    this.sfx = new Sfx(this, { ambient: false }); // 室内：无风声鸟鸣

    this.buildObjects();
    this.buildHud();

    this.cameras.main.fadeIn(250, 20, 18, 26);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__roomScene = this;
    }
  }

  /** 窗光里的浮尘：房间没有角色后，画面保有一点缓慢的“活”感 */
  private buildWindowDust(): void {
    for (let i = 0; i < 7; i++) {
      const mote = this.add
        .ellipse(70 + Math.random() * 210, 150 + Math.random() * 170, 3, 3, 0xfff6df, 0.14)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(0.2);
      this.tweens.add({
        targets: mote,
        x: mote.x + 26,
        y: mote.y - 44,
        duration: 6000 + i * 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 500,
      });
    }
  }

  /** 六个可点击物件：按美术预览落位（可见像素贴家具），微降色调融入画面 + 极淡悬停微光 */
  private buildObjects(): void {
    for (const def of OBJECT_DEFS) {
      const box = visibleBounds(this, def.texture);
      const vw0 = box.right - box.left + 1;
      const vh0 = box.bottom - box.top + 1;
      const scale = def.targetH !== undefined ? def.targetH / vh0 : (def.targetW ?? vh0) / vw0;
      const vw = vw0 * scale;
      const vh = vh0 * scale;
      // 把“可见像素”的中心/底部对到锚点（补偿 PNG 透明留白）
      const offX = (box.left + box.right + 1) / 2 - box.w / 2;
      const img = this.add
        .image(def.x - offX * scale, 0, def.texture)
        .setScale(scale)
        .setDepth(def.depth)
        .setTint(OBJECT_TINT);
      if (def.anchor === 'bottom') {
        img.setOrigin(0.5, 1);
        img.y = def.y + (box.h - 1 - box.bottom) * scale;
      } else {
        img.setOrigin(0.5, 0.5);
        img.y = def.y - ((box.top + box.bottom + 1) / 2 - box.h / 2) * scale;
      }
      const cy = def.anchor === 'bottom' ? def.y - vh / 2 : def.y;

      if (def.kind === 'fish') {
        this.basinWater = { x: def.x, y: def.y - vh * 0.42 };
      }
      if (def.shadow) {
        // 只给落地大件一滩很淡的软影；桌面小件靠背景自带的家具明暗，避免贴纸感
        this.add
          .ellipse(def.x, def.y + 2, vw * 0.8, 9, 0x0c1512, 0.16)
          .setDepth(def.depth - 0.15);
      }
      // 悬停只保留极淡的暖金微光（不再缩放整张图，缩放会暴露“独立图层”）；
      // 隐形热区与视觉尺寸解耦，小物件也容易点中
      const glow = this.add
        .ellipse(def.x, cy, Math.max(vw * 1.35, 40), Math.max(vh * 1.2, 34), GOLD, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(def.depth - 0.05);
      const hit = this.add
        .rectangle(def.x, cy, Math.max(vw + 24, 50), Math.max(vh + 20, 46), 0x000000, 0)
        .setDepth(def.depth + 0.1)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        if (this.interacting) return;
        this.tweens.add({ targets: glow, alpha: 0.12, duration: 140 });
      });
      hit.on('pointerout', () => {
        this.tweens.add({ targets: glow, alpha: 0, duration: 180 });
      });
      hit.on('pointerdown', () => this.onObjectClicked(def));
    }
  }

  private onObjectClicked(def: RoomObjectDef): void {
    if (this.interacting || this.orbTouched) {
      return;
    }
    this.openObject(def.kind);
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

  /** DOM 文字面板（D 的组件）：打开时暂停场景，面板关闭（场景 resume）后解锁交互 */
  private openDomPanel(open: () => { close: () => void }): void {
    this.interacting = true;
    open();
    this.events.once(Phaser.Scenes.Events.RESUME, () => {
      this.interacting = false;
    });
  }

  /** 鱼缸反馈：几尾小鱼贴着石槽水面游过一次 */
  private playFishSwim(): void {
    const basin = this.basinWater;
    if (!basin) return;
    for (let i = 0; i < 3; i++) {
      const fish = this.add
        .ellipse(basin.x - 58 + i * 12, basin.y - 5 + (i % 2) * 9, 15, 6, 0xe8f2e0, 0.85)
        .setDepth(8.05);
      this.tweens.add({
        targets: fish,
        x: basin.x + 58 - i * 10,
        duration: 1500 + i * 280,
        delay: i * 150,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => fish.destroy(),
      });
    }
  }

  // ---------- 照片 4×4 滑块拼图 ----------

  private openPuzzle(): void {
    this.interacting = true;
    const layer = this.add.container(0, 0).setDepth(200);
    this.panel = layer;

    this.panelBackdrop(layer);
    layer.add(this.panelTitle(480, 58, '把照片拼回原样'));
    layer.add(
      this.add
        .text(480, 82, '拖动图块到任意格子换位 · 点一下可滑入旁边的空格', {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: '#cbb98a',
        })
        .setOrigin(0.5),
    );
    this.addCloseButton(layer, 922, 34);

    const srcW = 96;
    const srcH = 64;
    const cellW = 144;
    const cellH = 96;
    const boardX = 480 - (cellW * 4) / 2;
    const boardY = 108;

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

    // 相框底板：暖纸底 + 木色描边 + 4×4 格线——照片的完整轮廓和格子一眼可读
    const pad = 12;
    const plate = this.add.graphics();
    plate.fillStyle(0xf0e8d4, 1);
    plate.fillRoundedRect(
      boardX - pad, boardY - pad, cellW * 4 + pad * 2, cellH * 4 + pad * 2, 10,
    );
    plate.lineStyle(3, 0x8a6d3b, 1);
    plate.strokeRoundedRect(
      boardX - pad, boardY - pad, cellW * 4 + pad * 2, cellH * 4 + pad * 2, 10,
    );
    plate.lineStyle(1, 0x5a4a33, 0.35);
    for (let i = 1; i < 4; i++) {
      plate.lineBetween(boardX + i * cellW, boardY, boardX + i * cellW, boardY + cellH * 4);
      plate.lineBetween(boardX, boardY + i * cellH, boardX + cellW * 4, boardY + i * cellH);
    }
    layer.add(plate);

    const tileImages = new Map<number, Phaser.GameObjects.Image>();
    const posOf = (index: number) => ({ c: index % 4, r: Math.floor(index / 4) });
    const gridXY = (index: number) => {
      const { c, r } = posOf(index);
      return { x: boardX + c * cellW + cellW / 2, y: boardY + r * cellH + cellH / 2 };
    };

    // 空位标记：暗格 + 细描边，随空格移动刷新
    const blankMark = this.add.graphics();
    layer.add(blankMark);
    const drawBlank = () => {
      const p = gridXY(cells.indexOf(15));
      blankMark.clear();
      blankMark.fillStyle(0x1a1512, 0.14);
      blankMark.fillRect(p.x - cellW / 2 + 3, p.y - cellH / 2 + 3, cellW - 6, cellH - 6);
      blankMark.lineStyle(2, 0x8a6d3b, 0.5);
      blankMark.strokeRect(p.x - cellW / 2 + 3, p.y - cellH / 2 + 3, cellW - 6, cellH - 6);
    };
    drawBlank();

    const checkSolved = () => {
      if (cells.every((t, i) => t === i)) {
        this.time.delayedCall(160, () => this.onPuzzleSolved(layer));
      }
    };
    /** 把图块 t 移到 targetPos（与该格原有内容互换），刷新空格标记 */
    const moveTo = (t: number, image: Phaser.GameObjects.Image, targetPos: number) => {
      const at = cells.indexOf(t);
      cells[at] = cells[targetPos];
      cells[targetPos] = t;
      blank = cells.indexOf(15);
      drawBlank();
      const dest = gridXY(targetPos);
      this.tweens.killTweensOf(image); // 快速连拖时不让旧回弹 tween 抢位置
      this.tweens.add({
        targets: image,
        x: dest.x,
        y: dest.y,
        duration: 110,
        ease: 'Quad.easeOut',
      });
      this.sfx.step();
      checkSolved();
    };

    for (let pos = 0; pos < 16; pos++) {
      const tile = cells[pos];
      if (tile === 15) {
        continue;
      }
      const { c, r } = posOf(tile);
      // 预切小图：不用 setCrop——裁剪图的输入热区不可靠（点一块会命中旁边块）
      const tileKey = `photo-tile-${c}-${r}`;
      if (!this.textures.exists(tileKey)) {
        const source = this.textures.get('room-photo').getSourceImage() as
          CanvasImageSource & { width: number; height: number };
        const cnv = document.createElement('canvas');
        cnv.width = srcW;
        cnv.height = srcH;
        cnv.getContext('2d')?.drawImage(source, c * srcW, r * srcH, srcW, srcH, 0, 0, srcW, srcH);
        this.textures.addCanvas(tileKey, cnv);
      }
      const img = this.add
        .image(0, 0, tileKey)
        .setDisplaySize(cellW, cellH)
        .setInteractive({ useHandCursor: true });
      const { x, y } = gridXY(pos);
      img.setPosition(x, y);
      layer.add(img);
      tileImages.set(tile, img);

      const slideIntoBlank = () => {
        if (this.puzzleSolved) {
          return;
        }
        const at = cells.indexOf(tile);
        const b = cells.indexOf(15);
        const adjacent =
          (Math.floor(at / 4) === Math.floor(b / 4) && Math.abs((at % 4) - (b % 4)) === 1) ||
          (at % 4 === b % 4 && Math.abs(Math.floor(at / 4) - Math.floor(b / 4)) === 1);
        if (adjacent) {
          moveTo(tile, img, b);
        } else {
          // 非相邻：轻微推移反馈（这格点不出滑动，但按下有响应）
          this.tweens.killTweensOf(img);
          this.tweens.add({ targets: img, x: img.x + 4, duration: 55, yoyo: true, repeat: 1 });
        }
      };

      // 纯点击必须有独立处理：不移动指针时 Phaser 不发 drag 事件，
      // 挂在 dragend 上的"点击分支"永远不执行（此前"点击没反应"的根因）
      img.on('pointerup', () => {
        if (movedWorld < 8) {
          slideIntoBlank();
        }
      });

      // 拖拽用 Phaser 原生 drag（dragX/dragY 是世界坐标，不受动态缓冲的画布像素影响）：
      // 自由拖到任意格子松手即换位（必可完成）
      this.input.setDraggable(img);
      let dragOffX = 0;
      let dragOffY = 0;
      let movedWorld = 0;
      img.on('dragstart', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
        if (this.puzzleSolved) {
          return;
        }
        dragOffX = img.x - dx;
        dragOffY = img.y - dy;
        movedWorld = 0;
        layer.bringToTop(img);
      });
      img.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
        if (this.puzzleSolved) {
          return;
        }
        const nx = dx + dragOffX;
        const ny = dy + dragOffY;
        movedWorld += Math.hypot(nx - img.x, ny - img.y);
        img.setPosition(nx, ny);
      });
      img.on('dragend', () => {
        if (this.puzzleSolved || movedWorld < 8) {
          return; // 纯点击已由 pointerup 处理
        }
        const col = Phaser.Math.Clamp(Math.round((img.x - boardX - cellW / 2) / cellW), 0, 3);
        const row = Phaser.Math.Clamp(Math.round((img.y - boardY - cellH / 2) / cellH), 0, 3);
        const target = row * 4 + col;
        const at = cells.indexOf(tile);
        if (target === at) {
          const back = gridXY(at);
          this.tweens.killTweensOf(img);
          this.tweens.add({ targets: img, x: back.x, y: back.y, duration: 90, ease: 'Quad.easeOut' });
          return;
        }
        const other = cells[target];
        const otherImg = other !== 15 ? tileImages.get(other) : undefined;
        moveTo(tile, img, target);
        if (otherImg) {
          const back = gridXY(at);
          this.tweens.killTweensOf(otherImg);
          this.tweens.add({
            targets: otherImg,
            x: back.x,
            y: back.y,
            duration: 90,
            ease: 'Quad.easeOut',
          });
        }
      });
    }
  }

  private onPuzzleSolved(layer: Phaser.GameObjects.Container): void {
    if (this.puzzleSolved) {
      return;
    }
    this.puzzleSolved = true;
    // 完成效果：完整照片淡入合拢 → 金光扫过 + 光环 → 停一拍再收起进文字面板
    const boardX = 480 - 144 * 2;
    const boardY = 108;
    const full = this.add
      .image(480, boardY + 192, 'room-photo')
      .setDisplaySize(576, 384)
      .setAlpha(0);
    layer.add(full);
    this.tweens.add({ targets: full, alpha: 1, duration: 320, ease: 'Quad.easeOut' });

    const sweep = this.add
      .rectangle(0, boardY + 192, 64, 400, 0xfff2cc, 0.32)
      .setBlendMode(Phaser.BlendModes.ADD);
    layer.add(sweep);
    this.tweens.add({
      targets: sweep,
      x: boardX + 640,
      duration: 650,
      delay: 240,
      ease: 'Quad.easeInOut',
      onComplete: () => sweep.destroy(),
    });
    Effects.ring(this, 480, boardY + 192);
    this.time.delayedCall(1150, () => {
      if (this.panel !== layer) {
        return; // 演出期间面板被关掉：不发碎片
      }
      this.closePanel();
      this.cameras.main.flash(140, 230, 207, 151);
      this.gainFragment('photo');
      this.openDomPanel(() => showPhotoMemoryText(this, photoFrameUrl));
    });
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
    this.pauseRoomBgm(true);
    // 收音机“发声”时从机身泛出一圈暖光（有来源的光）
    this.radioLight = this.lights.addLight(505, 335, 210, 0xffc98a, 0.55);

    const layer = this.add.container(0, 0).setDepth(200);
    this.panel = layer;
    this.panelBackdrop(layer);
    layer.add(this.panelTitle(480, 74, '旋转旋钮，调一个频道'));
    this.addCloseButton(layer, 922, 34);

    // 收音机特写放在与拼图同款的暖纸底板上——两套玩法读作同一个"把旧物放到桌前细看"
    const radioPlate = this.add.graphics();
    radioPlate.fillStyle(0xf0e8d4, 1);
    radioPlate.fillRoundedRect(480 - 210, 226 - 135, 420, 270, 10);
    radioPlate.lineStyle(3, 0x8a6d3b, 1);
    radioPlate.strokeRoundedRect(480 - 210, 226 - 135, 420, 270, 10);
    layer.add(radioPlate);

    const radioImg = this.add.image(480, 226, 'room-radio').setScale(0.95);
    layer.add(radioImg);
    const channelText = this.add
      .text(480, 366, '咔。', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#f4f9f2',
      })
      .setOrigin(0.5);
    layer.add(channelText);
    const knob = this.add
      .circle(480, 432, 34, 0x8a6d3b, 1)
      .setStrokeStyle(3, GOLD, 1)
      .setInteractive({ useHandCursor: true });
    const knobText = this.add
      .text(480, 432, '旋钮', { fontFamily: 'sans-serif', fontSize: '14px', color: '#101b16' })
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
    showClockPuzzleUI(this, {
      onClose: () => { this.interacting = false; },
      onSolved: () => {
        this.interacting = false;
        this.cameras.main.flash(140, 230, 207, 151);
        this.gainFragment('clock');
      },
    });
  }

  // ---------- 碎片 / 记忆球 / 结尾 ----------

  private gainFragment(kind: 'photo' | 'radio' | 'clock'): void {
    if (this.fragments.has(kind)) {
      return;
    }
    this.fragments.add(kind);
    this.sfx.collect();
    this.fragmentHud?.collect(kind);
    if (this.fragments.size >= 3) {
      this.spawnMemoryOrb();
    }
  }

  private spawnMemoryOrb(): void {
    // 悬在方桌上空（挂钟 234 与桌面 360 之间），避开挂钟与相框
    this.memoryOrb = this.add.container(480, 305).setDepth(6);
    const glow = this.add.ellipse(0, 0, 110, 110, GOLD, 0.2);
    const core = this.add.circle(0, 0, 26, GOLD).setStrokeStyle(3, 0xf6e7b8, 0.9);
    const hit = this.add.circle(0, 0, 44, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.touchMemoryOrb());
    this.memoryOrb.add([glow, core, hit]);
    // 球本体也点亮房间（有来源的金色光，随呼吸明暗）
    this.orbLight = this.lights.addLight(480, 305, 240, GOLD, 0.8);
    this.tweens.add({
      targets: this.memoryOrb,
      y: 291,
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
    this.tweens.add({
      targets: this.orbLight,
      intensity: { from: 0.5, to: 1.0 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    Effects.ring(this, 480, 305);
    this.sfx.door();
    this.showHint('三块碎片融成了记忆球——点击它');
  }

  private touchMemoryOrb(): void {
    if (!this.memoryOrb || this.orbTouched) {
      return;
    }
    this.orbTouched = true;
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

  // ---------- HUD / 面板公共件 ----------

  /** 面板遮光：与 D 的文字面板（blur+brightness .79）观感对齐，三个玩法面板统一 */
  private panelBackdrop(layer: Phaser.GameObjects.Container): void {
    const dim = this.add.rectangle(480, 270, ROOM_WIDTH, ROOM_HEIGHT, 0x0c1310, 0.66).setInteractive();
    layer.add(dim);
  }

  private buildHud(): void {
    // 210：盖过谜题面板的暗幕（200），时钟答错的提示才看得见
    this.hudLayer = this.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(210)
      .setScale(bufferScaleOf(this));
    // HUD 是 scrollFactor 0 层（世界单位 = 缓冲像素），渲染缓冲随窗口变化时跟着缩放
    this.scale.off(Phaser.Scale.Events.RESIZE, this.hudSyncHandler);
    this.hudSyncHandler = () => this.hudLayer.setScale(bufferScaleOf(this));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.hudSyncHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.hudSyncHandler) {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.hudSyncHandler);
      }
      this.hudSyncHandler = undefined;
    });
    this.hintText = this.add.text(16, 14, '', {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      color: '#f4f9f2',
      // 与森林提示同款深色底牌，任何背景上可读
      backgroundColor: 'rgba(9, 20, 15, 0.8)',
      padding: { x: 10, y: 6 },
    });
    this.hudLayer.add(this.hintText);
    this.showHint('点击房间里的物件', 4500);

    this.fragmentHud = createFragmentHud(this);
  }

  /** 提示显示一段时间后自动淡出（与森林的区域提示一致，不再常驻） */
  private showHint(message: string, holdMs = 3000): void {
    this.hintTimer?.remove();
    this.hintFade?.remove();
    this.hintText.setText(message).setColor('#ffe9a8').setAlpha(1);
    this.hintTimer = this.time.delayedCall(holdMs, () => {
      this.hintFade = this.tweens.add({
        targets: this.hintText,
        alpha: 0,
        duration: 600,
      });
    });
  }

  private panelTitle(x: number, y: number, text: string): Phaser.GameObjects.Text {
    // 与 D 的文字面板同款标题色/字号，玩法面板与文字面板读作同一套界面
    return this.add
      .text(x, y, text, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#f0dfb5',
      })
      .setOrigin(0.5)
      .setShadow(0, 1, '#06090a', 3);
  }

  private addCloseButton(layer: Phaser.GameObjects.Container, x: number, y: number): void {
    const btn = this.add
      .text(x, y, '×', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#f0dfb5',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#fff7e4'));
    btn.on('pointerout', () => btn.setColor('#f0dfb5'));
    btn.on('pointerdown', () => this.closePanel());
    layer.add(btn);
  }

  private closePanel(): void {
    this.panel?.destroy();
    this.panel = null;
    this.interacting = false;
    if (this.radioLight) {
      this.lights.removeLight(this.radioLight);
      this.radioLight = undefined;
    }
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
