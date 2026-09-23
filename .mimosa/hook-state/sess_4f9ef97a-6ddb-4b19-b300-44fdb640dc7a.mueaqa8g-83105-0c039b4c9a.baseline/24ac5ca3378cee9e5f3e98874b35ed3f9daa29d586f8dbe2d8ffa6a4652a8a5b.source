import Phaser from 'phaser';

export interface PlatformDef {
  /** 左上角坐标（逻辑分辨率） */
  x: number;
  y: number;
  width: number;
  height: number;
  /** float 为薄浮空平台，ground 为厚地面 */
  kind?: 'ground' | 'float';
}

export interface SlopeDef {
  /** 斜坡左上角；从左向右下行 */
  x: number;
  y: number;
  width: number;
  /** 总落差（正值） */
  drop: number;
}

const COLORS = {
  soilTop: 0x36543f,
  soilDeep: 0x24392c,
  soilSpeckle: 0x1d3026,
  soilSpeckleLight: 0x41614f,
  grass: 0x4a7a5c,
  /** 可站立表面的统一识别亮边（玩家据此辨认落脚处）——程序占位绘制用 */
  grassEdge: 0x8fd1a8,
  /** B 贴图模式下的顶面高光：暖白微光替代亮绿描边（实机看亮绿线像荧光边界线，与水彩风割裂） */
  topGlow: 0xfff3d9,
  grassBlade: 0x69a07e,
  root: 0x1c3026,
} as const;

/** B 交付的可平铺贴图（存在则优先使用，否则程序绘制） */
const TEXTURE = {
  ground: 'env-jasmine-ground',
  float: 'env-jasmine-platform',
  /** 板端小花：贴在浮台两端，软化笔直的贴图断口 */
  bloom: 'env-small-jasmine-bloom',
} as const;

const GRASS_LIP = 12;
/** 台阶最大上升高度，越小越顺滑 */
const MAX_STEP_RISE = 14;

/**
 * 地形构建：碰撞与画面分离——Arcade 静态碰撞体隐藏不渲染，
 * 在相同坐标单独绘制「草皮亮边 + 土层 + 根系」（可站立表面的统一识别线）。
 * B 的地面/平台贴图到货后，仅替换绘制函数，碰撞坐标不变。
 */
export class Terrain {
  /** 全部静态碰撞体（隐藏），场景用它和角色建 collider */
  readonly solids: Phaser.GameObjects.Rectangle[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  addPlatform(def: PlatformDef): void {
    const body = this.scene.add
      .rectangle(def.x, def.y, def.width, def.height, COLORS.soilTop)
      .setOrigin(0, 0)
      .setVisible(false);
    this.scene.physics.add.existing(body, true);
    this.solids.push(body);

    if ((def.kind ?? 'ground') === 'ground') {
      this.drawGround(def.x, def.y, def.width, def.height);
    } else {
      this.drawFloat(def.x, def.y, def.width, def.height);
    }
  }

  /** 采样台阶坡：按坡面素材的崖沿曲线（世界坐标点列）生成一串隐藏台阶，
   * 上升/下降每段 ≤16px；画面由场景把坡面素材铺在台阶角点连线上。 */
  addStepSlope(points: Array<{ x: number; top: number }>, bottom: number): void {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const width = Math.ceil(b.x - a.x) + 1;
      const height = Math.max(8, bottom - a.top);
      const rect = this.scene.add
        .rectangle(a.x, a.top, width, height, COLORS.soilTop)
        .setOrigin(0, 0)
        .setVisible(false);
      this.scene.physics.add.existing(rect, true);
      this.solids.push(rect);
    }
  }

  addSlope(def: SlopeDef): void {    const steps = Math.max(6, Math.ceil(def.drop / MAX_STEP_RISE));
    const stepWidth = def.width / steps;
    for (let i = 0; i < steps; i++) {
      const topY = def.y + (def.drop * i) / steps;
      const height = def.y + def.drop - topY;
      const step = this.scene.add
        .rectangle(def.x + i * stepWidth, topY, Math.ceil(stepWidth) + 1, height, COLORS.soilTop)
        .setOrigin(0, 0)
        .setVisible(false);
      this.scene.physics.add.existing(step, true);
      this.solids.push(step);
    }

    // 视觉草皮带：沿台阶角点连线，顶缘用统一亮边标注可站立线
    const band = this.scene.add.graphics().setDepth(5);
    const p1 = { x: def.x, y: def.y };
    const p2 = { x: def.x + def.width, y: def.y + def.drop };
    band.fillStyle(COLORS.grass, 1);
    band.fillPoints([p1, p2, { x: p2.x, y: p2.y + 12 }, { x: p1.x, y: p1.y + 12 }], true);
    band.lineStyle(3, COLORS.grassEdge, 1);
    band.strokePoints([p1, p2], false);
    band.fillStyle(COLORS.grassBlade, 1);
    for (let t = 0.1; t < 1; t += 0.17) {
      const tx = def.x + def.width * t;
      const ty = def.y + def.drop * t + 6;
      const h = 5 + ((tx * 7) % 6);
      band.fillTriangle(tx - 2, ty, tx + 2, ty, tx, ty - h);
    }
  }

