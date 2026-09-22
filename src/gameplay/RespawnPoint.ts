import Phaser from 'phaser';
import { Effects } from './Effects';

/**
 * 重生点：碰到即激活（点亮），之后掉出地图回到这里，钥匙等进度保留。
 * 死亡不再整关重来。
 */
export class RespawnPoint {
  readonly x: number;
  readonly y: number;
  active = false;

  private readonly glow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, x: number, baseY: number) {
    this.x = x;
    this.y = baseY - 40;

    const stone = scene.add
      .rectangle(x, baseY - 13, 16, 26, 0x5c6e64)
      .setOrigin(0.5, 1)
      .setStrokeStyle(2, 0x11251d, 0.6)
      .setDepth(2);
    this.glow = scene.add.ellipse(x, baseY - 16, 34, 44, 0xe6cf97, 0.12).setDepth(1);

    // 待机呼吸（未激活时极弱）
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.06, to: 0.14 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 直接激活（用于起点这类默认重生点） */
  activateNow(scene: Phaser.Scene): void {
    if (!this.active) {
      this.active = true;
      this.lightUp(scene);
    }
  }

  /** 玩家靠近则激活；返回是否刚刚激活 */
  tryActivate(scene: Phaser.Scene, playerX: number, playerY: number): boolean {
    if (this.active) {
      return false;
    }
    if (Math.abs(playerX - this.x) < 44 && Math.abs(playerY - this.y) < 90) {
      this.active = true;
      this.lightUp(scene);
      Effects.ring(scene, this.x, this.y);
      Effects.sparkBurst(scene, this.x, this.y, 8);
      return true;
    }
    return false;
  }

  private lightUp(scene: Phaser.Scene): void {
    scene.tweens.killTweensOf(this.glow);
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.1, to: 0.45 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
