import Phaser from 'phaser';
import radioUrl from '../../assets/environment/interactive-vintage-radio-384x256.png?url';

export interface RadioPuzzleHandle {
  element: HTMLDivElement;
  close: () => void;
  getChannel: () => number;
}

interface RadioPuzzleOptions {
  onChannelChange: (channel: number) => void;
  onClose: () => void;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'recall-radio-puzzle-style';
const MESSAGES = [
  '轻轻转动旋钮。',
  '……沙沙的杂音。',
  '……呼呼的风声。',
  '爷爷没有离开你，只是现在在一个叫回南城的地方。',
  '……熟悉的歌声响起。',
];

const CHANNEL_LABELS = ['', '杂音', '风声', '爷爷的声音', '歌声'];

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .recall-radio {
      position: fixed; width: 960px; height: 540px; overflow: hidden;
      z-index: 2147483000; transform-origin: top left;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      color: #f0dfb5; user-select: none; outline: none;
    }
    .recall-radio * { box-sizing: border-box; }
    .recall-radio__backdrop {
      position: absolute; inset: 0;
      backdrop-filter: blur(8px) brightness(.79) saturate(.84);
      -webkit-backdrop-filter: blur(8px) brightness(.79) saturate(.84);
      background: rgba(240, 231, 211, .10);
    }
    .recall-radio__object {
      position: absolute; left: 88px; top: 120px; width: 475px; height: 317px;
      filter: drop-shadow(0 17px 20px rgba(25, 21, 16, .47));
    }
    .recall-radio__image { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
    .recall-radio__knob {
      position: absolute; left: 308px; top: 118px; width: 66px; height: 66px;
      border: 1px solid rgba(245, 207, 131, .42); border-radius: 50%;
      background: transparent;
      box-shadow: inset 0 0 0 2px rgba(76, 40, 18, .20);
      cursor: grab; touch-action: none; transition: box-shadow 130ms ease;
    }
    .recall-radio__knob:hover, .recall-radio__knob:focus-visible {
      outline: none; box-shadow: inset 0 0 0 2px rgba(76, 40, 18, .20), 0 0 0 4px rgba(245, 217, 157, .20), 0 0 16px rgba(247, 211, 133, .30);
    }
    .recall-radio__knob:active { cursor: grabbing; }
    .recall-radio__knob-mark {
      position: absolute; left: calc(50% - 2px); top: 5px; width: 4px; height: 12px;
      border-radius: 3px; background: #ffe7aa;
      box-shadow: 0 0 4px rgba(44, 24, 12, .7);
      transform-origin: 2px 27px; transition: transform 190ms ease-out;
    }
    .recall-radio__panel {
      position: absolute; left: 597px; top: 108px; width: 318px;
      min-height: 323px; padding: 23px 25px 23px;
      border: none; border-radius: 3px;
      background: linear-gradient(135deg, rgba(45, 47, 43, .49), rgba(38, 43, 42, .39));
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 14px 35px rgba(30, 29, 24, .10);
      color: #f0dfb5; -webkit-text-stroke: .4px rgba(20, 19, 17, .95);
      paint-order: stroke fill;
    }
    .recall-radio__title { margin: 0 26px 10px 0; font-size: 20px; line-height: 1.35; font-weight: 600; }
    .recall-radio__lead { margin: 0 0 21px; color: #fff0cf; font-size: 16px; line-height: 1.5; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
    .recall-radio__station {
      display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px;
      color: #ead19f; font: 14px Georgia, "Microsoft YaHei", sans-serif;
    }
    .recall-radio__number { color: #fff1ca; font: 35px/1 Georgia, serif; letter-spacing: .04em; }
    .recall-radio__station-name { margin-left: auto; color: #fff0cf; font-size: 13px; font-weight: 600; }
    .recall-radio__ticks { display: flex; gap: 9px; align-items: center; margin: 8px 0 17px; }
    .recall-radio__tick { width: 31px; height: 4px; border-radius: 4px; background: rgba(245, 220, 169, .27); transition: background 160ms ease, box-shadow 160ms ease; }
    .recall-radio__tick--active { background: #f1d493; box-shadow: 0 0 7px rgba(252, 221, 149, .35); }
    .recall-radio__message {
      min-height: 54px; margin: 0 0 15px; font-size: 18px; line-height: 1.5;
      font-weight: 600; color: #fff2d0; -webkit-text-stroke: .35px rgba(12,12,11,.92);
      text-shadow: 0 1px 2px rgba(0,0,0,.7);
    }
    .recall-radio__help { margin: 0; font-size: 13px; line-height: 1.5; color: #e8d8b5; }
    .recall-radio__close {
      position: absolute; top: 12px; right: 14px;
      border: 0; padding: 2px 7px; background: transparent;
      color: #f0dfb5; font: 27px/1 Arial, sans-serif; cursor: pointer;
      -webkit-text-stroke: 0;
    }
    .recall-radio__close:hover, .recall-radio__close:focus-visible { color: #fff7e4; outline: none; }
  `;
  document.head.append(style);
}

/** Close-up radio with the real artwork and a four-position brass tuning knob. */
export function showRadioPuzzleUI(scene: Phaser.Scene, options: RadioPuzzleOptions): RadioPuzzleHandle {
  installStyle();
  const root = document.createElement('div');
  root.className = 'recall-radio recall-ui-font';
  root.tabIndex = 0;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '外公的收音机');
  root.innerHTML = `
    <div class="recall-radio__backdrop"></div>
    <div class="recall-radio__object">
      <img class="recall-radio__image" src="${radioUrl}" alt="外公的旧收音机">
      <button class="recall-radio__knob" type="button" aria-label="旋转收音机旋钮，切换频道"><span class="recall-radio__knob-mark"></span></button>
    </div>
    <section class="recall-radio__panel">
      <h2 class="recall-radio__title">外公的收音机</h2>
      <p class="recall-radio__lead">轻轻转动旋钮，听听记忆里留下的声音。</p>
      <div class="recall-radio__station"><span>频道</span><strong class="recall-radio__number">—</strong><span>/ 04</span><span class="recall-radio__station-name"></span></div>
      <div class="recall-radio__ticks" aria-hidden="true"><i class="recall-radio__tick"></i><i class="recall-radio__tick"></i><i class="recall-radio__tick"></i><i class="recall-radio__tick"></i></div>
      <p class="recall-radio__message" aria-live="polite">${MESSAGES[0]}</p>
      <p class="recall-radio__help">点击旋钮换台，也可以按住旋钮转动。</p>
      <button class="recall-radio__close" type="button" aria-label="关闭">×</button>
    </section>
  `;

  const knob = root.querySelector<HTMLButtonElement>('.recall-radio__knob')!;
  const marker = root.querySelector<HTMLElement>('.recall-radio__knob-mark')!;
  const number = root.querySelector<HTMLElement>('.recall-radio__number')!;
  const stationName = root.querySelector<HTMLElement>('.recall-radio__station-name')!;
  const message = root.querySelector<HTMLElement>('.recall-radio__message')!;
  const ticks = [...root.querySelectorAll<HTMLElement>('.recall-radio__tick')];
  let channel = 0;
  let closed = false;
  let dragging = false;
  let startAngle = 0;
  let startChannel = 0;
  let startX = 0;
  let startY = 0;

  const position = () => {
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / WIDTH}, ${bounds.height / HEIGHT})`;
  };
  const setChannel = (next: number) => {
    if (closed || next === channel) return;
    channel = next;
    number.textContent = String(channel).padStart(2, '0');
    stationName.textContent = CHANNEL_LABELS[channel];
    message.textContent = MESSAGES[channel];
    marker.style.transform = `rotate(${(channel - 1) * 76 - 112}deg)`;
    ticks.forEach((tick, index) => tick.classList.toggle('recall-radio__tick--active', index + 1 === channel));
    options.onChannelChange(channel);
  };
  const close = (notify = true) => {
    if (closed) return;
    closed = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.remove();
    if (notify) options.onClose();
  };
  const onShutdown = () => close(false);
  const angleOf = (event: PointerEvent) => {
    const bounds = knob.getBoundingClientRect();
    return Math.atan2(event.clientY - (bounds.top + bounds.height / 2), event.clientX - (bounds.left + bounds.width / 2));
  };
  knob.addEventListener('pointerdown', event => {
    dragging = false;
    startX = event.clientX;
    startY = event.clientY;
    startAngle = angleOf(event);
    startChannel = channel || 1;
    knob.setPointerCapture(event.pointerId);
  });
  knob.addEventListener('pointermove', event => {
    if (!knob.hasPointerCapture(event.pointerId)) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) < 9 && !dragging) return;
    dragging = true;
    let delta = angleOf(event) - startAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    const steps = Math.round(delta / (Math.PI / 2));
    setChannel(((startChannel - 1 + steps + 8) % 4) + 1);
  });
  knob.addEventListener('pointerup', event => {
    if (!dragging) setChannel((channel % 4) + 1);
    if (knob.hasPointerCapture(event.pointerId)) knob.releasePointerCapture(event.pointerId);
    dragging = false;
  });
  knob.addEventListener('pointercancel', () => { dragging = false; });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') setChannel((channel % 4) + 1);
    else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') setChannel((((channel || 1) + 2) % 4) + 1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  root.querySelector<HTMLButtonElement>('.recall-radio__close')!.addEventListener('click', () => close());
  root.querySelector<HTMLElement>('.recall-radio__backdrop')!.addEventListener('click', () => close());
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  document.body.append(root);
  position();
  root.focus();
  return { element: root, close, getChannel: () => channel };
}
