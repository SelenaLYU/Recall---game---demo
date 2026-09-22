import Phaser from 'phaser';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
// 第一个场景：开始画面
class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    this.cameras.main.setBackgroundColor('#15251f');

    this.add.text(480, 170, 'RECALL', {
      fontSize: '64px',
      color: '#e6cf97',
    }).setOrigin(0.5);

    this.add.text(480, 250, '2D 解谜冒险 Demo', {
      fontSize: '22px',
      color: '#d3ddd5',
    }).setOrigin(0.5);

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

    back.once('pointerdown', () => {
      this.scene.start('forest');
    });
  }
}

// 把游戏放进 index.html 中的 game 区域
document.getElementById('game')!.style.height = '100vh';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // 高分屏按设备像素比放大渲染缓冲（上限 2x）：逻辑坐标仍是 960×540，
    // 但画布实际按 2 倍绘制，FIT 拉伸不再发虚（AGENTS.md 第 6 节）
    zoom: Math.min(window.devicePixelRatio || 1, 2),
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  scene: [MenuScene, IntroScene, ForestScene, RoomScene, EndingScene],
});