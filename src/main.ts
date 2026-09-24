import Phaser from 'phaser';
import { createMenuMemoryBackground } from './MenuMemoryBackground';
import IntroScene from './scenes/IntroScene';
import ForestScene from './scenes/ForestScene';
import RoomScene from './scenes/RoomScene';
import EndingScene from './scenes/EndingScene';
import { preloadMenuRoomMusic, playMenuRoomMusic } from './MenuRoomMusic';
import { BASE_WIDTH, BASE_HEIGHT, applyHDCamera, computeBufferScale, initialBufferSize } from './systems/Resolution';
import menuBackgroundUrl from '../assets/ui/menu-opening-background.png?url';
import menuTitleUrl from '../assets/ui/menu-opening-title.png?url';
import menuButtonUrl from '../assets/ui/menu-opening-button.png?url';
import adventureNoteUrl from '../assets/ui/adventure-note.png?url';

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
    this.load.image('ui-adventure-note', adventureNoteUrl);
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
    this.add.image(480, 188, 'ui-menu-title').setDisplaySize(540, 180);
    this.add.text(480, 276, '一段关于陪伴、记忆与重逢的故事', {
      fontFamily: 'serif', fontSize: '17px', color: '#fff9e8', letterSpacing: 7,
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
      // A 的整张说明图已包含标题、键帽和文案；等比显示，避免重复叠字。
      const panel = this.add.image(0, 0, 'ui-adventure-note').setName('adventure-note-panel');
      panel.setScale(Math.min(BASE_WIDTH / panel.width, BASE_HEIGHT / panel.height));
      helpPanel.add([veil, panel]);

      // 热区以图片宽高的比例定位，窗口缩放后仍对齐图中的两个关闭入口。
      const addCloseArea = (name: string, x: number, y: number, width: number, height: number) => {
        const area = this.add.zone(
          (x - 0.5) * panel.displayWidth,
          (y - 0.5) * panel.displayHeight,
          width * panel.displayWidth,
          height * panel.displayHeight,
        ).setName(name).setInteractive({ useHandCursor: true });
        area.on('pointerup', closeHelp);
        helpPanel!.add(area);
      };
      addCloseArea('adventure-note-close', 0.861, 0.137, 0.045, 0.08);
      addCloseArea('adventure-note-return', 0.5, 0.882, 0.205, 0.085);
    };
    addMenuButton(350, '开始游戏', 360, startGame);
    addMenuButton(420, '冒险小纸条', 260, showHelp);
    this.add.text(480, 500, '✦  Enter 开始旅程 · H 冒险小纸条  ✦', {
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

const initialBuffer = initialBufferSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 初始缓冲在 boot 前就按窗口宽 × dpr 算好（#game 铺满视口）——游戏从第一帧
  // 就是 1:1 设备像素，不再有"先 1920、READY 后再校准"的首帧跳变。
  // 之后随窗口/dpr 变化动态调整（见下方 syncRenderBuffer）。
  // scale.zoom 在 FIT 模式下不生效，勿改回。
  width: initialBuffer.width,
  height: initialBuffer.height,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true, // CSS 位置取整，避免半像素模糊
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  scene: [MenuScene, IntroScene, ForestScene, RoomScene, EndingScene],
});

/** 渲染缓冲 = 画布 CSS 宽 × 设备像素比（960..3840，16:9 恒定，FIT 等比不变）。
 *  宽度实时读 getBoundingClientRect——scale.canvasBounds 是 REFRESH 时才更新的缓存，
 *  连续拖动窗口时防抖执行点读到的常是上一档尺寸，缓冲会停在旧值（实测 950 窗口停在 1000）。 */
const syncRenderBuffer = () => {
  const cssWidth =
    game.canvas?.getBoundingClientRect().width || game.scale.canvasBounds.width ||
    game.scale.parentSize.width;
  const width = Math.round(BASE_WIDTH * computeBufferScale(cssWidth));
  const height = Math.round((width * BASE_HEIGHT) / BASE_WIDTH);
  if (game.scale.gameSize.width !== width) {
    game.scale.setGameSize(width, height);
  }
};
game.events.once(Phaser.Core.Events.READY, syncRenderBuffer);
// 窗口缩放防抖校准；setGameSize 引发的二次 RESIZE 会算出相同尺寸而空转，无振荡。
// 除 Scale RESIZE 外再挂原生 window resize：浏览器缩放（Ctrl ±）/ dpr 变化只改
// devicePixelRatio 与 innerWidth，不一定发 Scale RESIZE——实测 CDP 改 dpr=2 时
// 缓冲停在旧值，Retina 上画面整块被拉伸发糊，必须原生事件兜底。
let syncBufferTimer: number | undefined;
const queueSyncBuffer = () => {
  window.clearTimeout(syncBufferTimer);
  syncBufferTimer = window.setTimeout(syncRenderBuffer, 150);
};
game.scale.on(Phaser.Scale.Events.RESIZE, queueSyncBuffer);
window.addEventListener('resize', queueSyncBuffer);
// 跨屏拖动（Retina ↔ 外接屏）只改 devicePixelRatio、innerWidth 可能不变也不发
// resize——用分辨率媒体查询变化兜底重算缓冲（dpr 变了就换下一个查询）
const watchDpr = () => {
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onChange = () => {
    query.removeEventListener('change', onChange);
    queueSyncBuffer();
    watchDpr();
  };
  query.addEventListener('change', onChange);
};
watchDpr();
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = game;
}
