import Phaser from 'phaser';

export interface RoomTextEntry {
  label?: string;
  text: string;
}

export interface RoomTextOptions {
  title: string;
  entries: RoomTextEntry[];
  /** A transparent object image, such as the calendar or completed photo. */
  imageUrl?: string;
  imageAlt?: string;
  /** Fit a landscape photo into the shared calendar-style inspect overlay. */
  layout?: 'photo';
  onClose?: () => void;
}

export interface RoomTextHandle {
  element: HTMLDivElement;
  close: () => void;
}

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;
const STYLE_ID = 'recall-room-text-style';
const activeOverlays = new WeakMap<Phaser.Scene, RoomTextHandle>();

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .recall-room-text {
      position: fixed; width: 960px; height: 540px; overflow: hidden;
      z-index: 2147483000; transform-origin: top left;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      user-select: none;
    }
    .recall-room-text * { box-sizing: border-box; }
    .recall-room-text__backdrop {
      position: absolute; inset: 0;
      backdrop-filter: blur(8px) brightness(.79) saturate(.84);
      -webkit-backdrop-filter: blur(8px) brightness(.79) saturate(.84);
      background: rgba(240, 231, 211, .10);
    }
    .recall-room-text__object {
      position: absolute; left: 334px; top: 78px; width: 255px; height: 385px;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    }
    .recall-room-text__object img {
      max-width: 100%; max-height: 100%; object-fit: contain;
      filter: drop-shadow(0 15px 18px rgba(25, 21, 16, .42));
    }
    .recall-room-text__panel {
      position: absolute; left: 597px; top: 64px; width: 318px;
      max-height: 412px; overflow-y: auto;
      padding: 22px 25px 24px;
      border: none; border-radius: 3px;
      background: linear-gradient(135deg, rgba(45, 47, 43, .49), rgba(38, 43, 42, .39));
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 14px 35px rgba(30, 29, 24, .10);
      color: #f0dfb5;
      -webkit-text-stroke: .65px rgba(20, 19, 17, .95);
      paint-order: stroke fill;
      scrollbar-width: thin;
    }
    .recall-room-text__panel--compact { top: 170px; min-height: 155px; }
    .recall-room-text--photo .recall-room-text__backdrop {
      background: transparent;
    }
    .recall-room-text--photo .recall-room-text__object {
      left: 230px; top: 116px; width: 350px; height: 310px;
    }
    .recall-room-text__title {
      margin: 0 34px 16px 0; font-size: 20px; line-height: 1.35;
      font-weight: 600; letter-spacing: .03em;
    }
    .recall-room-text__entry { margin: 0 0 11px; line-height: 1.4; }
    .recall-room-text__entry:last-child { margin-bottom: 0; }
    .recall-room-text__label {
      display: block; margin-bottom: 2px; font-size: 17px; font-weight: 600;
    }
    .recall-room-text__copy {
      display: block; font-size: 18px; line-height: 1.4; font-weight: 600;
      color: #fff2d0; -webkit-text-stroke: .35px rgba(12, 12, 11, .92);
      paint-order: stroke fill; text-shadow: 0 1px 2px rgba(0, 0, 0, .7);
      white-space: pre-line;
    }
    .recall-room-text__close {
      position: absolute; top: 13px; right: 16px;
      border: 0; padding: 2px 7px; background: transparent;
      color: #f0dfb5; font: 27px/1 Arial, sans-serif;
      cursor: pointer; -webkit-text-stroke: 0;
    }
    .recall-room-text__close:hover,
    .recall-room-text__close:focus-visible { color: #fff7e4; outline: none; }
  `;
  document.head.append(style);
}

/** Opens the shared inspect UI over the game's canvas and pauses room movement while reading. */
export function showRoomText(scene: Phaser.Scene, options: RoomTextOptions): RoomTextHandle {
  activeOverlays.get(scene)?.close();
  installStyle();

  const root = document.createElement('div');
  root.className = `recall-room-text${options.layout === 'photo' ? ' recall-room-text--photo' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', options.title);

  const backdrop = document.createElement('div');
  backdrop.className = 'recall-room-text__backdrop';
  root.append(backdrop);

  if (options.imageUrl) {
    const object = document.createElement('div');
    object.className = 'recall-room-text__object';
    const image = document.createElement('img');
    image.src = options.imageUrl;
    image.alt = options.imageAlt ?? options.title;
    object.append(image);
    root.append(object);
  }

  const panel = document.createElement('section');
  panel.className = 'recall-room-text__panel';
  if (options.entries.length <= 1) panel.classList.add('recall-room-text__panel--compact');

  const title = document.createElement('h2');
  title.className = 'recall-room-text__title';
  title.textContent = options.title;
  panel.append(title);

  for (const entry of options.entries) {
    const paragraph = document.createElement('p');
    paragraph.className = 'recall-room-text__entry';
    if (entry.label) {
      const label = document.createElement('strong');
      label.className = 'recall-room-text__label';
      label.textContent = entry.label;
      paragraph.append(label);
    }
    const copy = document.createElement('span');
    copy.className = 'recall-room-text__copy';
    copy.textContent = entry.text;
    paragraph.append(copy);
    panel.append(paragraph);
  }

  const closeButton = document.createElement('button');
  closeButton.className = 'recall-room-text__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '关闭');
  closeButton.textContent = '×';
  panel.append(closeButton);
  root.append(panel);

  const position = () => {
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / BASE_WIDTH}, ${bounds.height / BASE_HEIGHT})`;
  };
  position();
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);

  const wasPaused = scene.scene.isPaused();
  let closed = false;
  const pauseAfterRender = () => {
    if (!closed && scene.scene.isActive()) scene.scene.pause();
  };
  const pauseOnNextRender = () => {
    if (!closed && scene.scene.isActive()) {
      scene.game.events.once(Phaser.Core.Events.POST_RENDER, pauseAfterRender);
    }
  };
  if (!wasPaused) {
    // The puzzle layer was just removed. Wait for its warm camera flash to end
    // and for the room to render before freezing the canvas behind the photo.
    if (options.layout === 'photo') {
      if (scene.cameras.main.flashEffect.isRunning) {
        scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FLASH_COMPLETE, pauseOnNextRender);
      } else {
        pauseOnNextRender();
      }
    } else {
      scene.scene.pause();
    }
  }
  const close = (resume = true) => {
    if (closed) return;
    closed = true;
    scene.cameras.main.off(Phaser.Cameras.Scene2D.Events.FLASH_COMPLETE, pauseOnNextRender);
    scene.game.events.off(Phaser.Core.Events.POST_RENDER, pauseAfterRender);
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.remove();
    activeOverlays.delete(scene);
    if (resume && !wasPaused && scene.scene.isPaused()) scene.scene.resume();
    options.onClose?.();
  };
  const onShutdown = () => close(false);
  backdrop.addEventListener('click', () => close());
  closeButton.addEventListener('click', () => close());
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  document.body.append(root);

  const handle = { element: root, close: () => close() };
  activeOverlays.set(scene, handle);
  return handle;
}

export function isRoomTextOpen(scene: Phaser.Scene): boolean {
  return activeOverlays.has(scene);
}
