import Phaser from 'phaser';

/**
 * 高清渲染：画布渲染缓冲按设备像素比放大（上限 2 倍），相机 zoom 反向缩小，
 * 世界逻辑坐标保持 960×540 不变。Phaser 3.90 的 scale.zoom 在 FIT 模式下不生效
 * （实测 canvas.width 仍为 960），因此用「大画布 + 相机 zoom」实现，效果等价。
 *
 * 每个场景的 create() 里调用 applyHDCamera(this)；有相机跟随的场景在 startFollow
 * 之后滚动由跟随接管，zoom 设置依然生效。
 */
export const BASE_WIDTH = 960;
export const BASE_HEIGHT = 540;
export const HD_SCALE = Math.min(window.devicePixelRatio || 1, 2);

export function applyHDCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(HD_SCALE);
  scene.cameras.main.centerOn(BASE_WIDTH / 2, BASE_HEIGHT / 2);
}
