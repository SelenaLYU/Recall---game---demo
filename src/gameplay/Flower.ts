import Phaser from 'phaser';
import { Effects } from './Effects';

/**
 * 大花平台：可以踩的花（B 的整株茉莉大花贴图；无贴图时退回程序绘制）。
 * bouncy = true 为弹跳花——落上去会被高高弹起（通往高台），花头染粉区分。
 */
export class Flower {
  readonly x: number;
  readonly top: number;
  readonly bouncy: boolean;
  /** 花头的静态碰撞体（场景用它和角色建 collider） */
  readonly body: Phaser.GameObjects.Rectangle;

  private readonly display: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  private baseScaleX: number;
  private baseScaleY: number;

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

    // 碰撞体：花头附近的薄静态矩形（与画面分离，见 AGENTS.md 可读性约定）
    this.body = scene.add
      .rectangle(x, top + 4, 88, 14, 0xffffff, 0)
      .setOrigin(0.5, 0.5);
    scene.physics.add.existing(this.body, true);

    if (scene.textures.exists('env-giant-jasmine-plant')) {
      // 整株大花贴图：底部扎根地面，花头顶到 top
      const height = groundY + 10 - top;
      const img = scene.add
        .image(x, groundY + 10, 'env-giant-jasmine-plant')
        .setOrigin(0.5, 1)
        .setDisplaySize(height * (256 / 384), height)
        .setDepth(2);
      if (bouncy) {
        img.setTint(0xf3c2d8);
      }
      this.baseScaleX = img.scaleX;
      this.baseScaleY = img.scaleY;
      this.display = img;
    } else {
      // 程序化回退：茎 + 花瓣环
      const stem = scene.add.graphics().setDepth(1);
      stem.lineStyle(7, 0x3f6b4f, 1);
      stem.beginPath();
      stem.moveTo(x, groundY + 10);
      stem.lineTo(x + Math.sin(x) * 2, top + 16);
      stem.lineTo(x, top + 10);
      stem.strokePath();
      stem.fillStyle(0x4a7a5c, 1);
      stem.fillEllipse(x - 10, Phaser.Math.Linear(top, groundY, 0.55), 16, 8);
      const petalColor = bouncy ? 0xd9a0b4 : 0xcfe3c8;
      const petalEdge = bouncy ? 0xb0758c : 0x9dbfa4;
      const petals = scene.add.container(x, top);
      for (let i = 0; i < 6; i++) {
        const petal = scene.add.ellipse(0, -16, 26, 38, petalColor);
        petal.setRotation((Math.PI * 2 * i) / 6);
        petal.setStrokeStyle(2, petalEdge, 0.9);
        petals.add(petal);
      }
      const center = scene.add
        .circle(0, 0, 15, bouncy ? 0xe8b04c : 0xe6cf97)
        .setStrokeStyle(2, 0x8a6d3b, 0.8);
      this.baseScaleX = 1;
      this.baseScaleY = 1;
      this.display = scene.add.container(x, top, [petals, center]).setDepth(2);
    }

    // 待机微摇：只给弹跳花（前两朵是静态平台，摇/压会误导"能弹"的预期）
    if (bouncy) {
      scene.tweens.add({
        targets: this.display,
        angle: { from: -2, to: 2 },
        duration: 2400 + ((x * 7) % 900),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** 被踩（弹跳花）：花头压扁回弹 */
  squash(scene: Phaser.Scene): void {
    if (!this.bouncy) {
      return;
    }
    scene.tweens.killTweensOf(this.display);
    this.display.setScale(this.baseScaleX * 1.15, this.baseScaleY * 0.55);
    scene.tweens.add({
      targets: this.display,
      scaleX: this.baseScaleX,
      scaleY: this.baseScaleY,
      duration: 450,
      ease: 'Elastic.easeOut',
    });
  }

  /** 被踩（静态平台花）：极轻下沉 + 花体暖光一闪的"软垫"读法——
   *  不摇不摆、无粒子无光圈（历次反馈：压扁✗、白尘✗、光环✗、纯声音✗，
   *  收敛为花本体 3.5% 的下沉与一闪提亮，2026-09-24） */
  press(scene: Phaser.Scene): void {
    if (this.bouncy) {
      return;
    }
    scene.tweens.killTweensOf(this.display);
    this.display.setScale(this.baseScaleX, this.baseScaleY * 0.965);
    const img = this.display as Phaser.GameObjects.Image;
    if (typeof img.setTint === 'function') {
      img.setTint(0xfff2d8);
    }
    scene.tweens.add({
      targets: this.display,
      scaleX: this.baseScaleX,
      scaleY: this.baseScaleY,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (typeof img.clearTint === 'function') {
          img.clearTint();
        }
      },
    });
  }
}
