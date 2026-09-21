import Phaser from 'phaser';

export default class ForestScene extends Phaser.Scene {
  constructor() {
    super('forest');
  }

  create() {
    this.cameras.main.setBackgroundColor('#17382b');

    this.add.text(480, 80, '森林', {
      fontSize: '36px',
      color: '#e6cf97',
    }).setOrigin(0.5);

    // 地面
    this.add.rectangle(480, 470, 960, 140, 0x365344);

    // 角色占位
    this.add.rectangle(180, 370, 28, 60, 0xe6cf97);

    // 仅在开发预览中显示测试按钮
    if (import.meta.env.DEV) {
      const button = this.add.text(750, 80, '测试：进入房间', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#3a624d',
        padding: { x: 16, y: 12 },
      }).setOrigin(0.5);

      button.setInteractive({ useHandCursor: true });

      button.once('pointerdown', () => {
        this.scene.start('room');
      });
    }
  }
}