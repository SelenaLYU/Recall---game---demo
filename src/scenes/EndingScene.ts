import Phaser from 'phaser';
import { playMenuRoomMusic } from '../MenuRoomMusic';

export default class EndingScene extends Phaser.Scene {
  constructor() {
    super('ending');
  }

  create() {
    this.cameras.main.setBackgroundColor('#10151c');

    const title = this.add.text(480, 190, '结尾动画', {
      fontSize: '36px',
      color: '#e6cf97',
    }).setOrigin(0.5);

    const subtitle = this.add.text(480, 270, '动画占位画面', {
      fontSize: '22px',
      color: '#b8c2cc',
    }).setOrigin(0.5);

    const button = this.add.text(480, 390, '跳过动画', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#3a624d',
      padding: { x: 24, y: 14 },
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    let finished = false;

    const finishEnding = () => {
      if (finished) return;
      finished = true;

      // 结尾动画（目前为占位计时）结束或跳过后，感谢页面才播放音乐。
      playMenuRoomMusic(this);

      title.setText('感谢游玩');
      subtitle.setText('RECALL · Demo 到此结束');
      button.setText('返回开始');
    };

    // 暂时用 3 秒模拟动画，之后替换为视频播放结束事件
    this.time.delayedCall(3000, finishEnding);

    button.on('pointerdown', () => {
      if (finished) {
        this.scene.start('menu');
      } else {
        finishEnding();
      }
    });
  }
}
