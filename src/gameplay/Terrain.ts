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
  /** 可站立表面的统一识别亮边（玩家据此辨认落脚处） */
  grassEdge: 0x8fd1a8,
  grassBlade: 0x69a07e,
  root: 0x1c3026,
} as const;

const GRASS_LIP = 12;
/** 台阶最大上升高度，越小越顺滑 */
const MAX_STEP_RISE = 14;

/** B 交付的可平铺贴图（存在则优先使用，否则程序绘制） */
const TEXTURE = {
  ground: 'env-jasmine-ground',
  float: 'env-jasmine-platform',
} as const;

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

  addSlope(def: SlopeDef): void {
    const steps = Math.max(6, Math.ceil(def.drop / MAX_STEP_RISE));
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

  /** 厚地面：茉莉花篱笆顶面（B 贴图）+ 土层渐变 + 碎石 + 根系；无贴图时退回程序绘制 */
  private drawGround(x: number, y: number, width: number, height: number): void {
    const g = this.scene.add.graphics();
    // 土层（草皮以下，从篱笆下缘开始）
    g.fillGradientStyle(COLORS.soilTop, COLORS.soilTop, COLORS.soilDeep, COLORS.soilDeep, 1);
    g.fillRect(x, y + 34, width, Math.max(6, height - 34));
    // 碎石肌理
    for (let ty = y + 52; ty < y + height - 10; ty += 30) {
      for (let tx = x + 16 + ((ty * 13) % 22); tx < x + width - 10; tx += 27) {
        const dark = (tx + ty) % 2 === 0;
        g.fillStyle(dark ? COLORS.soilSpeckle : COLORS.soilSpeckleLight, 0.55);
        g.fillCircle(tx, ty, dark ? 2.2 : 1.7);
      }
    }
    // 根系：从顶面下垂的短根
    g.lineStyle(2, COLORS.root, 0.75);
    for (let rx = x + 40; rx < x + width - 20; rx += 88) {
      const depth = 26 + ((rx * 11) % 22);
      g.beginPath();
      g.moveTo(rx, y + GRASS_LIP);
      g.lineTo(rx + 3, y + GRASS_LIP + depth * 0.55);
      g.lineTo(rx - 2, y + GRASS_LIP + depth);
      g.strokePath();
      g.beginPath();
      g.moveTo(rx + 1, y + GRASS_LIP + depth * 0.4);
      g.lineTo(rx + 10, y + GRASS_LIP + depth * 0.62);
      g.strokePath();
    }

    if (this.scene.textures.exists(TEXTURE.ground)) {
      // 茉莉花篱笆顶面：顶部高出碰撞线 8px，角色脚踩进花丛； TileSprite 平铺
      const hedge = this.scene.add
        .tileSprite(x, y - 8, width, 52, TEXTURE.ground)
        .setOrigin(0, 0);
      hedge.setTileScale(0.236, 0.236);
    } else {
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
  }

  /** 薄浮空平台：茉莉花板贴图（B）；无贴图时退回圆角草板 */
  private drawFloat(x: number, y: number, width: number, height: number): void {
    if (this.scene.textures.exists(TEXTURE.float)) {
      // 花板略宽于碰撞体（两侧各探出 8px），顶面与碰撞线齐平
      const board = this.scene.add
        .tileSprite(x - 8, y - 6, width + 16, 52, TEXTURE.float)
        .setOrigin(0, 0);
      board.setTileScale(0.36, 0.36);
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
