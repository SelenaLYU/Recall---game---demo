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
  soil: 0x2f4a3c,
  grass: 0x4a7a5c,
  grassLight: 0x5c9070,
  outline: 0x11251d,
} as const;

const GRASS_LIP = 10;
/** 台阶最大上升高度，越小越顺滑 */
const MAX_STEP_RISE = 14;

/**
 * 地形构建模块：把数据化的平台/斜坡定义变成静态碰撞体 + 可读的画面。
 * 斜坡 = 无碰撞的视觉草皮带 + 底下细台阶静态碰撞体（Arcade 无原生斜面，见 AGENTS.md 第 5 节）。
 */
export class Terrain {
  /** 全部静态碰撞体，场景用它和角色建 collider */
  readonly solids: Phaser.GameObjects.Rectangle[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  addPlatform(def: PlatformDef): void {
    const kind = def.kind ?? 'ground';
    const body = this.scene.add
      .rectangle(def.x, def.y, def.width, def.height, COLORS.soil)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.outline, 0.5);
    this.scene.physics.add.existing(body, true);
    this.solids.push(body);

    if (kind === 'ground') {
      this.addGrassLip(def.x, def.y, def.width);
    } else {
      // 浮空平台整块用草色，轻且清晰
      body.setFillStyle(COLORS.grass);
      this.addGrassLip(def.x, def.y, def.width, COLORS.grassLight);
    }
  }

  addSlope(def: SlopeDef): void {
    const steps = Math.max(6, Math.ceil(def.drop / MAX_STEP_RISE));
    const stepWidth = def.width / steps;
    for (let i = 0; i < steps; i++) {
      const topY = def.y + (def.drop * i) / steps;
      const height = def.y + def.drop - topY;
      const step = this.scene.add
        .rectangle(def.x + i * stepWidth, topY, Math.ceil(stepWidth) + 1, height, COLORS.soil)
        .setOrigin(0, 0);
      this.scene.physics.add.existing(step, true);
      this.solids.push(step);
    }

    // 视觉草皮带：沿台阶角点连线厚 12px，渲染在角色之上，脚步陷入读作“踩进草里”
    const band = this.scene.add.graphics().setDepth(5);
    const p1 = { x: def.x, y: def.y };
    const p2 = { x: def.x + def.width, y: def.y + def.drop };
    band.fillStyle(COLORS.grass, 1);
    band.fillPoints([p1, p2, { x: p2.x, y: p2.y + 12 }, { x: p1.x, y: p1.y + 12 }], true);
    band.lineStyle(3, COLORS.grassLight, 0.9);
    band.strokePoints([p1, p2], false);
  }

  private addGrassLip(x: number, y: number, width: number, color: number = COLORS.grass): void {
    this.scene.add
      .rectangle(x, y, width, GRASS_LIP, color)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.outline, 0.35);
  }
}
