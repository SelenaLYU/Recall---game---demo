import Phaser from 'phaser';
import forestBackgroundUrl from '../../assets/environment/森林花海_原场景清晰化_无坡_1920x1080_v2.png?url';

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'recall-forest-loading-style';
const INTRO_MIN_VISIBLE_MS = 4000;
const FOREST_MIN_VISIBLE_MS = 2500;
const FOREST_SCENE_SETTLE_MS = 350;
const FOREST_FADE_MS = 500;

export interface LoadingUIHandle {
  finish(onHidden?: () => void): void;
  destroy(): void;
}

const activeLoaders = new WeakMap<Phaser.Scene, LoadingUIHandle>();

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .recall-forest-loading {
      position: fixed; width: 960px; height: 540px; overflow: hidden;
      z-index: 2147482000; transform-origin: top left;
      pointer-events: none; color: #f3e9d0; background: #17382b;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .recall-forest-loading * { box-sizing: border-box; }
    .recall-forest-loading__image {
      position: absolute; inset: -15px;
      background: url("${forestBackgroundUrl}") center / cover no-repeat;
      filter: blur(4px) brightness(.58) saturate(.72);
      transform: scale(1.035);
    }
    .recall-forest-loading__veil {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(9,22,17,.20), rgba(10,28,21,.48));
    }
    .recall-forest-loading__content {
      position: absolute; left: 0; right: 0; top: 139px;
      display: flex; flex-direction: column; align-items: center;
      text-align: center; text-shadow: 0 2px 10px rgba(0,0,0,.4);
    }
    .recall-forest-loading__flower {
      width: 54px; height: 58px; overflow: visible; margin-bottom: 17px;
      filter: drop-shadow(0 0 11px rgba(243,223,166,.33));
    }
    .recall-forest-loading__flower path {
      fill: rgba(248,242,220,.22); stroke: rgba(255,247,220,.74);
      stroke-width: 1.2;
    }
    .recall-forest-loading__flower circle {
      fill: #d9c187; stroke: #fff5d4; stroke-width: 1;
    }
    .recall-forest-loading__title {
      margin: 0; font-size: 30px; font-weight: 400;
      letter-spacing: .17em; color: #f7edcf;
    }
    .recall-forest-loading__subtitle {
      margin: 10px 0 31px; font-size: 13px;
      letter-spacing: .24em; color: rgba(241,231,205,.73);
    }
    .recall-forest-loading__progress {
      width: 300px; display: flex; align-items: center; gap: 15px;
      color: rgba(253,235,190,.85); font: 13px/1 Georgia, serif;
    }
    .recall-forest-loading__track {
      position: relative; flex: 1; height: 5px; border-radius: 5px;
      background: rgba(249,235,198,.22); overflow: visible;
      box-shadow: 0 1px 5px rgba(10,25,18,.4);
    }
    .recall-forest-loading__fill {
      display: block; width: 0; height: 5px; border-radius: 5px;
      background: linear-gradient(90deg, #b6ad89, #f1dca8, #fff6d8);
      box-shadow: 0 0 8px rgba(254,238,193,.47);
      transition: width 170ms ease-out;
    }
    .recall-forest-loading__percent { min-width: 37px; text-align: right; }
  `;
  document.head.append(style);
}

/** Shows real loader progress, then gently reveals the ready forest scene. */
export function showForestLoadingUI(
  scene: Phaser.Scene,
  title = '正在走进森林',
  subtitle = '循着花香，寻找记忆',
  destroyOnCreate = true,
): LoadingUIHandle {
  const existing = activeLoaders.get(scene);
  if (existing) return existing;
  installStyle();
  const minVisibleMs = destroyOnCreate ? FOREST_MIN_VISIBLE_MS : INTRO_MIN_VISIBLE_MS;
  const shownAt = performance.now();
  const root = document.createElement('div');
  root.className = 'recall-forest-loading';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', `${title}，加载 0%`);
  root.innerHTML = `
    <div class="recall-forest-loading__image"></div>
    <div class="recall-forest-loading__veil"></div>
    <div class="recall-forest-loading__content">
      <svg class="recall-forest-loading__flower" viewBox="0 0 72 76" aria-hidden="true">
        ${[0, 72, 144, 216, 288].map(angle =>
          `<path d="M 36 38 C 22 25 23 12 36 5 C 49 12 50 25 36 38 Z" transform="rotate(${angle} 36 38)" />`
        ).join('')}
        <circle cx="36" cy="38" r="5" />
      </svg>
      <h1 class="recall-forest-loading__title">${title}</h1>
      <p class="recall-forest-loading__subtitle">${subtitle}</p>
      <div class="recall-forest-loading__progress" aria-hidden="true">
        <div class="recall-forest-loading__track"><span class="recall-forest-loading__fill"></span></div>
        <span class="recall-forest-loading__percent">0%</span>
      </div>
    </div>`;

  let destroyed = false;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const onHiddenCallbacks: Array<() => void> = [];
  const position = () => {
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / WIDTH}, ${bounds.height / HEIGHT})`;
  };
  const progress = (value: number) => {
    const amount = Math.max(0, Math.min(1, value));
    const percent = Math.round(amount * 100);
    root.querySelector<HTMLElement>('.recall-forest-loading__fill')!.style.width = `${percent}%`;
    root.querySelector<HTMLElement>('.recall-forest-loading__percent')!.textContent = `${percent}%`;
    root.setAttribute('aria-label', `${title}，加载 ${percent}%`);
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (finishTimer) clearTimeout(finishTimer);
    if (settleTimer) clearTimeout(settleTimer);
    scene.load.off(Phaser.Loader.Events.PROGRESS, progress);
    scene.events.off(Phaser.Scenes.Events.CREATE, onSceneCreated);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    root.remove();
    activeLoaders.delete(scene);
    onHiddenCallbacks.splice(0).forEach(callback => callback());
  };
  const finish = (onHidden?: () => void) => {
    if (destroyed) {
      onHidden?.();
      return;
    }
    if (onHidden) onHiddenCallbacks.push(onHidden);
    if (finishTimer) return;
    const remaining = Math.max(0, minVisibleMs - (performance.now() - shownAt));
    finishTimer = setTimeout(() => {
      root.style.transition = `opacity ${FOREST_FADE_MS}ms ease-in-out`;
      root.style.opacity = '0';
      finishTimer = setTimeout(destroy, FOREST_FADE_MS);
    }, remaining);
  };
  const onSceneCreated = () => {
    progress(1);
    // The forest camera fades in under this cover; reveal it after that fade.
    // A timer avoids depending on a render event that may not fire in a hidden tab.
    settleTimer = setTimeout(() => finish(), FOREST_SCENE_SETTLE_MS);
  };
  document.body.append(root);
  position();
  scene.load.on(Phaser.Loader.Events.PROGRESS, progress);
  if (destroyOnCreate) scene.events.once(Phaser.Scenes.Events.CREATE, onSceneCreated);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  const handle = { finish, destroy };
  activeLoaders.set(scene, handle);
  return handle;
}
