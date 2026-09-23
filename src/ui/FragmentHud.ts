import Phaser from 'phaser';

export type FragmentKind = 'photo' | 'radio' | 'clock';

export interface FragmentHudHandle {
  collect: (kind: FragmentKind) => void;
  destroy: () => void;
  element: HTMLDivElement;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'recall-fragment-hud-style';
const activeHuds = new WeakMap<Phaser.Scene, FragmentHudHandle>();

const PETAL = 'M 36 38 C 24 26 23 12 36 5 C 49 12 48 26 36 38 Z';
const pieces: Record<FragmentKind, number[]> = {
  photo: [0, 60],
  radio: [120, 180],
  clock: [240, 300],
};

function flowerMarkup(): string {
  const outline = [0, 60, 120, 180, 240, 300]
    .map(angle => `<path d="${PETAL}" transform="rotate(${angle} 36 38)" />`)
    .join('');
  const shards = (Object.keys(pieces) as FragmentKind[])
    .map(kind => `<g class="recall-fragment-hud__piece" data-piece="${kind}">
      ${pieces[kind].map(angle => `<g transform="rotate(${angle} 36 38)">
        <path class="recall-fragment-hud__petal" d="${PETAL}" />
        <path class="recall-fragment-hud__vein" d="M 36 33 C 33 25 34 18 36 13" />
      </g>`).join('')}
    </g>`).join('');
  return `<svg class="recall-fragment-hud__flower" viewBox="0 0 72 76" aria-hidden="true">
    <defs>
      <linearGradient id="recall-fragment-petal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fffdf1" stop-opacity=".92" />
        <stop offset=".55" stop-color="#f4e9c9" stop-opacity=".68" />
        <stop offset="1" stop-color="#c8b997" stop-opacity=".46" />
      </linearGradient>
    </defs>
    <g class="recall-fragment-hud__outline">${outline}</g>
    ${shards}
    <circle class="recall-fragment-hud__heart" cx="36" cy="38" r="6" />
    <circle class="recall-fragment-hud__heart-glint" cx="34" cy="36" r="1.5" />
  </svg>`;
}

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .recall-fragment-hud {
      position: fixed; width: 960px; height: 540px; z-index: 1000;
      transform-origin: top left; pointer-events: none; user-select: none;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .recall-fragment-hud * { box-sizing: border-box; }
    .recall-fragment-hud__card {
      position: absolute; bottom: 14px; left: 14px; width: 140px; height: 60px;
      display: flex; align-items: center; gap: 5px; padding: 5px 8px 5px 5px;
      border-radius: 11px 4px 11px 4px;
      border: 1px solid rgba(255,239,205,.18);
      background: linear-gradient(116deg, rgba(25,31,26,.42), rgba(46,47,37,.27));
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
      box-shadow: 0 5px 24px rgba(9,17,14,.15), inset 0 1px rgba(255,255,236,.10);
    }
    .recall-fragment-hud__flower { width: 48px; height: 51px; flex: none; overflow: visible; }
    .recall-fragment-hud__outline path {
      fill: rgba(255,249,228,.035); stroke: rgba(249,234,199,.38);
      stroke-width: .9; stroke-dasharray: 2.1 3.6;
    }
    .recall-fragment-hud__piece {
      opacity: 0; filter: drop-shadow(0 0 0 rgba(255,241,188,0));
      transition: opacity 650ms ease, filter 650ms ease;
    }
    .recall-fragment-hud__piece.is-collected {
      opacity: 1; filter: drop-shadow(0 0 5px rgba(255,239,187,.49));
    }
    .recall-fragment-hud__petal {
      fill: url(#recall-fragment-petal); stroke: rgba(255,248,224,.77); stroke-width: 1.1;
    }
    .recall-fragment-hud__vein {
      fill: none; stroke: rgba(176,154,111,.35); stroke-width: .8;
      stroke-linecap: round;
    }
    .recall-fragment-hud__heart {
      fill: #c8ad6f; stroke: #fff2c9; stroke-width: 1;
      opacity: .19; transition: opacity 650ms ease, filter 650ms ease;
    }
    .recall-fragment-hud__heart-glint {
      fill: #fff8e4; opacity: 0; transition: opacity 650ms ease;
    }
    .recall-fragment-hud.is-complete .recall-fragment-hud__heart {
      opacity: .95; filter: drop-shadow(0 0 7px #f9dfa2);
    }
    .recall-fragment-hud.is-complete .recall-fragment-hud__heart-glint { opacity: .95; }
    .recall-fragment-hud__copy { display: flex; flex-direction: column; min-width: 0; }
    .recall-fragment-hud__label {
      color: rgba(253,239,207,.81); font-size: 10px; letter-spacing: .12em;
      white-space: nowrap; text-shadow: 0 1px 4px rgba(0,0,0,.38);
    }
    .recall-fragment-hud__count {
      color: #f8e8bc; font: 21px/1.15 Georgia, serif; letter-spacing: .04em;
      text-shadow: 0 2px 7px rgba(0,0,0,.44);
    }
    .recall-fragment-hud__count small { color: rgba(247,231,195,.64); font-size: 13px; }
  `;
  document.head.append(style);
}

/** A light, three-piece jasmine that stays in the room's lower-left corner. */
export function createFragmentHud(scene: Phaser.Scene): FragmentHudHandle {
  activeHuds.get(scene)?.destroy();
  installStyle();
  const root = document.createElement('div');
  root.className = 'recall-fragment-hud';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', '记忆碎片 0/3');
  root.innerHTML = `<div class="recall-fragment-hud__card">
    ${flowerMarkup()}
    <div class="recall-fragment-hud__copy">
      <span class="recall-fragment-hud__label">记忆碎片</span>
      <span class="recall-fragment-hud__count"><span data-count>0</span><small> / 3</small></span>
    </div>
  </div>`;
  const collected = new Set<FragmentKind>();
  let destroyed = false;
  const position = () => {
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / WIDTH}, ${bounds.height / HEIGHT})`;
  };
  const onShutdown = () => destroy();
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.remove();
    activeHuds.delete(scene);
  };
  const handle: FragmentHudHandle = {
    element: root,
    destroy,
    collect: kind => {
      if (destroyed || collected.has(kind)) return;
      collected.add(kind);
      root.querySelector(`[data-piece="${kind}"]`)?.classList.add('is-collected');
      root.querySelector<HTMLElement>('[data-count]')!.textContent = String(collected.size);
      root.setAttribute('aria-label', `记忆碎片 ${collected.size}/3`);
      if (collected.size === 3) root.classList.add('is-complete');
    },
  };
  document.body.append(root);
  position();
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  activeHuds.set(scene, handle);
  return handle;
}
