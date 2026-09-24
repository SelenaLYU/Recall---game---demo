import Phaser from 'phaser';
import { playMenuRoomMusic } from '../MenuRoomMusic';
import { applyHDCamera } from '../systems/Resolution';
import endingButtonUrl from '../../assets/ui/ui-memory-jasmine-ending-button-256x256-3state.png?url';

export default class EndingScene extends Phaser.Scene {
  constructor() {
    super('ending');
  }

  preload(): void {
    // A 的结尾三态按钮（普通/悬停/按下，768×256 三帧）；重玩不重复加载
    if (!this.textures.exists('ui-ending-button')) {
      this.load.spritesheet('ui-ending-button', endingButtonUrl, {
        frameWidth: 256,
        frameHeight: 256,
      });
    }
  }

  create() {
    applyHDCamera(this);
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

      // 文字按钮退役，A 的茉莉圆章（三态：普通/悬停/按下）接棒"返回开始"
      button.disableInteractive();
      this.tweens.add({
        targets: button,
        alpha: 0,
        duration: 250,
        onComplete: () => button.setVisible(false),
      });

      if (this.textures.exists('ui-ending-button')) {
        const medal = this.add.image(480, 396, 'ui-ending-button', 0)
          .setDisplaySize(104, 104)
          .setAlpha(0)
          .setInteractive({ useHandCursor: true });
        medal.on('pointerover', () => medal.setFrame(1));
        medal.on('pointerout', () => medal.setFrame(0));
        medal.on('pointerdown', () => medal.setFrame(2));
        medal.on('pointerup', () => {
          medal.setFrame(1);
          this.scene.start('menu');
        });
        this.tweens.add({
          targets: medal,
          alpha: 1,
          scale: { from: 0.7, to: 1 },
          duration: 450,
          delay: 200,
          ease: 'Back.easeOut',
        });
        const medalLabel = this.add.text(480, 478, '返回开始', {
          fontSize: '15px',
          color: '#d9c48f',
        }).setOrigin(0.5).setAlpha(0)
          .setInteractive({ useHandCursor: true })
          .on('pointerup', () => this.scene.start('menu'));
        this.tweens.add({ targets: medalLabel, alpha: 1, duration: 450, delay: 350 });
      } else {
        // 无贴图回退：保留文字按钮
        button.setVisible(true);
        button.setText('返回开始');
        button.setInteractive({ useHandCursor: true });
        button.on('pointerdown', () => this.scene.start('menu'));
      }
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
