import Phaser from 'phaser';
import { createMenuMemoryBackground } from './MenuMemoryBackground';
import IntroScene from './scenes/IntroScene';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
import { preloadMenuRoomMusic, playMenuRoomMusic } from './MenuRoomMusic';
import { BASE_WIDTH, BASE_HEIGHT, HD_SCALE, applyHDCamera } from './systems/Resolution';
import menuBackgroundUrl from '../assets/environment/森林花海_原场景清晰化_无坡_1920x1080_v2.png?url';

/** FIT 信箱区颜色 = 各场景自己的背景色（index.html body 有 0.45s 过渡） */
const SCENE_LETTERBOX: Record<string, string> = {
  menu: '#15251f',
  intro: '#000000',
  forest: '#17382b',
  room: '#131a16',
  ending: '#10151c',
};
/** 模块级引用：off/on 才能真正去重（与房间音乐的接法同款） */
const syncLetterbox = new Map<string, () => void>(
  Object.entries(SCENE_LETTERBOX).map(([key, color]) => [
    key,
    () => {
      document.body.style.backgroundColor = color;
    },
  ]),
);
// 第一个场景：开始画面
class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  preload() {
    preloadMenuRoomMusic(this);
    this.load.image('ui-menu-background', menuBackgroundUrl);
  }

  create() {
    playMenuRoomMusic(this);

    // 由整合入口接入房间音乐，C 无需修改解谜代码。
    // 返回菜单时先移除同一回调，避免重复注册。
    const room = this.scene.get('room');
    room.events.off(Phaser.Scenes.Events.CREATE, playMenuRoomMusic);
    room.events.on(Phaser.Scenes.Events.CREATE, playMenuRoomMusic);

    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#15251f');

    // 信箱区颜色随场景同步：FIT 的等比留边读作"场景的延伸"，不再是固定的突兀底色
    //（菜单是最早启动的场景，这里统一登记；off/on + 模块级引用防重玩叠加）
    for (const [key, sync] of syncLetterbox) {
      const target = this.scene.get(key);
      target.events.off(Phaser.Scenes.Events.CREATE, sync);
      target.events.on(Phaser.Scenes.Events.CREATE, sync);
    }

    createMenuMemoryBackground(this);

    // 阅读区：顶部向下渐隐的暗带——标题和按钮在亮花海上有稳定落点，花海仍在画面下方呼吸
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0b1712, 0.18)
      .setDepth(-19);
    const band = this.add.graphics().setDepth(-18);
    band.fillGradientStyle(0x0b1712, 0x0b1712, 0x0b1712, 0x0b1712, 0.5, 0.5, 0, 0);
    band.fillRect(0, 0, BASE_WIDTH, 340);

    this.add.text(480, 170, 'RECALL', {
      fontSize: '64px',
      color: '#e6cf97',
    }).setOrigin(0.5).setShadow(0, 2, '#0b1712', 6, false, true);

    // 一句与回忆有关的文案（操作说明不放在启动页，由森林第一区的区域提示承担）
    this.add.text(480, 250, '把和外公的回忆，一片片找回来', {
      fontSize: '20px',
      color: '#d3ddd5',
    }).setOrigin(0.5).setShadow(0, 2, '#0b1712', 4, false, true);

    if (this.sound.locked) {
      const musicHint = this.add.text(480, 520, '点击页面空白处开启音乐', {
        fontSize: '14px',
        color: '#b8c2cc',
      }).setOrigin(0.5);
      const hideMusicHint = () => musicHint.destroy();
      this.sound.once(Phaser.Sound.Events.UNLOCKED, hideMusicHint);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.sound.off(Phaser.Sound.Events.UNLOCKED, hideMusicHint);
      });
    }

    // 开始按钮组件：深底 + 金字 + 金边（全页唯一的视觉语言：金色=回忆/发光物）
    const button = this.add.container(480, 360);
    const plate = this.add
      .rectangle(0, 0, 236, 64, 0x1d332a, 1)
      .setStrokeStyle(2, 0xe6cf97, 0.85)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, '开始回忆', { fontSize: '26px', color: '#f0dfb5' })
      .setOrigin(0.5);
    button.add([plate, label]);

    plate.on('pointerover', () => {
      plate.setStrokeStyle(3, 0xf6e7b8, 1);
      this.tweens.add({ targets: button, scale: 1.04, duration: 120, ease: 'Quad.easeOut' });
    });
    plate.on('pointerout', () => {
      plate.setStrokeStyle(2, 0xe6cf97, 0.85);
      this.tweens.add({ targets: button, scale: 1, duration: 120, ease: 'Quad.easeOut' });
    });
    plate.on('pointerdown', () => {
      this.tweens.add({ targets: button, scale: 0.96, duration: 70 });
    });
    // 按压后在按钮区域外松开同样视为点击，避免卡在按压态
    const startGame = () => {
      this.scene.start('intro');
    };
    plate.once('pointerup', startGame);
    plate.once('pointerupoutside', startGame);
  }
}

// 把游戏放进 index.html 中的 game 区域（容器尺寸由 CSS 铺满视口，勿用 JS 设高度）

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 渲染缓冲按设备像素比放大（上限 2x）：逻辑坐标仍是 960×540（相机 zoom 反向缩放），
  // 高分屏上不再被浏览器拉伸发糊。scale.zoom 在 FIT 模式下不生效，勿改回（实测）。
  width: Math.round(BASE_WIDTH * HD_SCALE),
  height: Math.round(BASE_HEIGHT * HD_SCALE),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true, // CSS 位置取整，避免半像素模糊
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  scene: [MenuScene, IntroScene, ForestScene, RoomScene, EndingScene],
});
