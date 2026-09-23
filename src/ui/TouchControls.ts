import Phaser from 'phaser';
import { bufferScaleOf } from '../systems/Resolution';

export interface TouchInputSink {
  setMove(dir: -1 | 0 | 1): void;
  pressJump(held: boolean): void;
}

export interface TouchControlsHandle {
  destroy(): void;
}

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
  return c;
}

/**
 * 手机版触摸控制：左下 ◀ ▶ 方向键 + 右下 ⤒ 跳跃键。
 * 仅在粗指针设备（触摸屏）显示——桌面完全无感；挂在 scrollFactor 0 层，
 * 随渲染缓冲重缩放（与 hudLayer 同约定）。跳跃走 Player 的跳跃缓冲通路，
 * 空中再按同样触发二段跳。
 */
export function createTouchControls(
  scene: Phaser.Scene,
  sink: TouchInputSink,
): TouchControlsHandle {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) {
    return { destroy() {} };
  }

  const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(120);
  const sync = () => layer.setScale(bufferScaleOf(scene));
  sync();
  scene.scale.on(Phaser.Scale.Events.RESIZE, sync);
  const onShutdown = () => destroy();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);

  const leftBtn = roundButton(scene, 76, 470, '◀');
  const rightBtn = roundButton(scene, 178, 470, '▶');
  const jumpBtn = roundButton(scene, 880, 462, '⤒');
  layer.add([leftBtn, rightBtn, jumpBtn]);

  const bindHold = (
    btn: Phaser.GameObjects.Container,
    onDown: () => void,
    onUp: () => void,
  ): void => {
    btn.setInteractive({ useHandCursor: false });
    btn.on('pointerdown', () => {
      onDown();
      scene.tweens.add({ targets: btn, alpha: 0.75, duration: 70 });
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
