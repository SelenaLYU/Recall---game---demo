import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';

export default class RoomScene extends Phaser.Scene {
  constructor() {
    super('room');
  }

  create() {
    applyHDCamera(this);
    // 房间墙壁
    this.cameras.main.setBackgroundColor('#302b36');

    this.add.text(480, 80, '记忆房间', {
      fontSize: '36px',
      color: '#e6cf97',
    }).setOrigin(0.5);

    // 房间地板
    this.add.rectangle(480, 470, 960, 140, 0x695146);

    // 角色占位
    this.add.rectangle(180, 370, 28, 60, 0xe6cf97);

    // 仅在开发预览中显示测试按钮
    if (import.meta.env.DEV) {
      const button = this.add.text(750, 80, '测试：进入结尾', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#695146',
        padding: { x: 16, y: 12 },
      }).setOrigin(0.5);

      button.setInteractive({ useHandCursor: true });

      button.once('pointerdown', () => {
        this.scene.start('ending');
      });
    }
  }
}