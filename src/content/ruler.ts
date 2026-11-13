/**
 * 鼠标标尺测距
 *
 * 快捷键进入标尺模式后：
 *   - 按住拖拽生成一条标尺，可同时存在多条（页面坐标，跟随内容滚动）
 *   - Shift 拖拽锁定 45° 倍数（含水平 / 垂直 90°）；S 切换持续锁定
 *   - 点击选中某条标尺后，二级快捷键：
 *       R 旋转 +15°（Shift+R 旋转 +90°）
 *       D 复制该标尺       Delete / Backspace 删除
 *       U 切换 px / mm     C 清空全部            Esc 退出标尺模式
 *   - 端点可拖拽微调，尺身可拖拽平移
 *
 * mm 按 CSS 参考像素换算：1in = 96px = 25.4mm。
 */

interface Ruler {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type DragMode =
  | { kind: 'new' }
  | { kind: 'move'; dx1: number; dy1: number; dx2: number; dy2: number }
  | { kind: 'endpoint'; which: 1 | 2 };

const HIT_LINE = 6;
const HIT_POINT = 9;
const PX_PER_MM = 96 / 25.4;

function lengthOf(ruler: Ruler): number {
  return Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1);
}

function distToSegment(px: number, py: number, ruler: Ruler): number {
  const dx = ruler.x2 - ruler.x1;
  const dy = ruler.y2 - ruler.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ruler.x1, py - ruler.y1);
  let t = ((px - ruler.x1) * dx + (py - ruler.y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ruler.x1 + t * dx), py - (ruler.y1 + t * dy));
}

/** 把终点吸附到 45° 倍数方向（保持长度） */
function snap45(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return { x: x1 + len * Math.cos(snapped), y: y1 + len * Math.sin(snapped) };
}

export class RulerTool {
  private root: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private hintEl: HTMLDivElement | null = null;

  private attached = false;
  private rulers: Ruler[] = [];
  private nextId = 1;
  private selectedId: number | null = null;
  private draft: Ruler | null = null;
  private dragMode: DragMode | null = null;
  private snapMode = false;
  private unit: 'px' | 'mm' = 'px';

  get isOpen(): boolean {
    return this.attached;
  }

  toggle(): void {
    if (this.attached) this.close();
    else this.open();
  }

  open(): void {
    if (this.attached) return;
    this.build();
    this.attached = true;

    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('scroll', this.redraw, true);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  close(): void {
    if (!this.attached) return;
    this.attached = false;

    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('scroll', this.redraw, true);
    window.removeEventListener('resize', this.onResize);

    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.hintEl = null;
    this.rulers = [];
    this.draft = null;
    this.dragMode = null;
    this.selectedId = null;
  }

  destroy(): void {
    this.close();
  }

  // ---------- DOM ----------

  private build(): void {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:fixed',
      'inset:0',
      `z-index:${Number.MAX_SAFE_INTEGER}`,
      'cursor:crosshair',
    ].join(';');

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';

    const hint = document.createElement('div');
    hint.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:16px',
      'transform:translateX(-50%)',
      'padding:8px 14px',
      'border-radius:8px',
      'background:rgba(15,23,42,.9)',
      'color:#fff',
      'font:12px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'pointer-events:none',
      'white-space:nowrap',
      'user-select:none',
    ].join(';');

