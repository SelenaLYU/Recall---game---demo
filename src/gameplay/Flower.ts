import Phaser from 'phaser';
import { Effects } from './Effects';

/**
 * 大花平台：可以踩的花（参考小咪的 3D 花设定，程序化占位）。
 * bouncy = true 为弹跳花——落上去会被高高弹起（通往高台）。
 */
export class Flower {
  readonly x: number;
  readonly top: number;
  readonly bouncy: boolean;
  /** 花头的静态碰撞体（场景用它和角色建 collider） */
  readonly body: Phaser.GameObjects.Rectangle;

  private readonly head: Phaser.GameObjects.Container;
  private readonly petals: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    top: number,
    bouncy = false,
  ) {
    this.x = x;
    this.top = top;
    this.bouncy = bouncy;

    // 茎：从地面长到花头，带一片叶
    const stem = scene.add.graphics().setDepth(1);
    stem.lineStyle(7, 0x3f6b4f, 1);
    stem.beginPath();
    stem.moveTo(x, groundY + 10);
    stem.lineTo(x + Math.sin(x) * 2, top + 16);
    stem.lineTo(x, top + 10);
    stem.strokePath();
    stem.fillStyle(0x4a7a5c, 1);
    stem.fillEllipse(x - 10, Phaser.Math.Linear(top, groundY, 0.55), 16, 8);

    // 花头：花瓣环 + 花心，弹跳花用暖粉色调区分
    const petalColor = bouncy ? 0xd9a0b4 : 0xcfe3c8;
    const petalEdge = bouncy ? 0xb0758c : 0x9dbfa4;
    this.petals = scene.add.container(x, top);
    for (let i = 0; i < 6; i++) {
      const petal = scene.add.ellipse(0, -16, 26, 38, petalColor);
      petal.setRotation((Math.PI * 2 * i) / 6);
      petal.setStrokeStyle(2, petalEdge, 0.9);
      this.petals.add(petal);
    }
    const center = scene.add
      .circle(0, 0, 15, bouncy ? 0xe8b04c : 0xe6cf97)
      .setStrokeStyle(2, 0x8a6d3b, 0.8);
    this.head = scene.add.container(x, top, [this.petals, center]).setDepth(2);
    if (bouncy) {
      Effects.glow(scene, this.head, 0xf2c6d4);
    }

    // 碰撞体：花心附近的薄静态矩形
    this.body = scene.add
      .rectangle(x, top + 4, 88, 14, 0xffffff, 0)
      .setOrigin(0.5, 0.5);
    scene.physics.add.existing(this.body, true);

    // 待机微摇
    scene.tweens.add({
      targets: this.head,
      angle: { from: -2, to: 2 },
      duration: 2400 + ((x * 7) % 900),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 被踩：花头压扁回弹；弹跳花由场景再给角色速度 */
  squash(scene: Phaser.Scene): void {
    scene.tweens.killTweensOf(this.head);
    this.head.setScale(1.15, 0.55);
    scene.tweens.add({
      targets: this.head,
      scaleX: 1,
      scaleY: 1,
      duration: 450,
      ease: 'Elastic.easeOut',
    });
  }
}