  /** 厚地面：茉莉花篱笆贴图（B 资产）即整个画面——下面不再垫程序土层/碎石/根系
   *（深色矩形与背景割裂，用户要求去掉）；无贴图时才退回程序绘制草皮。 */
  private drawGround(x: number, y: number, width: number, height: number): void {
    if (this.scene.textures.exists(TEXTURE.ground)) {
      // 茉莉花篱笆顶面：顶部高出碰撞线 8px，角色脚踩进花丛；TileSprite 平铺。
      // 缩放/色差按块微调，打散"同一花纹无限重复"的贴图感
      const jitter = (((x * 7) % 7) - 3) / 1000;
      const hedge = this.scene.add
        .tileSprite(x, y - 8, width, 52, TEXTURE.ground)
        .setOrigin(0, 0);
      hedge.setTileScale(0.236 + jitter, 0.236 + jitter);
      hedge.setTint(x % 240 < 120 ? 0xf6f9f2 : 0xe9efe4);
      // 顶面高光：一条极淡的暖白微光落在碰撞顶面（可读性约定的"表面读法"）。
      // 不再用亮绿描边——实机看像荧光边界线，贴在 B 的水彩花丛上非常突兀
      const edge = this.scene.add.graphics();
      edge.lineStyle(3, COLORS.topGlow, 0.14);
      edge.lineBetween(x + 4, y + 2, x + width - 4, y + 2);
      return;
    }
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.grass, 1);
    g.fillRect(x, y, width, GRASS_LIP);
    g.fillStyle(COLORS.grassEdge, 1);
    g.fillRect(x, y, width, 3);
    g.fillStyle(COLORS.grassBlade, 1);
    for (let tx = x + 14; tx < x + width - 8; tx += 54) {
      const h = 5 + ((tx * 7) % 6);
      g.fillTriangle(tx - 2, y + 3, tx + 2, y + 3, tx, y + 3 - h);
    }
  }

  /** 薄浮空平台：茉莉花板贴图（B）；无贴图时退回圆角草板 */
  private drawFloat(x: number, y: number, width: number, height: number): void {
    if (this.scene.textures.exists(TEXTURE.float)) {
      // 花板略宽于碰撞体（两侧各探出 8px），顶面与碰撞线齐平；缩放/色差微调防重复
      const jitter = (((Math.round(x) * 11) % 5) - 2) / 1000;
      const board = this.scene.add
        .tileSprite(x - 8, y - 6, width + 16, 52, TEXTURE.float)
        .setOrigin(0, 0);
      board.setTileScale(0.36 + jitter, 0.36 + jitter);
      board.setTint(Math.round(x) % 260 < 130 ? 0xf4f8f1 : 0xe8efe6);
      // 两端贴一朵垂出来的小花（B 的 bloom 素材）：软化笔直的贴图断口，
      // 让花板像"长出来的一丛"而不是被切齐的矩形块
      if (this.scene.textures.exists(TEXTURE.bloom)) {
        for (const [bx, seed] of [
          [x - 2, Math.round(x) * 3],
          [x + width + 2, Math.round(x) * 3 + 1],
        ] as const) {
          const sway = ((seed * 17) % 7) - 3;
          const bloom = this.scene.add
            .image(bx, y + 6, TEXTURE.bloom)
            .setOrigin(0.5, 0.5)
            .setScale(0.3 + (((seed * 13) % 5) / 100))
            .setAngle(sway)
            .setTint(Math.round(x) % 260 < 130 ? 0xf4f8f1 : 0xe8efe6);
          this.scene.tweens.add({
            targets: bloom,
            angle: sway + 4,
            duration: 1900 + ((seed * 29) % 700),
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }
      const edge = this.scene.add.graphics();
      edge.lineStyle(3, COLORS.topGlow, 0.16);
      edge.lineBetween(x - 2, y + 2, x + width + 2, y + 2);
      return;
    }
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.grass, 1);
    g.fillRoundedRect(x, y, width, height, 6);
    g.lineStyle(2, COLORS.grassEdge, 0.9);
    g.strokeRoundedRect(x, y, width, height, 6);
    g.fillStyle(COLORS.grassEdge, 1);
    g.fillRect(x + 3, y + 1, width - 6, 3);
    g.fillStyle(COLORS.grassBlade, 1);
    for (let tx = x + 14; tx < x + width - 8; tx += 46) {
      const h = 5 + ((tx * 7) % 6);
      g.fillTriangle(tx - 2, y + 3, tx + 2, y + 3, tx, y + 3 - h);
    }
  }
}