    root.append(canvas, hint);
    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('contextmenu', (event) => event.preventDefault());
    document.documentElement.appendChild(root);

    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hintEl = hint;
    this.updateHint();
  }

  private onResize = (): void => {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  };

  // ---------- 指针交互 ----------

  private pagePoint(event: PointerEvent): { x: number; y: number } {
    return { x: event.pageX, y: event.pageY };
  }

  private hitTest(x: number, y: number): { ruler: Ruler; endpoint: 1 | 2 | null } | null {
    // 先端点、后尺身，后创建的优先命中
    for (let i = this.rulers.length - 1; i >= 0; i -= 1) {
      const ruler = this.rulers[i];
      if (Math.hypot(x - ruler.x1, y - ruler.y1) <= HIT_POINT) return { ruler, endpoint: 1 };
      if (Math.hypot(x - ruler.x2, y - ruler.y2) <= HIT_POINT) return { ruler, endpoint: 2 };
    }
    for (let i = this.rulers.length - 1; i >= 0; i -= 1) {
      const ruler = this.rulers[i];
      if (distToSegment(x, y, ruler) <= HIT_LINE) return { ruler, endpoint: null };
    }
    return null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = this.pagePoint(event);
    const hit = this.hitTest(x, y);

    if (hit) {
      this.selectedId = hit.ruler.id;
      if (hit.endpoint) {
        this.dragMode = { kind: 'endpoint', which: hit.endpoint };
      } else {
        this.dragMode = {
          kind: 'move',
          dx1: hit.ruler.x1 - x,
          dy1: hit.ruler.y1 - y,
          dx2: hit.ruler.x2 - x,
          dy2: hit.ruler.y2 - y,
        };
      }
    } else {
      this.selectedId = null;
      this.draft = { id: this.nextId++, x1: x, y1: y, x2: x, y2: y };
      this.dragMode = { kind: 'new' };
    }

    try {
      this.root?.setPointerCapture(event.pointerId);
    } catch {
      // 忽略无法捕获指针的情况
    }
    this.redraw();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragMode) return;
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = this.pagePoint(event);
    const snap = event.shiftKey || this.snapMode;

    if (this.dragMode.kind === 'new' && this.draft) {
      this.draft.x2 = x;
      this.draft.y2 = y;
      if (snap) {
        const point = snap45(this.draft.x1, this.draft.y1, x, y);
        this.draft.x2 = point.x;
        this.draft.y2 = point.y;
      }
    } else if (this.dragMode.kind === 'endpoint') {
      const ruler = this.rulers.find((item) => item.id === this.selectedId);
      if (!ruler) return;
      if (this.dragMode.which === 1) {
        ruler.x1 = x;
        ruler.y1 = y;
        if (snap) {
          const point = snap45(ruler.x2, ruler.y2, x, y);
          ruler.x1 = point.x;
          ruler.y1 = point.y;
        }
      } else {
        ruler.x2 = x;
        ruler.y2 = y;
        if (snap) {
          const point = snap45(ruler.x1, ruler.y1, x, y);
          ruler.x2 = point.x;
          ruler.y2 = point.y;
        }
      }
    } else if (this.dragMode.kind === 'move') {
      const ruler = this.rulers.find((item) => item.id === this.selectedId);
      if (!ruler) return;
      ruler.x1 = x + this.dragMode.dx1;
      ruler.y1 = y + this.dragMode.dy1;
      ruler.x2 = x + this.dragMode.dx2;
      ruler.y2 = y + this.dragMode.dy2;
    }
    this.redraw();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.dragMode) return;
    event.preventDefault();
    event.stopPropagation();

    if (this.dragMode.kind === 'new' && this.draft) {
      // 小于 3px 视为误触，直接丢弃
      if (lengthOf(this.draft) >= 3) {
        this.rulers.push(this.draft);
        this.selectedId = this.draft.id;
      }
      this.draft = null;
    }
    this.dragMode = null;
    this.redraw();
  };

  // ---------- 二级快捷键 ----------

  private activeRuler(): Ruler | null {
    return (
      this.rulers.find((item) => item.id === this.selectedId) ??
      this.rulers[this.rulers.length - 1] ??
      null
    );
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();

    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    switch (key) {
      case 'escape':
        handled();
        this.close();
        return;
      case 'u':
        handled();
        this.unit = this.unit === 'px' ? 'mm' : 'px';
        break;
      case 's':
        handled();
        this.snapMode = !this.snapMode;
        break;
      case 'r': {
        handled();
        const ruler = this.activeRuler();
        if (!ruler) return;
        const delta = (event.shiftKey ? 90 : 15) * (Math.PI / 180);
        const cx = (ruler.x1 + ruler.x2) / 2;
        const cy = (ruler.y1 + ruler.y2) / 2;
        const angle = Math.atan2(ruler.y2 - ruler.y1, ruler.x2 - ruler.x1) + delta;
        const half = lengthOf(ruler) / 2;
        ruler.x1 = cx - half * Math.cos(angle);
        ruler.y1 = cy - half * Math.sin(angle);
        ruler.x2 = cx + half * Math.cos(angle);
        ruler.y2 = cy + half * Math.sin(angle);
        break;
      }
      case 'd': {
        handled();
        const ruler = this.activeRuler();
        if (!ruler) return;
        const copy: Ruler = {
          id: this.nextId++,
          x1: ruler.x1 + 16,
          y1: ruler.y1 + 16,
          x2: ruler.x2 + 16,
          y2: ruler.y2 + 16,
        };
        this.rulers.push(copy);
        this.selectedId = copy.id;
        break;
      }
      case 'delete':
      case 'backspace': {
        handled();
        if (this.selectedId == null) return;
        this.rulers = this.rulers.filter((item) => item.id !== this.selectedId);
        this.selectedId = null;
        break;
      }
      case 'c':
        handled();
        this.rulers = [];
        this.selectedId = null;
        break;
      default:
        return;
    }
    this.updateHint();
    this.redraw();
  };

  // ---------- 渲染 ----------

  private updateHint(): void {
    if (!this.hintEl) return;
    this.hintEl.textContent =
      `拖拽新建 · Shift 锁 45°（S${this.snapMode ? '已锁定' : '持续锁定'}） · R 旋转 15°（Shift 90°） · D 复制 · Del 删除 · U 单位（当前 ${this.unit}） · C 清空 · Esc 退出`;
  }

  private formatLength(px: number): string {
    if (this.unit === 'mm') return `${(px / PX_PER_MM).toFixed(1)} mm`;
    return `${Math.round(px)} px`;
  }

  private redraw = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const ruler of this.rulers) {
      this.drawRuler(ctx, ruler, ruler.id === this.selectedId);
    }
    if (this.draft) this.drawRuler(ctx, this.draft, true);
  };

  private drawRuler(ctx: CanvasRenderingContext2D, ruler: Ruler, selected: boolean): void {
    const x1 = ruler.x1 - window.scrollX;
    const y1 = ruler.y1 - window.scrollY;
    const x2 = ruler.x2 - window.scrollX;
    const y2 = ruler.y2 - window.scrollY;
    const len = lengthOf(ruler);
    if (len < 0.5) return;

    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const nx = -uy;
    const ny = ux;
    const color = selected ? '#1677ff' : '#f59e0b';

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = selected ? 2 : 1.5;

    // 主尺线
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 刻度：每 10px 小刻度、50px 中刻度、100px 长刻度
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = 0; d <= len; d += 10) {
      const tick = d % 100 === 0 ? 12 : d % 50 === 0 ? 8 : 4;
      const px = x1 + ux * d;
      const py = y1 + uy * d;
      ctx.moveTo(px, py);
      ctx.lineTo(px + nx * tick, py + ny * tick);
    }
    ctx.stroke();

    // 两端端帽
    ctx.beginPath();
    for (const [px, py] of [
      [x1, y1],
      [x2, y2],
    ]) {
      ctx.moveTo(px - nx * 7, py - ny * 7);
      ctx.lineTo(px + nx * 7, py + ny * 7);
    }
    ctx.stroke();

    // 选中态端点手柄
    if (selected) {
      for (const [px, py] of [
        [x1, y1],
        [x2, y2],
      ]) {
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 中点标签：长度 + 角度
    const text = this.formatLength(len);
    const angle = ((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 360) % 360;
    const label = selected ? `${text} · ${angle.toFixed(0)}°` : text;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const width = ctx.measureText(label).width + 16;
    const height = 22;
    const mx = (x1 + x2) / 2 + nx * 18 - width / 2;
    const my = (y1 + y2) / 2 + ny * 18 - height / 2;

    ctx.fillStyle = 'rgba(15,23,42,.92)';
    ctx.beginPath();
    ctx.roundRect(mx, my, width, height, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx + width / 2, my + height / 2 + 0.5);
  }
}
