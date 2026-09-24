import Phaser from 'phaser';
import { bufferScaleOf } from '../systems/Resolution';

export interface TouchInputSink {
  setMove(dir: -1 | 0 | 1): void;
  pressJump(held: boolean): void;
}

export interface TouchControlsHandle {
  destroy(): void;
}

/** 按钮命中半径（手指友好 ≥48px，Phaser 输入用显式 Circle hitArea） */
const HIT_RADIUS = 46;

/** 半透明圆形屏幕按钮（◀ ▶ ⤒） */
function roundButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const disc = scene.add.circle(0, 0, 34, 0x10241c, 0.55).setStrokeStyle(2, 0xe6cf97, 0.55);
  const text = scene.add
    .text(0, -2, label, { fontFamily: 'sans-serif', fontSize: '26px', color: '#f0dfb5' })
    .setOrigin(0.5);
  c.add([disc, text]);
  // 命中区大于可视圆（手指精度），显式 Circle hitArea 绑在容器上
  c.setInteractive(
    new Phaser.Geom.Circle(0, 0, HIT_RADIUS),
    Phaser.Geom.Circle.Contains,
  );
  return c;
}

/** 粗指针（触摸屏）检测：matchMedia + maxTouchPoints 双兜底 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  );
}

/**
 * 手机版触摸控制：左下 ◀ ▶ 方向键 + 右下 ⤒ 跳跃键。
 * 依赖 main.ts 的 `input.activePointers ≥ 2`（Phaser 默认 1，按住方向同时
 * 点跳跃的第二个触摸会被忽略）；画布 `touch-action:none`（index.html）挡掉
 * 浏览器手势。跳跃走 Player 的跳跃缓冲通路，空中再按触发二段跳。
 * 仅触摸设备显示——桌面完全无感。
 */
export function createTouchControls(
  scene: Phaser.Scene,
  sink: TouchInputSink,
): TouchControlsHandle {
  if (!isTouchDevice()) {
    return { destroy() {} };
  }

  const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(120);
  const sync = () => layer.setScale(bufferScaleOf(scene));
  sync();
  scene.scale.on(Phaser.Scale.Events.RESIZE, sync);
  const onShutdown = () => destroy();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);

  const leftBtn = roundButton(scene, 78, 468, '◀');
  const rightBtn = roundButton(scene, 182, 468, '▶');
  const jumpBtn = roundButton(scene, 878, 460, '⤒');
  layer.add([leftBtn, rightBtn, jumpBtn]);

  const bindHold = (
    btn: Phaser.GameObjects.Container,
    onDown: () => void,
    onUp: () => void,
  ): void => {
    btn.on('pointerdown', () => {
      onDown();
      scene.tweens.add({ targets: btn, alpha: 0.7, duration: 60 });
    });
    const release = () => {
      onUp();
      scene.tweens.add({ targets: btn, alpha: 1, duration: 90 });
    };
    btn.on('pointerup', release);
    btn.on('pointerout', release);
    btn.on('pointerupoutside', release);
  };

  bindHold(leftBtn, () => sink.setMove(-1), () => sink.setMove(0));
  bindHold(rightBtn, () => sink.setMove(1), () => sink.setMove(0));
  bindHold(jumpBtn, () => sink.pressJump(true), () => sink.pressJump(false));

  function destroy(): void {
    scene.scale.off(Phaser.Scale.Events.RESIZE, sync);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    layer.destroy(true);
  }

  return { destroy };
}
