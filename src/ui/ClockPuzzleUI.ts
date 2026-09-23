import Phaser from 'phaser';

interface ClockPuzzleOptions {
  onClose: () => void;
  onSolved: () => void;
}

export interface ClockPuzzleHandle {
  close: () => void;
  element: HTMLDivElement;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'recall-clock-puzzle-style';
const SVG_NS = 'http://www.w3.org/2000/svg';

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .recall-clock {
      position: fixed; width: 960px; height: 540px; overflow: hidden;
      z-index: 2147483000; transform-origin: top left;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      color: #f3e7ca; outline: none; user-select: none;
    }
    .recall-clock * { box-sizing: border-box; }
    .recall-clock__backdrop {
      position: absolute; inset: 0;
      backdrop-filter: blur(7px) brightness(.68) saturate(.78);
      -webkit-backdrop-filter: blur(7px) brightness(.68) saturate(.78);
      background: rgba(22, 27, 24, .18);
    }
    .recall-clock__heading { position: absolute; left: 52px; top: 34px; }
    .recall-clock__heading small {
      display: block; margin-bottom: 5px; color: #cbb98a;
      font: 11px/1.2 Georgia, serif; letter-spacing: .25em;
    }
    .recall-clock__heading h1 {
      margin: 0; font-size: 29px; line-height: 1.2; font-weight: 600;
      color: #f4dfaa; text-shadow: 0 2px 8px rgba(0,0,0,.6);
    }
    .recall-clock__shell {
      position: absolute; left: 181px; top: 111px; width: 358px; height: 358px;
      border-radius: 50%; padding: 17px;
      background: radial-gradient(circle at 42% 36%, #b48b5d 0%, #6f4e32 58%, #39291f 77%, #211b18 100%);
      box-shadow: 0 17px 38px rgba(0,0,0,.48), inset 0 0 0 3px #c6a370,
                  inset 0 0 0 11px #60442f, inset 0 0 0 14px #b99765;
    }
    .recall-clock__face {
      width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
      background: radial-gradient(circle at 42% 34%, #fff8e8 0%, #e8d6aa 69%, #c4ac7b 100%);
      box-shadow: inset 0 0 0 2px #765a39, inset 0 0 16px rgba(93,65,36,.45);
    }
    .recall-clock__dial { width: 100%; height: 100%; touch-action: none; cursor: grab; }
    .recall-clock__dial:active { cursor: grabbing; }
    .recall-clock__tick { stroke: #664e35; stroke-linecap: round; }
    .recall-clock__number { fill: #4b3525; font: 24px Georgia, serif; text-anchor: middle; dominant-baseline: middle; }
    .recall-clock__hand { transform-origin: 160px 160px; transition: transform 100ms ease-out; }
    .recall-clock__hand[data-hand="hour"] { stroke: #463024; stroke-width: 11; stroke-linecap: round; }
    .recall-clock__hand[data-hand="minute"] { stroke: #9a7140; stroke-width: 7; stroke-linecap: round; }
    .recall-clock__hand--active { filter: drop-shadow(0 0 5px rgba(255,228,154,.9)); }
    .recall-clock__hand-hit { stroke: transparent; stroke-width: 30; stroke-linecap: round; cursor: grab; }
    .recall-clock__panel {
      position: absolute; left: 585px; top: 100px; width: 319px;
      min-height: 374px; padding: 27px 30px 25px;
      background: linear-gradient(135deg, rgba(43,48,43,.72), rgba(36,42,39,.60));
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(231,208,163,.23); border-radius: 7px;
      box-shadow: 0 15px 35px rgba(0,0,0,.22);
    }
    .recall-clock__panel-label { color: #d9c79e; font-size: 14px; letter-spacing: .07em; }
    .recall-clock__time {
      margin: 2px 0 18px; font: 48px/1.12 Georgia, serif;
      color: #fff0ca; letter-spacing: .05em;
      text-shadow: 0 2px 9px rgba(0,0,0,.55);
    }
    .recall-clock__help { margin: 0 0 16px; color: #ece0c3; font-size: 14px; line-height: 1.55; }
    .recall-clock__choices { display: flex; gap: 9px; margin-bottom: 16px; }
    .recall-clock__choice {
      flex: 1; padding: 10px 8px; border: 1px solid rgba(228,205,157,.3);
      border-radius: 5px; background: rgba(255,244,213,.08);
      color: #e9d7ae; font: 600 15px Arial, "Microsoft YaHei", sans-serif;
      cursor: pointer;
    }
    .recall-clock__choice[aria-pressed="true"] {
      border-color: #eacb8f; background: rgba(238,206,146,.22);
      box-shadow: 0 0 14px rgba(238,206,146,.12); color: #fff2d3;
    }
    .recall-clock__keys { margin: 0 0 19px; color: #ddd0b0; font-size: 13px; line-height: 1.6; }
    .recall-clock__keys kbd {
      display: inline-block; min-width: 23px; margin: 0 2px; padding: 1px 5px;
      border-radius: 4px; background: rgba(255,247,225,.14);
      color: #fff0c8; font: 600 12px Arial, sans-serif; text-align: center;
    }
    .recall-clock__confirm {
      width: 100%; padding: 11px; border: 1px solid #eed7a4; border-radius: 5px;
      background: linear-gradient(#ecd7a8, #c5a66c); color: #34291d;
      font: 700 16px Arial, "Microsoft YaHei", sans-serif;
      cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.22);
    }
    .recall-clock__confirm:hover { filter: brightness(1.09); }
    .recall-clock__status { min-height: 18px; margin: 11px 0 0; color: #f1c4a5; font-size: 13px; }
    .recall-clock__close {
      position: absolute; right: 40px; top: 29px; padding: 4px 9px;
      border: 0; background: transparent; color: #f3e4bc;
      font: 28px/1 Arial, sans-serif; cursor: pointer;
    }
    .recall-clock__close:hover { color: #fff; }
  `;
  document.head.append(style);
}

/** Close-up clock: drag either hand with the mouse; A/D moves minutes, W/S moves hours. */
export function showClockPuzzleUI(scene: Phaser.Scene, options: ClockPuzzleOptions): ClockPuzzleHandle {
  installStyle();
  const root = document.createElement('div');
  root.className = 'recall-clock';
  root.tabIndex = 0;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '调整老挂钟');
  root.innerHTML = `
    <div class="recall-clock__backdrop"></div>
    <div class="recall-clock__heading"><small>RECALL · MEMORY ROOM</small><h1>老挂钟</h1></div>
    <div class="recall-clock__shell"><div class="recall-clock__face"><svg class="recall-clock__dial" viewBox="0 0 320 320" aria-label="可以拖动指针的钟表"></svg></div></div>
    <section class="recall-clock__panel">
      <div class="recall-clock__panel-label">钟面上的时刻</div>
      <div class="recall-clock__time" aria-live="polite">10:10</div>
      <p class="recall-clock__help">拖动指针调整时间。也可以选择指针后，用键盘慢慢转动。</p>
      <div class="recall-clock__choices">
        <button class="recall-clock__choice" type="button" data-select="hour" aria-pressed="false">时针</button>
        <button class="recall-clock__choice" type="button" data-select="minute" aria-pressed="true">分针</button>
      </div>
      <p class="recall-clock__keys"><kbd>A</kbd>/<kbd>D</kbd> 分针逆/顺转<br><kbd>W</kbd>/<kbd>S</kbd> 时针顺/逆转</p>
      <button class="recall-clock__confirm" type="button">确认时间</button>
      <p class="recall-clock__status" aria-live="polite"></p>
    </section>
    <button class="recall-clock__close" type="button" aria-label="关闭">×</button>
  `;

  const svg = root.querySelector<SVGSVGElement>('.recall-clock__dial')!;
  const makeSvg = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>) => {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    svg.append(element);
    return element;
  };
  makeSvg('circle', { cx: '160', cy: '160', r: '143', fill: 'none', stroke: '#8a6b42', 'stroke-width': '2' });
  for (let i = 0; i < 60; i++) {
    const angle = i * Math.PI / 30;
    const major = i % 5 === 0;
    const r1 = major ? 125 : 133;
    const r2 = 140;
    makeSvg('line', {
      x1: String(160 + Math.sin(angle) * r1), y1: String(160 - Math.cos(angle) * r1),
      x2: String(160 + Math.sin(angle) * r2), y2: String(160 - Math.cos(angle) * r2),
      class: 'recall-clock__tick', 'stroke-width': major ? '3' : '1.4',
    });
  }
  for (let number = 1; number <= 12; number++) {
    const angle = number * Math.PI / 6;
    const text = makeSvg('text', {
      x: String(160 + Math.sin(angle) * 105), y: String(160 - Math.cos(angle) * 105),
      class: 'recall-clock__number',
    });
    text.textContent = String(number);
  }
  const hourHand = makeSvg('line', { x1: '160', y1: '178', x2: '160', y2: '84', class: 'recall-clock__hand', 'data-hand': 'hour' });
  const minuteHand = makeSvg('line', { x1: '160', y1: '183', x2: '160', y2: '49', class: 'recall-clock__hand', 'data-hand': 'minute' });
  makeSvg('line', { x1: '160', y1: '178', x2: '160', y2: '84', class: 'recall-clock__hand-hit', 'data-hand': 'hour' });
  makeSvg('line', { x1: '160', y1: '183', x2: '160', y2: '49', class: 'recall-clock__hand-hit', 'data-hand': 'minute' });
  makeSvg('circle', { cx: '160', cy: '160', r: '10', fill: '#6d4f32', stroke: '#c9a76c', 'stroke-width': '3' });

  const timeText = root.querySelector<HTMLElement>('.recall-clock__time')!;
  const status = root.querySelector<HTMLElement>('.recall-clock__status')!;
  const choices = [...root.querySelectorAll<HTMLButtonElement>('.recall-clock__choice')];
  let hour = 10;
  let minute = 10;
  let selected: 'hour' | 'minute' = 'minute';
  let dragging = false;
  let closed = false;

  const render = () => {
    hourHand.style.transform = `rotate(${((hour % 12) + minute / 60) * 30}deg)`;
    minuteHand.style.transform = `rotate(${minute * 6}deg)`;
    hourHand.classList.toggle('recall-clock__hand--active', selected === 'hour');
    minuteHand.classList.toggle('recall-clock__hand--active', selected === 'minute');
    for (const choice of choices) choice.setAttribute('aria-pressed', String(choice.dataset.select === selected));
    timeText.textContent = `${hour}:${String(minute).padStart(2, '0')}`;
    status.textContent = '';
  };
  const position = () => {
    const bounds = scene.game.canvas.getBoundingClientRect();
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.transform = `scale(${bounds.width / WIDTH}, ${bounds.height / HEIGHT})`;
  };
  const close = (result: 'cancel' | 'solved' | 'shutdown' = 'cancel') => {
    if (closed) return;
    closed = true;
    scene.scale.off(Phaser.Scale.Events.RESIZE, position);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.remove();
    if (result === 'solved') options.onSolved();
    else if (result === 'cancel') options.onClose();
  };
  const onShutdown = () => close('shutdown');

  const setFromPointer = (event: PointerEvent) => {
    const bounds = svg.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    if (selected === 'hour') hour = Math.round(angle / 30) % 12 || 12;
    else minute = (Math.round(angle / 30) * 5) % 60;
    render();
  };
  svg.addEventListener('pointerdown', event => {
    const target = event.target as Element;
    const hand = target.getAttribute('data-hand');
    if (hand === 'hour' || hand === 'minute') selected = hand;
    dragging = true;
    svg.setPointerCapture(event.pointerId);
    setFromPointer(event);
    root.focus();
  });
  svg.addEventListener('pointermove', event => { if (dragging) setFromPointer(event); });
  const stopDragging = () => { dragging = false; };
  svg.addEventListener('pointerup', stopDragging);
  svg.addEventListener('pointercancel', stopDragging);
  for (const choice of choices) {
    choice.addEventListener('click', () => {
      selected = choice.dataset.select as 'hour' | 'minute';
      render();
      root.focus();
    });
  }
  root.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (key === 'a') minute = (minute + 55) % 60;
    else if (key === 'd') minute = (minute + 5) % 60;
    else if (key === 'w') hour = hour % 12 + 1;
    else if (key === 's') hour = (hour + 10) % 12 + 1;
    else if (key === 'escape') { close(); event.preventDefault(); event.stopPropagation(); return; }
    else return;
    event.preventDefault();
    event.stopPropagation();
    render();
  });
  root.querySelector<HTMLButtonElement>('.recall-clock__confirm')!.addEventListener('click', () => {
    if (hour === 4 && minute === 15) close('solved');
    else status.textContent = '钟声没有响起。再试一次。';
  });
  root.querySelector<HTMLButtonElement>('.recall-clock__close')!.addEventListener('click', () => close());
  root.querySelector<HTMLElement>('.recall-clock__backdrop')!.addEventListener('click', () => close());

  position();
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  document.body.append(root);
  root.focus();
  render();
  return { element: root, close: () => close() };
}
