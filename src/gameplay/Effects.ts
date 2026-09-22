import Phaser from 'phaser';

/** 简易可复现随机（LCG，固定种子），保证每次进场景画面一致 */
function makeRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

type Bloomable = {
  postFX?: {
    addBloom: (
      color?: number,
      offsetX?: number,
      offsetY?: number,
      blurStrength?: number,
      strength?: number,
      steps?: number,
    ) => unknown;
  };
};

/**
 * 通用视觉特效：尘土、金色迸溅、光环、萤火虫。
 * 全部用游戏对象 + tween 合成，不需要任何贴图素材。
 */
export const Effects = {
  /** 金色发光物的对象级 Bloom（仅 WebGL；Canvas 降级无操作，见 AGENTS.md 第 6 节） */
  glow(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Container | Phaser.GameObjects.Shape,
    color = 0xf2d98c,
  ): void {
    if (scene.game.renderer.type !== Phaser.WEBGL) {
      return;
    }
    (target as unknown as Bloomable).postFX?.addBloom(color, 1, 1, 8, 1, 3);
  },

  /** 落地/起跳的尘土 */
  dust(scene: Phaser.Scene, x: number, y: number, count = 6, spread = 24): void {
    const rand = makeRandom(Math.floor(x * 31 + y * 7) + count);
    for (let i = 0; i < count; i++) {
      const puff = scene.add
        .circle(x + (rand() - 0.5) * 14, y - 2, 3 + rand() * 3, 0xcfd8c8, 0.5)
        .setDepth(4);
      scene.tweens.add({
        targets: puff,
        x: puff.x + (rand() - 0.5) * spread,
        y: y - 6 - rand() * 14,
        alpha: 0,
        scale: 1.7,
        duration: 320 + rand() * 160,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  },

  /** 拾取钥匙等“获得”时刻的金色迸溅 */
  sparkBurst(scene: Phaser.Scene, x: number, y: number, count = 10, color = 0xe6cf97): void {
    const rand = makeRandom(Math.floor(x * 13 + y * 29) + count);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + rand() * 0.5;
      const dist = 26 + rand() * 30;
      const spark = scene.add.rectangle(x, y, 4, 4, color).setDepth(30);
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.3,
        angle: 180,
        duration: 420 + rand() * 180,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  },

  /** 门出现等节点的扩散光环 */
  ring(scene: Phaser.Scene, x: number, y: number, color = 0xe6cf97): void {
    const ring = scene.add.circle(x, y, 20).setStrokeStyle(3, color, 0.7).setDepth(30);
    scene.tweens.add({
      targets: ring,
      scale: 4,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  },

  /** 全图缓慢漂浮、明灭的萤火虫（森林氛围） */
  fireflies(scene: Phaser.Scene, worldWidth: number, count = 14): void {
    const rand = makeRandom(20260922);
    for (let i = 0; i < count; i++) {
      const x = rand() * worldWidth;
      const y = 180 + rand() * 340;
      const halo = scene.add
        .circle(x, y, 7, 0xe6cf97, 0.1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(4);
      const dot = scene.add
        .circle(x, y, 2.2, 0xe6cf97, 0.2 + rand() * 0.3)
        .setDepth(4);
      const blink = [halo, dot];
      scene.tweens.add({
        targets: blink,
        x: x + (rand() - 0.5) * 120,
        y: y + (rand() - 0.5) * 80,
        duration: 3000 + rand() * 4000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      scene.tweens.add({
        targets: blink,
        alpha: 0.06,
        duration: 1200 + rand() * 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  },
};
