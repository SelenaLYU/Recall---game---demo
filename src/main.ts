import Phaser from 'phaser';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
import { preloadMenuRoomMusic, playMenuRoomMusic } from './MenuRoomMusic';
import { BASE_WIDTH, BASE_HEIGHT, HD_SCALE, applyHDCamera } from './systems/Resolution';
// 第一个场景：开始画面
class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  preload() {
    preloadMenuRoomMusic(this);
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

    this.add.text(480, 170, 'RECALL', {
      fontSize: '64px',
      color: '#e6cf97',
    }).setOrigin(0.5);

    this.add.text(480, 250, '2D 解谜冒险 Demo', {
      fontSize: '22px',
      color: '#d3ddd5',
    }).setOrigin(0.5);
    this.add.text(480, 440, [
      '移动：A / D 或 ← / →　跳跃：空格，空中可再跳一次',
      '空中靠近藤蔓自动抓住：A / D 摆荡，W / S 攀爬，空格松手',
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

    const button = this.add.text(480, 360, '开始游戏', {
      fontSize: '28px',
      color: '#ffffff',
      backgroundColor: '#3a624d',
      padding: { x: 32, y: 16 },
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => {
      button.setBackgroundColor('#507f63');
    });

    button.on('pointerout', () => {
      button.setBackgroundColor('#3a624d');
    });

    button.once('pointerdown', () => {
      this.scene.start('intro');
    });
  }
}

// 第二个场景：先为开场动画留出位置
class IntroScene extends Phaser.Scene {
  constructor() {
    super('intro');
  }

  create() {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#10151c');

    this.add.text(480, 230, '开场动画', {
      fontSize: '36px',
      color: '#e6cf97',
    }).setOrigin(0.5);

    this.add.text(480, 295, '动画占位画面', {
      fontSize: '20px',
      color: '#b8c2cc',
    }).setOrigin(0.5);

    const back = this.add.text(480, 420, '进入森林', {
      fontSize: '22px',
      color: '#ffffff',
      padding: { x: 16, y: 12 },
    }).setOrigin(0.5);

        back.setInteractive({ useHandCursor: true });

        // 避免按钮和计时器重复切换场景
    let leaving = false;

    const enterForest = () => {
      if (leaving) return;
      leaving = true;
      this.scene.start('forest');
    };

    // 暂时用 3 秒等待模拟动画，之后改成视频播完再进入
    this.time.delayedCall(3000, enterForest);

    back.once('pointerdown', enterForest);
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
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  scene: [MenuScene, IntroScene, ForestScene, RoomScene, EndingScene],
});
