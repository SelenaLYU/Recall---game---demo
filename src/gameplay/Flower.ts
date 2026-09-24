import Phaser from 'phaser';
import { Effects } from './Effects';

/**
 * 大花平台：可以踩的花。
 * 外观：B 的整株茉莉立绘做茎叶，花头用 env-small-jasmine-bloom 素材叠成
 * "一大两小"的茉莉花簇（2026-09-24 按需求用地上的花修改花头）。
 * bouncy = true 为弹跳花——落上去会被高高弹起（通往高台），花簇染粉区分。
 * 物理触感：踩住时整株保持下沉（scaleY 0.93），离开后 Back.easeOut 过冲回弹；
 * 落上瞬间按落速做一次更深的压缩脉冲——弹簧的"压→弹"读法。
 */
export class Flower {
  readonly x: number;
  readonly top: number;
  readonly bouncy: boolean;
  /** 花头的静态碰撞体（场景用它和角色建 collider） */
  readonly body: Phaser.GameObjects.Rectangle;

  private readonly display: Phaser.GameObjects.Container;
  /** 静置基准缩放（压扁/回弹都围绕它） */
  private readonly base: { x: number; y: number };
  /** 是否正被角色踩住（持续下沉状态） */
  private pressed = false;

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

    const height = groundY + 10 - top;
    const plantTex = 'env-giant-jasmine-plant';
    const bloomTex = 'env-small-jasmine-bloom';
    const hasPlant = scene.textures.exists(plantTex);

    // 整株容器以"根部"为原点：压扁时从地面向下塌，不悬空
    this.display = scene.add.container(x, groundY + 10).setDepth(2);
    const children: Phaser.GameObjects.GameObject[] = [];

    if (hasPlant) {
      // 茎叶立绘：底部扎根，顶到花头
      const plant = scene.add.image(0, 0, plantTex).setOrigin(0.5, 1);
      plant.setDisplaySize(height * (256 / 384), height);
      children.push(plant);
    }

    if (scene.textures.exists(bloomTex)) {
      // 花头茉莉花簇：一大两小盖在原花头位置（源图花头中心 ≈ 高度 18% 处）
      const headY = -height * 0.82;
      const mk = (ox: number, oy: number, scale: number) => {
        const bloom = scene.add
          .image(ox, headY + oy, bloomTex)
          .setOrigin(0.5, 0.5)
          .setScale(scale);
        if (bouncy) {
          bloom.setTint(0xf3c2d8);
        }
        return bloom;
      };
      children.push(
        mk(0, 0, 0.46),
        mk(-height * 0.09, height * 0.03, 0.32),
        mk(height * 0.1, height * 0.02, 0.35),
      );
    } else if (!hasPlant) {
      // 双素材皆无的程序化回退：茎 + 花瓣环
      const stem = scene.add.graphics();
      stem.lineStyle(7, 0x3f6b4f, 1);
      stem.beginPath();
      stem.moveTo(0, 0);
      stem.lineTo(Math.sin(x) * 2, -(height - 16));
      stem.lineTo(0, -(height - 10));
      stem.strokePath();
      stem.fillStyle(0x4a7a5c, 1);
      stem.fillEllipse(-10, -height * 0.45, 16, 8);
      const petals = scene.add.container(0, -(height - 10));
      const petalColor = bouncy ? 0xd9a0b4 : 0xcfe3c8;
      const petalEdge = bouncy ? 0xb0758c : 0x9dbfa4;
      for (let i = 0; i < 6; i++) {
        const petal = scene.add.ellipse(0, -16, 26, 38, petalColor);
        petal.setRotation((Math.PI * 2 * i) / 6);
        petal.setStrokeStyle(2, petalEdge, 0.9);
        petals.add(petal);
      }
      const center = scene.add
        .circle(0, 0, 15, bouncy ? 0xe8b04c : 0xe6cf97)
        .setStrokeStyle(2, 0x8a6d3b, 0.8);
      petals.add(center);
      children.push(stem, petals);
    }

    this.display.add(children);
    // 容器基准缩放 = (1,1)：子元素（立绘/花簇）已按身高定尺寸，
    // 压扁/回弹都以容器 (x, groundY+10) 根部为锚缩放——塌向地面不悬空
    this.base = { x: 1, y: 1 };

    // 待机微摇：只给弹跳花（普通花摇/压会误导"能弹"的预期）
    if (bouncy) {
      this.startSway(scene);
    }
  }

  /** 弹跳花待机微摇（squash 的 killTweensOf 会连它一起杀掉，压扁后需重启） */
  private startSway(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.display,
      angle: { from: -2, to: 2 },
      duration: 2400 + ((this.x * 7) % 900),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 物理触感①：踩住/离开。站住时整株保持 7% 下沉（花头随之下沉），
   *  离开后 Back.easeOut 过冲回弹——弹簧的压→弹读法。弹跳花走 squash。 */
  setPressed(pressed: boolean, scene: Phaser.Scene): void {
    if (this.bouncy || this.pressed === pressed) {
      return;
    }
    this.pressed = pressed;
    scene.tweens.killTweensOf(this.display);
    if (pressed) {
      this.display.setScale(this.base.x, this.base.y * 0.93);
    } else {
      scene.tweens.add({
        targets: this.display,
        scaleX: this.base.x,
        scaleY: this.base.y,
        duration: 430,
        ease: 'Back.easeOut',
      });
    }
  }

  /** 物理触感②：落上瞬间的深压脉冲（比踩住的稳态更深，随回弹立起） */
  pressPulse(scene: Phaser.Scene): void {
    if (this.bouncy) {
      return;
    }
    scene.tweens.killTweensOf(this.display);
    this.display.setScale(this.base.x, this.base.y * 0.88);
    scene.tweens.add({
      targets: this.display,
      scaleX: this.base.x,
      scaleY: this.base.y * (this.pressed ? 0.93 : 1),
      duration: 320,
      ease: 'Back.easeOut',
    });
  }

  /** 被踩（弹跳花）：花簇压扁回弹 */
  squash(scene: Phaser.Scene): void {
    if (!this.bouncy) {
      return;
    }
    scene.tweens.killTweensOf(this.display);
    this.display.setScale(this.base.x * 1.15, this.base.y * 0.55);
    scene.tweens.add({
      targets: this.display,
      scaleX: this.base.x,
      scaleY: this.base.y,
      duration: 450,
      ease: 'Elastic.easeOut',
      onComplete: () => this.startSway(scene),
    });
  }
}
