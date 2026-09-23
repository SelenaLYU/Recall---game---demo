import Phaser from 'phaser';
import { createMenuMemoryBackground } from './MenuMemoryBackground';
import IntroScene from './scenes/IntroScene';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
import { preloadMenuRoomMusic, playMenuRoomMusic } from './MenuRoomMusic';
import { BASE_WIDTH, BASE_HEIGHT, HD_SCALE, applyHDCamera, computeBufferScale } from './systems/Resolution';
import menuBackgroundUrl from '../assets/ui/menu-opening-background.png?url';
import menuTitleUrl from '../assets/ui/menu-opening-title.png?url';
import menuButtonUrl from '../assets/ui/menu-opening-button.png?url';
import menuHelpUrl from '../assets/ui/menu-opening-help.png?url';

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
    this.load.image('ui-menu-title', menuTitleUrl);
    this.load.image('ui-menu-button', menuButtonUrl);
    this.load.image('ui-menu-help', menuHelpUrl);
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

    // A 的开屏素材是分层图片；文字和按钮仍由游戏绘制，确保可点击、可改文案。
    this.add.rectangle(480, 270, 960, 540, 0x091c16, 0.17);
    this.add.text(480, 105, '✦  一段关于陪伴、记忆与重逢的故事  ✦', {
      fontFamily: 'serif', fontSize: '17px', color: '#fff9e8',
    }).setOrigin(0.5).setShadow(0, 2, '#10221a', 5, false, true);
    this.add.image(480, 188, 'ui-menu-title').setDisplaySize(540, 180);
    this.add.text(480, 275, '有些想念，没有回音。\n却一直，在风里等你。', {
      fontFamily: 'serif', fontSize: '18px', color: '#fff9e8',
      align: 'center', lineSpacing: 4,
    }).setOrigin(0.5).setShadow(0, 2, '#10221a', 5, false, true);

    let helpPanel: Phaser.GameObjects.Container | undefined;
    const closeHelp = () => {
      helpPanel?.destroy();
      helpPanel = undefined;
    };
    const addMenuButton = (y: number, label: string, width: number, action: () => void) => {
      const button = this.add.container(480, y);
      const image = this.add.image(0, 0, 'ui-menu-button').setDisplaySize(width, width / 2.98);
      const text = this.add.text(10, 1, label, {
        fontFamily: 'serif', fontSize: width > 300 ? '26px' : '21px',
        color: '#203d34', letterSpacing: 3,
      }).setOrigin(0.5);
      const hit = this.add.zone(0, 0, width * 0.72, 54)
        .setInteractive({ useHandCursor: true });
      button.add([image, text, hit]);
      hit.on('pointerover', () => this.tweens.add({ targets: button, scale: 1.035, duration: 130 }));
      hit.on('pointerout', () => this.tweens.add({ targets: button, scale: 1, duration: 130 }));
      hit.on('pointerup', action);
      return button;
    };
    const startGame = () => {
      if (!helpPanel) this.scene.start('intro');
    };
    const showHelp = () => {
      if (helpPanel) return;
      helpPanel = this.add.container(480, 270).setDepth(100);
      const veil = this.add.rectangle(0, 0, 960, 540, 0x071610, 0.65)
        .setInteractive();
      const panel = this.add.image(0, 0, 'ui-menu-help').setDisplaySize(800, 455);
      const heading = this.add.text(0, -167, '操作说明', {
        fontFamily: 'serif', fontSize: '35px', color: '#1c4033',
      }).setOrigin(0.5);
      const intro = this.add.text(0, -120, '先熟悉脚步，再循着微光向前。', {
        fontFamily: 'serif', fontSize: '17px', color: '#41564c',
      }).setOrigin(0.5);
      const instructions = [
        ['行走', 'A / D 或 ← / →', '跳跃', '空格；空中再按一次可二段跳'],
        ['摆荡', '靠近藤蔓自动抓住，A / D 摆动', '攀爬', 'W / S 沿藤蔓移动，空格松手'],
      ];
      const rows: Phaser.GameObjects.Text[] = [];
      instructions.forEach((row, index) => {
        const y = -53 + index * 86;
        rows.push(this.add.text(-300, y, row[0], { fontFamily: 'serif', fontSize: '21px', color: '#193d31' }));
        rows.push(this.add.text(-300, y + 30, row[1], { fontSize: '14px', color: '#3c5146' }));
        rows.push(this.add.text(65, y, row[2], { fontFamily: 'serif', fontSize: '21px', color: '#193d31' }));
        rows.push(this.add.text(65, y + 30, row[3], { fontSize: '14px', color: '#3c5146' }));
      });
      const outro = this.add.text(0, 134, '找到钥匙，让记忆中的门再次出现。', {
        fontFamily: 'serif', fontSize: '16px', color: '#41564c',
      }).setOrigin(0.5);
      const close = this.add.text(0, 177, '知道了', {
        fontFamily: 'serif', fontSize: '21px', color: '#17392e',
        backgroundColor: '#e3ebde', padding: { x: 34, y: 7 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      close.on('pointerup', closeHelp);
      helpPanel.add([veil, panel, heading, intro, ...rows, outro, close]);
    };
    addMenuButton(352, '开始游戏', 360, startGame);
    addMenuButton(420, '操作说明', 285, showHelp);
    this.add.text(480, 500, '✦  Enter 开始旅程 · H 操作说明  ✦', {
      fontFamily: 'serif', fontSize: '14px', color: '#f8f4e5',
    }).setOrigin(0.5).setShadow(0, 2, '#10221a', 5, false, true);

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-ENTER', startGame);
    keyboard?.on('keydown-H', showHelp);
    keyboard?.on('keydown-ESC', closeHelp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown-ENTER', startGame);
      keyboard?.off('keydown-H', showHelp);
      keyboard?.off('keydown-ESC', closeHelp);
    });
  }
}

// 把游戏放进 index.html 中的 game 区域（容器尺寸由 CSS 铺满视口，勿用 JS 设高度）

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 初始渲染缓冲按设备像素比放大（上限 2x）；boot 后立即按画布实际 CSS 尺寸校准，
  // 之后随窗口变化动态调整（见下方 syncRenderBuffer）——缓冲与屏幕设备像素 1:1，
  // 浏览器不再放大画布，这是清晰度的根治点。scale.zoom 在 FIT 模式下不生效，勿改回。
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

/** 渲染缓冲 = 画布 CSS 宽 × 设备像素比（960..3840，16:9 恒定，FIT 等比不变） */
const syncRenderBuffer = () => {
  const cssWidth = game.scale.canvasBounds.width || game.scale.parentSize.width;
  const width = Math.round(BASE_WIDTH * computeBufferScale(cssWidth));
  const height = Math.round((width * BASE_HEIGHT) / BASE_WIDTH);
  if (game.scale.gameSize.width !== width) {
    game.scale.setGameSize(width, height);
  }
};
game.events.once(Phaser.Core.Events.READY, syncRenderBuffer);
// 窗口缩放防抖校准；setGameSize 引发的二次 RESIZE 会算出相同尺寸而空转，无振荡
let syncBufferTimer: number | undefined;
game.scale.on(Phaser.Scale.Events.RESIZE, () => {
  window.clearTimeout(syncBufferTimer);
  syncBufferTimer = window.setTimeout(syncRenderBuffer, 150);
});
