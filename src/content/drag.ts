import type { Point } from '../types';

export interface DragOptions {
  start: Point;
  end: Point;
  duration: number;
  hold: number;
  steps: number;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** 把 Shadow DOM 里扩展自己的元素都设成 pointer-events: none，避免 elementFromPoint 查到它们 */
function ensureExtensionPointerNone(): void {
  const host = document.getElementById('drag-shortcut-root');
  if (!host) return;
  const root = host.shadowRoot;
  if (!root) return;
  const list = root.querySelectorAll<HTMLElement>('.ds-overlay, .ds-panel, .ds-toast, .ds-tip, .ds-highlight');
  for (const el of list) {
    if (el.style.pointerEvents !== 'none') el.style.pointerEvents = 'none';
  }
  // lens / canvas 如果在 attach 中也可能挡
  const lens = root.querySelector<HTMLElement>('.ds-lens');
  const magnifier = root.querySelector<HTMLElement>('.ds-magnifier');
  if (lens && lens.style.pointerEvents !== 'none') lens.style.pointerEvents = 'none';
  if (magnifier && magnifier.style.pointerEvents !== 'none') magnifier.style.pointerEvents = 'none';
}

function elementAt(x: number, y: number): Element {
  ensureExtensionPointerNone();
  return document.elementFromPoint(x, y) ?? document.body;
}

function pointerEvent(type: string, x: number, y: number, buttons: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
  });
}

function mouseEvent(type: string, x: number, y: number, buttons: number): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    detail: type === 'click' ? 1 : 0,
  });
}

export function simulateClick(point: Point): void {
  const target = elementAt(point.x, point.y);
  target.dispatchEvent(pointerEvent('pointerdown', point.x, point.y, 1));
  target.dispatchEvent(mouseEvent('mousedown', point.x, point.y, 1));
  target.dispatchEvent(pointerEvent('pointerup', point.x, point.y, 0));
  target.dispatchEvent(mouseEvent('mouseup', point.x, point.y, 0));
  target.dispatchEvent(mouseEvent('click', point.x, point.y, 0));
}

export async function simulateDrag({ start, end, duration, hold, steps }: DragOptions): Promise<void> {
  const { x: sx, y: sy } = start;
  const { x: ex, y: ey } = end;
  const totalSteps = Math.max(1, Math.round(steps));
  const stepTime = duration / totalSteps;

  // 只按下时查一次 target，后续 move/up 都派发到同一个元素（+ setPointerCapture）
  const target = elementAt(sx, sy);

  target.dispatchEvent(pointerEvent('pointerdown', sx, sy, 1));
  target.dispatchEvent(mouseEvent('mousedown', sx, sy, 1));

  // setPointerCapture 让浏览器把同 pointerId 的事件锁定到这个目标元素
  // 即使 elementFromPoint 在拖动中途返回了别的元素，事件仍然会给这个 target
  try {
    (target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(1);
  } catch {
    // 某些元素可能不支持
  }

  await sleep(hold);

  for (let i = 1; i <= totalSteps; i += 1) {
    const eased = easeInOutCubic(i / totalSteps);
    const x = sx + (ex - sx) * eased;
    const y = sy + (ey - sy) * eased;

    if (i === totalSteps) {
      target.dispatchEvent(pointerEvent('pointerup', x, y, 0));
      target.dispatchEvent(mouseEvent('mouseup', x, y, 0));
      if (Math.hypot(ex - sx, ey - sy) < 2) {
        target.dispatchEvent(mouseEvent('click', x, y, 0));
      }
    } else {
      target.dispatchEvent(pointerEvent('pointermove', x, y, 1));
      target.dispatchEvent(mouseEvent('mousemove', x, y, 1));
    }

    if (i < totalSteps) {
      await sleep(stepTime);
    }
  }

  try {
    (target as Element & { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(1);
  } catch {
    // ignore
  }
}
