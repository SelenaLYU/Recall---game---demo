import Phaser from 'phaser';
import { createMenuMemoryBackground } from './MenuMemoryBackground';
import IntroScene from './scenes/IntroScene';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
import { preloadMenuRoomMusic, playMenuRoomMusic } from './MenuRoomMusic';
import { BASE_WIDTH, BASE_HEIGHT, HD_SCALE, applyHDCamera } from './systems/Resolution';
import menuBackgroundUrl from '../assets/environment/森林花海_原场景清晰化_无坡_1920x1080_v2.png?url';
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

    createMenuMemoryBackground(this);

    // 轻压暗背景，并为操作说明加底色，让文字在花海上仍然清楚。
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0b1712, 0.22)
      .setDepth(-19);
    this.add.rectangle(480, 484, 860, 104, 0x10251d, 0.65)
      .setDepth(-18);

    this.add.text(480, 170, 'RECALL', {
      fontSize: '64px',
      color: '#e6cf97',
    }).setOrigin(0.5).setShadow(0, 2, '#0b1712', 6, false, true);

    this.add.text(480, 250, '2D 解谜冒险 Demo', {
      fontSize: '22px',
      color: '#d3ddd5',
    }).setOrigin(0.5).setShadow(0, 2, '#0b1712', 4, false, true);
    // 菜单只保留简短操作说明；藤蔓/花朵操作在森林内按区域提示
    this.add.text(480, 446, [
      '移动：A / D 或 ← / →　　跳跃：空格（空中可再跳）',
      '开始与爷爷的记忆之旅吧',
    ], {
      fontSize: '16px',
      color: '#b8c2cc',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5, 0);

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

    // 开始按钮组件：圆角底板 + 悬停金边/微放大 + 按压回弹
    const button = this.add.container(480, 360);
    const plate = this.add
      .rectangle(0, 0, 224, 64, 0x3a624d, 1)
      .setStrokeStyle(2, 0x2c4a3a, 1)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, '开始游戏', { fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5);
    button.add([plate, label]);

    plate.on('pointerover', () => {
      plate.setStrokeStyle(2, 0xe6cf97, 1);
      this.tweens.add({ targets: button, scale: 1.04, duration: 120, ease: 'Quad.easeOut' });
    });
    plate.on('pointerout', () => {
      plate.setStrokeStyle(2, 0x2c4a3a, 1);
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

// 把游戏放进 index.html 中的 game 区域
document.getElementById('game')!.style.height = '100vh';

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
